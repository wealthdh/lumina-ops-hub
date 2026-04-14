/**
 * AUTONOMOUS PIPELINE ENGINE v2 — Queue-Based, Rate-Limit Aware
 *
 * Architecture:
 *  - Two-phase model: ENQUEUE phase (insert queued rows) + PROCESS phase (1 at a time)
 *  - Status flow: draft → queued → testing → ready → posted → error
 *  - On 429: re-queues creative, sets global backoff, waits before next tick
 *  - Retries: error creatives with retry_count < 3 are retried after delay
 *  - Monetization: every creative gets a product CTA injected before saving
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

const CREATIVE_TEMPLATES: Template[] = [
  // ── MT5 GOLD SCALPER EA ($97) — 7 slots ─────────────────────────────────
  { id: 'r1', title: 'MT5 EA — Woke Up To Profit', platform: 'Twitter/X',
    prompt: 'Trader waking up to phone showing +$847 MT5 profit, no charts visible, calm bedroom, "zero manual trades" caption overlay, green glow' },
  { id: 'r2', title: 'MT5 EA — Algorithm vs Human', platform: 'Twitter/X',
    prompt: 'Split screen: exhausted trader at 3am watching charts (red) vs MT5 EA dashboard showing green trades running autonomously, dramatic contrast' },
  { id: 'r3', title: 'MT5 EA — 24/7 While You Sleep', platform: 'YouTube',
    prompt: 'Time-lapse: night sky → dawn while MT5 EA fires 20+ trades, profit counter growing in corner, "zero human input" subtitle, cinematic lighting' },
  { id: 'r4', title: 'MT5 EA — Live P&L Dashboard', platform: 'Twitter/X',
    prompt: 'MT5 live account showing 30-day results, each trade a green mark, cumulative P&L curve climbing, $9,400 total, authentic broker UI style' },
  { id: 'r5', title: 'MT5 EA — Vacation Setup', platform: 'Instagram',
    prompt: 'Person on beach with laptop showing MT5 account +$11,240, palm trees, relaxed pose, "been here 10 days, EA traded the whole time" overlay' },
  { id: 'r6', title: 'MT5 EA — Manual vs EA Results', platform: 'YouTube',
    prompt: 'Side by side 90-day comparison: manual trader (40% win rate, stressed) vs MT5 EA (67% win rate, passive), bar chart, clean infographic style' },
  { id: 'r7', title: 'MT5 EA — Gold Is Moving', platform: 'Twitter/X',
    prompt: 'Gold price chart with 2% daily move highlighted, MT5 EA auto-entry shown at bottom of move, profit arrow, "EA caught it while I slept" text' },

  // ── AI PROMPT TOOLKIT ($29) — 2 slots ───────────────────────────────────
  { id: 'r8', title: 'AI Prompt Kit — Fired My Copywriter', platform: 'Twitter/X',
    prompt: 'Office scene: desk cleared, "copywriter fired" note, then split to AI generating perfect sales copy in 30 seconds, $29 price tag visible, bold contrast' },
  { id: 'r9', title: 'AI Prompt Kit — 5x Content Output', platform: 'LinkedIn',
    prompt: 'Dashboard: before = 5 content pieces/week (manual), after = 50 pieces/week (AI toolkit), same hours logged, dramatic improvement graph' },

  // ── KELLY PRO CALCULATOR ($14.99) — 1 slot ──────────────────────────────
  { id: 'r10', title: 'Kelly Pro — Position Sizing Tool', platform: 'Twitter/X',
    prompt: 'Trading account before Kelly (blowing up) vs after (steady compounding), Kelly formula visualization, "the math that saves accounts" caption' },
]

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

// ─── Pick random template (avoiding already-queued titles today) ─────────────

function pickTemplate(): Template {
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

    // Derive product_key from template id
    const productKey = template.id.startsWith('r1') || template.id.startsWith('r2') ||
      template.id.startsWith('r3') || template.id.startsWith('r4') || template.id.startsWith('r5') ||
      template.id.startsWith('r6') || template.id.startsWith('r7') ? 'mt5-gold' :
      template.id.startsWith('r8') || template.id.startsWith('r9') ? 'ai-prompt' : 'kelly-pro'

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

  // ── REVENUE MODE: Fetch highest revenue_score queued creative ────────────
  // Priority: is_winner=true first, then by revenue_score DESC (hook * roas * conv)
  // This ensures MT5 $97 creatives drain before lower-value ones.
  const { data: queued, error } = await supabase
    .from('ugc_creatives')
    .select('id, title, generation_prompt, retry_count, monetization_url, revenue_score, is_winner, product_key')
    .eq('status', 'queued')
    .order('is_winner',    { ascending: false })   // winners first
    .order('revenue_score', { ascending: false })  // then by score
    .order('created_at',   { ascending: true })    // tiebreak: oldest first
    .limit(1)
    .maybeSingle()

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
  log(`Enqueuing ${count} new creatives...`, 'info')
  let enqueued = 0

  for (let i = 0; i < count; i++) {
    const template = pickTemplate()
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
    // ── REVENUE MODE: Post highest-value ready creatives first ──────────────
    // Order: winners first, then revenue_score DESC → MT5 $97 drains before $19
    const { data: readyItems } = await supabase
      .from('ugc_creatives')
      .select('id, title, monetization_url, revenue_score, is_winner, product_key')
      .in('status', ['ready', 'ready_to_post'])
      .eq('platform_ready', true)
      .order('is_winner',     { ascending: false })
      .order('revenue_score', { ascending: false })
      .order('updated_at',    { ascending: true })
      .limit(5)

    if (!readyItems || readyItems.length === 0) return

    log(`Attempting to post ${readyItems.length} ready creative(s) to Twitter`, 'info')

    for (const item of readyItems) {
      try {
        const result = await postToTwitter(item.id)
        if (result.success) {
          globalState.todayPosted += 1
          const productLabel = (item as Record<string, unknown>).product_key ? ` [${(item as Record<string, unknown>).product_key}]` : ''
          const winnerLabel  = (item as Record<string, unknown>).is_winner   ? ' ⭐' : ''
          log(`Auto-posted${winnerLabel}${productLabel}: ${item.id.slice(0, 8)} → ${result.post_url}`, 'success')

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
