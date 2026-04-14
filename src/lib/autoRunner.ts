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

const CREATIVE_TEMPLATES: Template[] = [
  { id: 't1', title: 'AI Trading Bot Earnings', platform: 'Twitter/X',
    prompt: 'AI trading bot dashboard showing real-time profit, $500+ daily earnings, multiple timeframe charts, green indicators, neon accents, cinematic lighting' },
  { id: 't2', title: 'Content Pipeline Automation', platform: 'TikTok',
    prompt: 'Animated workflow: idea → script → video → posting with AI at each step, hours to minutes, dynamic transitions, futuristic aesthetic' },
  { id: 't3', title: 'Marketing Team Replacement', platform: 'Instagram',
    prompt: 'Split screen: left = $5000/month team chaos, right = sleek AI doing same work alone, cost reduction visual, clean modern design' },
  { id: 't4', title: 'Passive Income System', platform: 'YouTube',
    prompt: 'Person relaxing while income notifications pop up, multiple revenue streams (affiliate, digital products, ads), peaceful beach setting' },
  { id: 't5', title: 'AI Copywriting Magic', platform: 'Twitter/X',
    prompt: 'Before/after: blank page → AI generates perfect high-converting copy instantly, real headlines being written in real-time' },
  { id: 't6', title: 'Social Media Domination', platform: 'TikTok',
    prompt: 'Instagram feed growing timelapse: posts scheduled, comments flowing, engagement climbing exponentially via AI automation' },
  { id: 't7', title: 'Email Automation Success', platform: 'LinkedIn',
    prompt: 'Dashboard: email sequences on autopilot, open rates climbing, conversions increasing, AI personalizing each email' },
  { id: 't8', title: 'Video Editing Speed Run', platform: 'Instagram',
    prompt: '60-second transformation: raw footage → fully edited professional video using AI, B-roll auto-selected, transitions applied' },
  { id: 't9', title: 'Personal Brand Building', platform: 'Twitter/X',
    prompt: 'Creator establishing authority: daily posting, audience growing, verification badge appearing, sponsorships rolling in via AI' },
  { id: 't10', title: 'E-Commerce Automation', platform: 'YouTube',
    prompt: 'Shopify store running 24/7 with AI managing descriptions, customer service, inventory, orders, revenue dashboard' },
  { id: 't11', title: 'Influencer Dashboard', platform: 'TikTok',
    prompt: 'Creator watching follower spike, viral video trending, brand deal notifications, AI optimization, celebrating success' },
  { id: 't12', title: 'SEO Automation Blueprint', platform: 'LinkedIn',
    prompt: 'Website ranking: page 5 → page 1 for high-value keywords using AI SEO, traffic shooting up, organic leads multiplying' },
  { id: 't13', title: 'Lead Generation Machine', platform: 'Twitter/X',
    prompt: 'Sales funnel: cold prospects → qualified leads → customers, AI handling each stage, closing deals on autopilot' },
  { id: 't14', title: 'Content Batching Mastery', platform: 'Instagram',
    prompt: 'Creator batching 30 days of content in one afternoon, AI scripting, scheduling, calendar filled, time freedom achieved' },
  { id: 't15', title: 'Podcast Monetization', platform: 'YouTube',
    prompt: 'Podcast workflow: recording → AI transcription → show notes → YouTube → social clips auto-generated, multiple revenue streams' },
  { id: 't16', title: 'Affiliate Marketing Scale', platform: 'TikTok',
    prompt: 'Promoting product through 10 angles simultaneously, each optimized by AI, commission notifications stacking up' },
  { id: 't17', title: 'Crypto Arbitrage Bot', platform: 'YouTube',
    prompt: 'Trading bot detecting arbitrage opportunities across exchanges, executing in milliseconds, profit notifications, balance growing' },
  { id: 't18', title: 'AI UGC Factory Blueprint', platform: 'TikTok',
    prompt: 'AI generating 10+ videos simultaneously, each optimized per platform, brands paying $500-$2k per video, revenue dashboard' },
  { id: 't19', title: 'Polymarket Edge Scanner', platform: 'Twitter/X',
    prompt: 'Prediction market dashboard highlighting pricing inefficiencies, edge opportunities highlighted in real-time, profitable trades executing' },
  { id: 't20', title: 'Kelly Calculator Pro', platform: 'LinkedIn',
    prompt: 'Kelly criterion calculator showing optimal position sizing, replacing guesswork with math, portfolio performance improving dramatically' },
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

    const { data, error } = await supabase
      .from('ugc_creatives')
      .insert({
        user_id: user.id,
        title: template.title,
        platform: template.platform,
        tool: 'Kling',
        status: 'queued', // Start as queued, not draft
        views: 0, ctr: 0, roas: 0,
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

  // Fetch oldest queued creative
  const { data: queued, error } = await supabase
    .from('ugc_creatives')
    .select('id, title, generation_prompt, retry_count, monetization_url')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
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
    const { data: readyItems } = await supabase
      .from('ugc_creatives')
      .select('id, title, monetization_url')
      .in('status', ['ready', 'ready_to_post'])
      .eq('platform_ready', true)
      .order('updated_at', { ascending: true })
      .limit(5)

    if (!readyItems || readyItems.length === 0) return

    log(`Attempting to post ${readyItems.length} ready creative(s) to Twitter`, 'info')

    for (const item of readyItems) {
      try {
        const result = await postToTwitter(item.id)
        if (result.success) {
          globalState.todayPosted += 1
          log(`Auto-posted: ${item.id.slice(0, 8)} → ${result.post_url}`, 'success')

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
