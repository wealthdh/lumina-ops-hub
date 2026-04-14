/**
 * AUTONOMOUS PIPELINE ENGINE v3 — Brain-Connected, Reality-Mode Aware
 *
 * Architecture:
 *  - Two-phase model: ENQUEUE phase (insert queued rows) + PROCESS phase (1 at a time)
 *  - Status flow: draft → queued → testing → ready → posted → error
 *  - Config pulled live from auto_runner_config (DB is source of truth)
 *  - Scoring split: creative_score (pre-market) ≠ business_score (post-Stripe only)
 *  - Exploration floor: (1-floor)% winner families + floor% random exploration
 *  - Clone guard: families only cloned after ≥ clone_threshold_conversions REAL conversions
 *  - On 429: re-queues creative, sets global backoff, waits before next tick
 *  - No burst processing — max 1 concurrent Kling request at any time
 */

import { supabase } from './supabase'
import {
  generateAndSaveCreative,
  enqueueCreative,
  getMonetizationTarget,
  injectMonetizationCTA,
  isRateLimited,
  rateLimitRemainingMs,
  updateCreativeStatus,
} from './ugcApi'
import { postToTwitter } from './distributeApi'
import { buildCaption } from './viralEngine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AutoRunnerState {
  running: boolean
  cycleCount: number
  todayGenerated: number
  todayReady: number
  todayPosted: number
  todayErrors: number
  queuedCount: number
  lastCycleAt: string | null
  nextCycleAt: string | null
  rateLimitedUntil: string | null
  log: Array<{ ts: string; msg: string; level: 'info' | 'error' | 'success' | 'warn' }>
  dailyGoal: number
  currentlyProcessing: string | null // creative ID being processed right now
}

interface Template {
  id: string
  title: string
  platform: string
  prompt: string
  hookFamily?: string   // maps to hook_families.id
  productKey?: string   // explicit product override
}

interface HookFamily {
  id: string
  display_name: string
  posting_weight: number
  generation_weight: number
  status: string
  real_conversions?: number
  exploration_eligible?: boolean
}

export interface RunnerConfig {
  use_real_metrics: boolean
  exploration_floor: number           // 0.25 = 25% slots go to exploration families
  clone_threshold_conversions: number // 20 = only clone after 20 real conversions
  max_family_weight: number           // 0.60 = cap any single family
  daily_generation_goal: number
  reality_mode_enabled: boolean
}

const DEFAULT_CONFIG: RunnerConfig = {
  use_real_metrics: true,
  exploration_floor: 0.25,
  clone_threshold_conversions: 20,
  max_family_weight: 0.60,
  daily_generation_goal: 50,
  reality_mode_enabled: true,
}

// ─── Config Cache ─────────────────────────────────────────────────────────────
let configCache: RunnerConfig | null = null
let configCacheTs = 0
const CONFIG_CACHE_TTL = 2 * 60 * 1000 // 2 minutes — shorter so dashboard writes propagate fast

export async function getRunnerConfig(): Promise<RunnerConfig> {
  if (configCache && Date.now() - configCacheTs < CONFIG_CACHE_TTL) {
    return configCache
  }
  try {
    const { data } = await supabase
      .from('auto_runner_config')
      .select('*')
      .eq('id', 'singleton')
      .single()
    if (data) {
      configCache = {
        use_real_metrics:            data.use_real_metrics            ?? DEFAULT_CONFIG.use_real_metrics,
        exploration_floor:           Number(data.exploration_floor)   ?? DEFAULT_CONFIG.exploration_floor,
        clone_threshold_conversions: data.clone_threshold_conversions ?? DEFAULT_CONFIG.clone_threshold_conversions,
        max_family_weight:           Number(data.max_family_weight)   ?? DEFAULT_CONFIG.max_family_weight,
        daily_generation_goal:       data.daily_generation_goal       ?? DEFAULT_CONFIG.daily_generation_goal,
        reality_mode_enabled:        data.reality_mode_enabled        ?? DEFAULT_CONFIG.reality_mode_enabled,
      }
      configCacheTs = Date.now()
      return configCache
    }
  } catch { /* fall through */ }
  return DEFAULT_CONFIG
}

export function invalidateConfigCache(): void {
  configCache = null
  configCacheTs = 0
  familyCache = null
  familyCacheTs = 0
}

// ─── Family Weight Cache ──────────────────────────────────────────────────────
let familyCache: HookFamily[] | null = null
let familyCacheTs = 0
const FAMILY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getActiveFamilies(): Promise<HookFamily[]> {
  if (familyCache && Date.now() - familyCacheTs < FAMILY_CACHE_TTL) {
    return familyCache
  }
  try {
    const { data } = await supabase
      .from('hook_families')
      .select('id, display_name, posting_weight, generation_weight, status, real_conversions, exploration_eligible')
      .gt('posting_weight', 0)
      .order('rank', { ascending: true })
    familyCache = (data || []) as HookFamily[]
    familyCacheTs = Date.now()
    return familyCache
  } catch {
    // Fall back to hard-coded defaults if DB unavailable
    return [
      { id: 'money-while-i-slept',   display_name: 'Money While I Slept',   posting_weight: 0.40, generation_weight: 0.45, status: 'active' },
      { id: 'passive-income-system', display_name: 'Passive Income System', posting_weight: 0.30, generation_weight: 0.30, status: 'active' },
      { id: 'swarm-content-machine', display_name: 'Swarm Content Machine', posting_weight: 0.15, generation_weight: 0.10, status: 'active' },
      { id: 'i-fired-my-role',       display_name: 'I Fired My Role',       posting_weight: 0.10, generation_weight: 0.10, status: 'active' },
      { id: 'kelly-risk-math',       display_name: 'Kelly Risk Math',       posting_weight: 0.05, generation_weight: 0.05, status: 'active' },
    ]
  }
}

// ─── Exploration-aware family picker ─────────────────────────────────────────
// With probability = exploration_floor → pick any exploration_eligible family uniformly.
// With probability = (1 - exploration_floor) → pick by weight from winner families.
async function pickFamilyWithExploration(
  weightKey: 'posting_weight' | 'generation_weight'
): Promise<string | null> {
  const cfg     = await getRunnerConfig()
  const families = await getActiveFamilies()
  if (families.length === 0) return null

  const roll = Math.random()
  if (roll < cfg.exploration_floor) {
    // Exploration slot: pick uniformly from all exploration_eligible families
    const pool = families.filter(f => f.exploration_eligible !== false)
    if (pool.length === 0) return weightedPickFamily(families, weightKey)
    return pool[Math.floor(Math.random() * pool.length)].id
  }

  // Exploit slot: pick by weight (capped at max_family_weight)
  const capped = families.map(f => ({
    ...f,
    [weightKey]: Math.min(f[weightKey], cfg.max_family_weight),
  }))
  return weightedPickFamily(capped, weightKey)
}

// Weighted random pick: returns a family id based on weight
function weightedPickFamily(families: HookFamily[], weightKey: 'posting_weight' | 'generation_weight'): string | null {
  const total = families.reduce((s, f) => s + (f[weightKey] as number), 0)
  if (total <= 0) return null
  let rand = Math.random() * total
  for (const f of families) {
    rand -= (f[weightKey] as number)
    if (rand <= 0) return f.id
  }
  return families[families.length - 1]?.id ?? null
}

interface RunnerOptions {
  intervalMs: number
  dailyGoal: number
  onUpdate: (state: AutoRunnerState) => void
}

// ─── Template Library ────────────────────────────────────────────────────────

// ── REVENUE MODE: Templates are WINNER PATTERNS ONLY ─────────────────────────
// Weighted toward MT5 Gold ($97) — highest revenue per conversion.
// Template selection respects the 70/20/10 revenue split:
//   70% → MT5 Gold Scalper EA ($97)
//   20% → AI Prompt Toolkit ($29) + UGC Swarm ($19)
//   10% → Kelly Pro ($14.99)
// Rotation: 7 MT5 slots, 2 AI/UGC slots, 1 Kelly slot per 10-template cycle.

// ── REVENUE MODE: Templates are WINNER PATTERNS ONLY ─────────────────────────
// Family allocation mirrors hook_families posting_weight:
//   40% → money-while-i-slept (MT5 Gold $97)
//   30% → passive-income-system (MT5 Gold $97)
//   15% → swarm-content-machine (UGC Swarm $19 / AI Prompt $29)
//   10% → i-fired-my-role (AI Prompt $29)
//    5% → kelly-risk-math (Kelly Pro $14.99)
// Templates per family are in separate buckets; pickTemplateForFamily() selects within bucket.

const CREATIVE_TEMPLATES: Template[] = [
  // ── FAMILY: money-while-i-slept — MT5 Gold ($97) ─ 4 template prompts ───
  { id: 'mwis-1', title: 'MT5 EA — Woke Up To Profit', platform: 'tiktok',
    hookFamily: 'money-while-i-slept', productKey: 'mt5-gold',
    prompt: 'Trader waking up to phone showing +$847 MT5 profit, no charts visible, calm bedroom, "zero manual trades" caption overlay, green glow' },
  { id: 'mwis-2', title: 'MT5 EA — 24/7 While You Sleep', platform: 'tiktok',
    hookFamily: 'money-while-i-slept', productKey: 'mt5-gold',
    prompt: 'Time-lapse: night sky → dawn while MT5 EA fires 20+ trades, profit counter growing in corner, "zero human input" subtitle, cinematic lighting' },
  { id: 'mwis-3', title: 'MT5 EA — Vacation Profit Check', platform: 'instagram',
    hookFamily: 'money-while-i-slept', productKey: 'mt5-gold',
    prompt: 'Person on beach with laptop showing MT5 account +$11,240, palm trees, relaxed pose, "been here 10 days, EA traded the whole time" overlay' },
  { id: 'mwis-4', title: 'MT5 EA — Gold Is Moving', platform: 'tiktok',
    hookFamily: 'money-while-i-slept', productKey: 'mt5-gold',
    prompt: 'Gold price chart with 2% daily move highlighted, MT5 EA auto-entry shown at bottom of move, profit arrow, "EA caught it while I slept" text' },

  // ── FAMILY: passive-income-system — MT5 Gold ($97) ─ 3 template prompts ─
  { id: 'pis-1', title: 'MT5 EA — Passive Income Blueprint', platform: 'tiktok',
    hookFamily: 'passive-income-system', productKey: 'mt5-gold',
    prompt: 'Overhead view: neat desk with laptop showing MT5 passive income dashboard, coffee, no stress, "my system makes $278/day automatically" text overlay' },
  { id: 'pis-2', title: 'MT5 EA — System Beats Side Hustles', platform: 'tiktok',
    hookFamily: 'passive-income-system', productKey: 'mt5-gold',
    prompt: 'Side by side: 6 failed side hustles (dropshipping, crypto manual, freelance) all red arrows vs MT5 EA passive system green arrow, $14,700/month callout' },
  { id: 'pis-3', title: 'MT5 EA — 6 Month Compound Results', platform: 'instagram',
    hookFamily: 'passive-income-system', productKey: 'mt5-gold',
    prompt: 'Bar chart growing each month: $6k, $8.9k, $11.4k, $13.7k, $15.2k, $18.4k — MT5 Gold EA compounding results, clean data visualization style' },

  // ── FAMILY: swarm-content-machine — UGC/AI ($19–$29) ─ 2 template prompts
  { id: 'swm-1', title: 'UGC Swarm — 50 Posts From 1', platform: 'tiktok',
    hookFamily: 'swarm-content-machine', productKey: 'ugc-swarm',
    prompt: 'One piece of content exploding into 50 versions across platforms, AI swarm visualization, "I post 50 times without recording once" caption, dynamic motion' },
  { id: 'swm-2', title: 'AI Content — Fire Your Creator', platform: 'tiktok',
    hookFamily: 'swarm-content-machine', productKey: 'ai-prompt',
    prompt: 'Office scene: desk cleared, "content creator fired" note, then split to AI generating perfect UGC in 30 seconds, bold contrast, price tag visible' },

  // ── FAMILY: i-fired-my-role — AI Prompt ($29) ─ 2 template prompts ──────
  { id: 'ifr-1', title: 'AI Prompt Kit — Fired My Copywriter', platform: 'tiktok',
    hookFamily: 'i-fired-my-role', productKey: 'ai-prompt',
    prompt: 'Dramatic desk clean-out scene, "fired my copywriter" note visible, then AI dashboard generating 10 sales emails in 8 seconds, "saved $4,800/month" overlay' },
  { id: 'ifr-2', title: 'AI Prompt Kit — 5x Content Output', platform: 'instagram',
    hookFamily: 'i-fired-my-role', productKey: 'ai-prompt',
    prompt: 'Dashboard: before = 5 content pieces/week (manual, exhausted), after = 50 pieces/week (AI toolkit, relaxed), same hours logged, dramatic improvement graph' },

  // ── FAMILY: kelly-risk-math — Kelly Pro ($14.99) ─ 1 template prompt ────
  { id: 'krm-1', title: 'Kelly Pro — Position Sizing Saves Accounts', platform: 'tiktok',
    hookFamily: 'kelly-risk-math', productKey: 'kelly-pro',
    prompt: 'Trading account before Kelly (blowing up, red) vs after (steady compounding, green), Kelly formula visualization glowing, "the math that saves accounts" caption' },
]

// Templates grouped by family for weighted selection
const TEMPLATES_BY_FAMILY: Record<string, Template[]> = CREATIVE_TEMPLATES.reduce((acc, t) => {
  const fam = t.hookFamily || 'money-while-i-slept'
  acc[fam] = acc[fam] || []
  acc[fam].push(t)
  return acc
}, {} as Record<string, Template[]>)

// ─── Global State ────────────────────────────────────────────────────────────

let globalState: AutoRunnerState = {
  running: false,
  cycleCount: 0,
  todayGenerated: 0,
  todayReady: 0,
  todayPosted: 0,
  todayErrors: 0,
  queuedCount: 0,
  lastCycleAt: null,
  nextCycleAt: null,
  rateLimitedUntil: null,
  log: [],
  dailyGoal: 50,
  currentlyProcessing: null,
}

let tickIntervalId: ReturnType<typeof setInterval> | null = null
let rapidPostIntervalId: ReturnType<typeof setInterval> | null = null
let isProcessing = false // prevent concurrent processing
let lastResetDate = new Date().toDateString()

// ─── Logger ──────────────────────────────────────────────────────────────────

function log(msg: string, level: AutoRunnerState['log'][0]['level'] = 'info'): void {
  const ts = new Date().toISOString().slice(11, 19)
  globalState.log.push({ ts, msg, level })
  if (globalState.log.length > 150) globalState.log = globalState.log.slice(-150)
  const prefix = { error: '[ERROR]', success: '[OK]', warn: '[WARN]', info: '[INFO]' }[level]
  console.log(`[AutoRunner][${ts}] ${prefix} ${msg}`)
}

// ─── Daily Reset ─────────────────────────────────────────────────────────────

function checkAndResetDaily(): void {
  const today = new Date().toDateString()
  if (today !== lastResetDate) {
    globalState.todayGenerated = 0
    globalState.todayReady = 0
    globalState.todayPosted = 0
    globalState.todayErrors = 0
    lastResetDate = today
    log(`Daily reset for ${today}`, 'success')
  }
}

// ─── Refresh DB Counts ────────────────────────────────────────────────────────

export async function getTodayStats() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('ugc_creatives')
      .select('status')
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)

    const all = data || []
    globalState.todayGenerated = all.length
    globalState.todayReady     = all.filter(d => d.status === 'ready').length
    globalState.todayPosted    = all.filter(d => d.status === 'posted').length
    globalState.todayErrors    = all.filter(d => d.status === 'error').length
    globalState.queuedCount    = all.filter(d => d.status === 'queued').length

    return globalState
  } catch (err) {
    log(`getTodayStats error: ${err instanceof Error ? err.message : String(err)}`, 'error')
    return globalState
  }
}

// ─── Refresh queue count (real-time from DB) ─────────────────────────────────

async function refreshQueueCount(): Promise<void> {
  const { count } = await supabase
    .from('ugc_creatives')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
  globalState.queuedCount = count || 0
}

// ─── Pick template: exploration-aware, family generation weights ─────────────

async function pickTemplate(): Promise<Template> {
  try {
    const familyId = await pickFamilyWithExploration('generation_weight')
    if (familyId && TEMPLATES_BY_FAMILY[familyId]?.length) {
      const bucket = TEMPLATES_BY_FAMILY[familyId]
      return bucket[Math.floor(Math.random() * bucket.length)]
    }
    // Family has no template bucket — pick from all templates weighted by family
    if (familyId) {
      const fallback = CREATIVE_TEMPLATES.filter(t => !t.hookFamily || t.hookFamily === familyId)
      if (fallback.length) return fallback[Math.floor(Math.random() * fallback.length)]
    }
  } catch { /* fall through */ }
  // Final fallback: random from all templates
  return CREATIVE_TEMPLATES[Math.floor(Math.random() * CREATIVE_TEMPLATES.length)]
}

// ─── Create Creative Row ──────────────────────────────────────────────────────

async function createCreativeRow(template: Template): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { log('Not authenticated — cannot create creative', 'error'); return null }

    const captionResult = buildCaption({
      title: template.title,
      platform: template.platform,
      prompt: template.prompt,
    })

    // Assign monetization target
    const monetization = getMonetizationTarget(template.title, template.platform)
    // Inject CTA into caption
    const captionWithCTA = injectMonetizationCTA(captionResult.caption, monetization)

    // ── Revenue score for new rows ──────────────────────────────────────────
    const baseRevenueScore = Math.round(captionResult.hookScore * 1)  // No conv yet
    // Mark as winner candidate if hook >= 90
    const isWinnerCandidate = captionResult.hookScore >= 90

    // Derive product_key: use template's explicit productKey or fall back to old logic
    const productKey = template.productKey ||
      (template.id.startsWith('r1') || template.id.startsWith('r2') ||
       template.id.startsWith('r3') || template.id.startsWith('r4') || template.id.startsWith('r5') ||
       template.id.startsWith('r6') || template.id.startsWith('r7') ? 'mt5-gold' :
       template.id.startsWith('r8') || template.id.startsWith('r9') ? 'ai-prompt' : 'kelly-pro')

    const hookFamily = template.hookFamily || null

    const { data, error } = await supabase
      .from('ugc_creatives')
      .insert({
        user_id: user.id,
        title: template.title,
        platform: template.platform,
        tool: 'Kling',
        status: 'queued',
        views: 0, clicks: 0, conversions: 0, ctr: 0, roas: 0,
        revenue_usd: 0, revenue_score: baseRevenueScore,
        is_winner: isWinnerCandidate,
        product_key: productKey,
        hook_family: hookFamily,
        caption: captionWithCTA,
        hooks: captionResult.hooks,
        hook_used: captionResult.hookUsed,
        cta_used: captionResult.ctaUsed,
        hook_score: captionResult.hookScore,
        api_provider: 'kling',
        generation_prompt: template.prompt,
        monetization_url: monetization.url,
        monetization_product: monetization.productName,
        retry_count: 0,
      })
      .select('id')
      .single()

    if (error) { log(`Failed to create row: ${error.message}`, 'error'); return null }
    log(`Queued creative: ${data?.id} (${template.title}) → ${monetization.productName}`, 'success')
    return data?.id || null
  } catch (err) {
    log(`createCreativeRow error: ${err instanceof Error ? err.message : String(err)}`, 'error')
    return null
  }
}

// ─── Process ONE queued creative ─────────────────────────────────────────────
// Picks the oldest `queued` item from DB and runs it through the full pipeline.

async function processNextQueued(onUpdate: (state: AutoRunnerState) => void): Promise<boolean> {
  if (isProcessing) {
    log('Already processing a creative — skipping tick', 'warn')
    return false
  }

  // Check rate limit
  if (isRateLimited()) {
    const remainingMs = rateLimitRemainingMs()
    globalState.rateLimitedUntil = new Date(Date.now() + remainingMs).toISOString()
    log(`Rate limited — waiting ${Math.ceil(remainingMs / 1000)}s`, 'warn')
    onUpdate(globalState)
    return false
  }
  globalState.rateLimitedUntil = null

  // ── EXPLORATION-AWARE FAMILY QUEUE SELECTION ─────────────────────────────
  // Uses exploration_floor from auto_runner_config:
  //   (1-floor)% → pick from top families by weight
  //   floor%     → pick any exploration_eligible family (avoids exploitation collapse)
  let selectedFamilyId: string | null = null
  try {
    selectedFamilyId = await pickFamilyWithExploration('posting_weight')
  } catch { /* use global fallback */ }

  // Try family-scoped fetch first, then fall back to global
  let queued = null
  let error = null

  if (selectedFamilyId) {
    const res = await supabase
      .from('ugc_creatives')
      .select('id, title, generation_prompt, retry_count, monetization_url, revenue_score, is_winner, product_key, hook_family')
      .eq('status', 'queued')
      .eq('hook_family', selectedFamilyId)
      .order('is_winner',    { ascending: false })
      .order('revenue_score', { ascending: false })
      .order('created_at',   { ascending: true })
      .limit(1)
      .maybeSingle()
    queued = res.data
    error = res.error
  }

  // Fallback: global best if family bucket is empty
  if (!queued && !error) {
    const res = await supabase
      .from('ugc_creatives')
      .select('id, title, generation_prompt, retry_count, monetization_url, revenue_score, is_winner, product_key, hook_family')
      .eq('status', 'queued')
      .not('hook_family', 'in', '("other","algo-beats-human")')
      .order('is_winner',    { ascending: false })
      .order('revenue_score', { ascending: false })
      .order('created_at',   { ascending: true })
      .limit(1)
      .maybeSingle()
    queued = res.data
    error = res.error
  }

  if (error) { log(`Queue fetch error: ${error.message}`, 'error'); return false }
  if (!queued) return false // nothing to process

  isProcessing = true
  globalState.currentlyProcessing = queued.id
  onUpdate(globalState)

  log(`Processing: ${queued.id} (${queued.title || 'untitled'}) retry=${queued.retry_count}`, 'info')

  try {
    await generateAndSaveCreative({
      creativeId: queued.id,
      prompt: queued.generation_prompt || queued.title || 'AI automation workflow',
      title: queued.title,
      monetizationUrl: queued.monetization_url,
      duration: '5',
      mode: 'std',
      aspect_ratio: '16:9',
      onPipelineStatus: (status) => {
        log(`Pipeline[${queued.id.slice(0, 8)}]: ${status.message}`, status.rateLimited ? 'warn' : 'info')
      },
    })

    globalState.todayReady += 1
    log(`Ready: ${queued.id}`, 'success')
    onUpdate(globalState)

    // Try to post to Twitter/X
    try {
      const result = await postToTwitter(queued.id)
      if (result.success) {
        globalState.todayPosted += 1
        log(`Posted to Twitter: ${result.post_url}`, 'success')
        // Signal revenue tracking — update DB with posted_at
        await supabase.from('ugc_creatives')
          .update({ status: 'posted', posted_at: new Date().toISOString() })
          .eq('id', queued.id)
        // ─── INCOME TRACKING: create placeholder income entry ──────────────
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('income_entries').insert({
              user_id: user.id,
              source: 'UGC Content',
              amount: 0,  // placeholder — updated when real conversion happens
              description: `Posted: ${queued.title} → ${queued.monetization_url || 'no link'}`,
              entry_date: new Date().toISOString().slice(0, 10),
              is_placeholder: true,
              creative_id: queued.id,
            })
            log(`Income entry created for ${queued.id.slice(0, 8)}`, 'info')
          }
        } catch (incomeErr) {
          log(`Income tracking warn: ${incomeErr instanceof Error ? incomeErr.message : String(incomeErr)}`, 'warn')
        }
      } else {
        log(`Twitter post failed (${result.error}) — keeping as ready`, 'warn')
      }
    } catch (twitterErr) {
      log(`Twitter error: ${twitterErr instanceof Error ? twitterErr.message : String(twitterErr)}`, 'warn')
      // Keep as ready — manual queue
    }

    onUpdate(globalState)
    return true

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const isRL = (err as { isRateLimit?: boolean }).isRateLimit

    if (isRL) {
      // Rate limit: creative was already re-queued by generateAndSaveCreative
      globalState.rateLimitedUntil = new Date(Date.now() + rateLimitRemainingMs()).toISOString()
      log(`Rate limit during processing — creative re-queued, waiting`, 'warn')
    } else {
      globalState.todayErrors += 1
      log(`Processing failed: ${errMsg}`, 'error')
    }

    onUpdate(globalState)
    return false

  } finally {
    isProcessing = false
    globalState.currentlyProcessing = null
    await refreshQueueCount()
    onUpdate(globalState)
  }
}

// ─── FAILSAFE: Fix stuck 'testing' creatives ────────────────────────────────

async function fixStuckCreatives(): Promise<void> {
  try {
    // Testing with video → ready
    const { data: stuck } = await supabase
      .from('ugc_creatives')
      .select('id')
      .eq('status', 'testing')
      .not('video_url', 'is', null)

    for (const row of stuck || []) {
      await updateCreativeStatus(row.id, 'ready')
      log(`FAILSAFE: stuck testing+video ${row.id.slice(0, 8)} → ready`, 'success')
    }

    // Testing without video, older than 3 minutes → back to queued if retry_count < 3
    const threeMinAgo = new Date(Date.now() - 180_000).toISOString()
    const { data: stale } = await supabase
      .from('ugc_creatives')
      .select('id, retry_count')
      .eq('status', 'testing')
      .is('video_url', null)
      .lt('updated_at', threeMinAgo)

    for (const row of stale || []) {
      const newStatus = (row.retry_count || 0) < 3 ? 'queued' : 'error'
      await updateCreativeStatus(row.id, newStatus, { error_reason: 'Processing timeout' })
      log(`FAILSAFE: stale testing ${row.id.slice(0, 8)} → ${newStatus}`, newStatus === 'error' ? 'error' : 'warn')
    }

    // ready_to_post → treat as ready (same display, no action needed)
    const { data: rtp } = await supabase
      .from('ugc_creatives')
      .select('id')
      .eq('status', 'ready_to_post')

    for (const row of rtp || []) {
      await updateCreativeStatus(row.id, 'ready')
      log(`FAILSAFE: ready_to_post ${row.id.slice(0, 8)} → ready`, 'info')
    }

    // Self-heal: if isProcessing is stuck for > 10 min, reset it
    // (catches crashes that left the lock engaged)
    if (isProcessing && globalState.currentlyProcessing) {
      const { data: proc } = await supabase
        .from('ugc_creatives')
        .select('status, updated_at')
        .eq('id', globalState.currentlyProcessing)
        .single()
      if (proc && proc.status !== 'testing') {
        log(`SELF-HEAL: isProcessing lock was stuck — resetting`, 'warn')
        isProcessing = false
        globalState.currentlyProcessing = null
      }
    }

  } catch (err) {
    log(`fixStuck error: ${err instanceof Error ? err.message : String(err)}`, 'warn')
  }
}

// ─── RETRY ENGINE: Re-queue errored creatives ────────────────────────────────

async function retryErroredCreatives(): Promise<void> {
  try {
    const tenMinAgo = new Date(Date.now() - 600_000).toISOString()

    // Find error creatives with retry_count < 3, not recently updated
    const { data: errored } = await supabase
      .from('ugc_creatives')
      .select('id, retry_count, title')
      .eq('status', 'error')
      .lt('retry_count', 3)
      .lt('updated_at', tenMinAgo)
      .order('updated_at', { ascending: true })
      .limit(5)

    for (const row of errored || []) {
      await updateCreativeStatus(row.id, 'queued')
      log(`Retry: ${row.id.slice(0, 8)} (${row.title || 'untitled'}) attempt ${(row.retry_count || 0) + 1}/3`, 'warn')
    }
  } catch {
    // ignore
  }
}

// ─── ENQUEUE PHASE: Add new creatives to queue ───────────────────────────────

async function enqueueNewBatch(count: number, onUpdate: (state: AutoRunnerState) => void): Promise<void> {
  log(`Enqueuing ${count} new creatives (family-weighted)...`, 'info')
  let enqueued = 0

  for (let i = 0; i < count; i++) {
    const template = await pickTemplate()  // family-weighted async pick
    const id = await createCreativeRow(template)
    if (id) {
      globalState.todayGenerated += 1
      enqueued++
    }
  }

  await refreshQueueCount()
  log(`Enqueued ${enqueued}/${count} creatives`, enqueued > 0 ? 'success' : 'warn')
  onUpdate(globalState)
}

// ─── Main Tick ───────────────────────────────────────────────────────────────
// Called every intervalMs. Does:
//   1. Fix any stuck creatives
//   2. Re-queue eligible error creatives
//   3. If queue is low, enqueue a new batch
//   4. Process one queued creative (unless rate-limited)

async function tick(onUpdate: (state: AutoRunnerState) => void): Promise<void> {
  if (!globalState.running) return
  checkAndResetDaily()

  globalState.cycleCount += 1
  globalState.lastCycleAt = new Date().toISOString()
  globalState.nextCycleAt = new Date(Date.now() + 900_000).toISOString()

  log(`Tick ${globalState.cycleCount}`, 'info')

  // 1. Failsafe cleanup
  await fixStuckCreatives()

  // 2. Retry errored (with retry budget)
  await retryErroredCreatives()

  // 3. Refresh queue count
  await refreshQueueCount()
  onUpdate(globalState)

  // 4. If queue is empty and daily goal not reached, enqueue batch
  // Pull daily goal live from DB config so dashboard changes take effect immediately
  try {
    const cfg = await getRunnerConfig()
    globalState.dailyGoal = cfg.daily_generation_goal
  } catch { /* keep existing */ }

  if (globalState.queuedCount === 0 && globalState.todayPosted < globalState.dailyGoal) {
    await enqueueNewBatch(3, onUpdate)
  }

  // 5. Post existing READY creatives first (fast — no Kling needed)
  await postReadyCreatives(onUpdate)

  // 6. Process ONE queued creative via Kling (no bursts, respects rate limit)
  if (!isRateLimited()) {
    await processNextQueued(onUpdate)
  } else {
    const ms = rateLimitRemainingMs()
    log(`Rate limited — skipping Kling for ${Math.ceil(ms / 1000)}s (posting ready items unaffected)`, 'warn')
  }

  log(`Tick done: queued=${globalState.queuedCount} ready=${globalState.todayReady} posted=${globalState.todayPosted}`, 'success')
  onUpdate(globalState)
}

// ─── POST EXISTING READY CREATIVES ───────────────────────────────────────────
// Drains up to 5 ready/ready_to_post creatives per tick via Twitter posting
// Does NOT touch Kling — zero rate-limit risk

async function postReadyCreatives(onUpdate: (state: AutoRunnerState) => void): Promise<void> {
  if (isProcessing) return  // don't conflict with active Kling job

  try {
    // ── EXPLORATION-AWARE READY POSTING ──────────────────────────────────
    // Same exploration_floor logic as processNextQueued — keeps post distribution honest.
    let selectedFamilyId: string | null = null
    try {
      selectedFamilyId = await pickFamilyWithExploration('posting_weight')
    } catch { /* fall through */ }

    let readyQuery = supabase
      .from('ugc_creatives')
      .select('id, title, monetization_url, revenue_score, is_winner, product_key, hook_family')
      .in('status', ['ready', 'ready_to_post'])
      .eq('platform_ready', true)
      .order('is_winner',     { ascending: false })
      .order('revenue_score', { ascending: false })
      .order('updated_at',    { ascending: true })
      .limit(5)

    // Prefer selected family but allow fallback
    if (selectedFamilyId) {
      readyQuery = readyQuery.eq('hook_family', selectedFamilyId)
    }

    let { data: readyItems } = await readyQuery

    // Fallback: if no items in selected family, pull from global ready queue
    if ((!readyItems || readyItems.length === 0) && selectedFamilyId) {
      const { data: fallback } = await supabase
        .from('ugc_creatives')
        .select('id, title, monetization_url, revenue_score, is_winner, product_key, hook_family')
        .in('status', ['ready', 'ready_to_post'])
        .eq('platform_ready', true)
        .order('is_winner',     { ascending: false })
        .order('revenue_score', { ascending: false })
        .order('updated_at',    { ascending: true })
        .limit(5)
      readyItems = fallback
    }

    if (!readyItems || readyItems.length === 0) return

    log(`Attempting to post ${readyItems.length} ready creative(s) to Twitter`, 'info')

    for (const item of readyItems) {
      try {
        const result = await postToTwitter(item.id)
        if (result.success) {
          globalState.todayPosted += 1
          const r = item as Record<string, unknown>
          const productLabel = r.product_key  ? ` [${r.product_key}]` : ''
          const winnerLabel  = r.is_winner    ? ' ⭐' : ''
          const familyLabel  = r.hook_family  ? ` {${(r.hook_family as string).split('-').map((w: string) => w[0]).join('')}}` : ''
          log(`Auto-posted${winnerLabel}${productLabel}${familyLabel}: ${item.id.slice(0, 8)} → ${result.post_url}`, 'success')

          await supabase.from('ugc_creatives')
            .update({ status: 'posted', posted_at: new Date().toISOString() })
            .eq('id', item.id)

          // Income tracking
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await supabase.from('income_entries').insert({
                user_id: user.id,
                source: 'UGC Content',
                amount: 0,
                description: `Auto-posted: ${item.title} → ${item.monetization_url || 'no link'}`,
                entry_date: new Date().toISOString().slice(0, 10),
                is_placeholder: true,
                creative_id: item.id,
              })
            }
          } catch { /* non-fatal */ }

        } else {
          log(`Twitter unavailable for ${item.id.slice(0, 8)}: ${result.error}`, 'warn')
          break  // Stop trying if Twitter is down
        }
      } catch (err) {
        log(`Post error ${item.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`, 'warn')
        break
      }
    }

    onUpdate(globalState)
  } catch (err) {
    log(`postReadyCreatives error: ${err instanceof Error ? err.message : String(err)}`, 'warn')
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────

export interface AutoRunnerController {
  stop: () => void
  getState: () => AutoRunnerState
  runCycleManually: () => Promise<void>
  enqueueNow: (count?: number) => Promise<void>
}

export function startAutoRunner(opts: RunnerOptions): AutoRunnerController {
  if (globalState.running) {
    log('Already running', 'warn')
    return {
      stop: () => {},
      getState: () => globalState,
      runCycleManually: async () => {},
      enqueueNow: async () => {},
    }
  }

  globalState.running = true
  globalState.dailyGoal = opts.dailyGoal
  globalState.cycleCount = 0
  globalState.log = []

  getTodayStats().then(() => opts.onUpdate(globalState))
  log(`Queue runner started — interval: ${opts.intervalMs / 1000}s, goal: ${opts.dailyGoal}/day`, 'success')

  // Run first tick immediately
  tick(opts.onUpdate).catch(err =>
    log(`First tick error: ${err instanceof Error ? err.message : String(err)}`, 'error')
  )

  // Schedule recurring ticks (Kling generation — every 15 min)
  tickIntervalId = setInterval(() => {
    if (globalState.running) {
      tick(opts.onUpdate).catch(err =>
        log(`Tick error: ${err instanceof Error ? err.message : String(err)}`, 'error')
      )
    }
  }, opts.intervalMs)

  // Rapid-post interval — every 3 min, drains ready creatives via Twitter only
  rapidPostIntervalId = setInterval(() => {
    if (globalState.running) {
      postReadyCreatives(opts.onUpdate).catch(err =>
        log(`Rapid-post error: ${err instanceof Error ? err.message : String(err)}`, 'warn')
      )
      fixStuckCreatives().catch(() => {})
    }
  }, 180_000) // 3 minutes

  return {
    stop() {
      globalState.running = false
      if (tickIntervalId) { clearInterval(tickIntervalId); tickIntervalId = null }
      if (rapidPostIntervalId) { clearInterval(rapidPostIntervalId); rapidPostIntervalId = null }
      log('Runner stopped', 'success')
      opts.onUpdate(globalState)
    },
    getState: () => globalState,
    runCycleManually: () => tick(opts.onUpdate),
    enqueueNow: (count = 3) => enqueueNewBatch(count, opts.onUpdate),
  }
}

export function stopAutoRunner(): void {
  if (tickIntervalId) { clearInterval(tickIntervalId); tickIntervalId = null }
  globalState.running = false
}

export function getAutoRunnerState(): AutoRunnerState { return globalState }

export function resetAutoRunnerState(): void {
  globalState = {
    running: false, cycleCount: 0,
    todayGenerated: 0, todayReady: 0, todayPosted: 0, todayErrors: 0, queuedCount: 0,
    lastCycleAt: null, nextCycleAt: null, rateLimitedUntil: null,
    log: [], dailyGoal: 50, currentlyProcessing: null,
  }
  lastResetDate = new Date().toDateString()
}

// ─── Exported alias for ContentSwarm hook ───────────────────────────────────
export { enqueueCreative }

// ─── runCycle alias for backward compat ─────────────────────────────────────
export const runCycle = (onUpdate: (state: AutoRunnerState) => void) => tick(onUpdate)
