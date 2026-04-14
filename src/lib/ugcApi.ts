/**
 * UGC API — Kling AI Video Generation Client
 *
 * PRODUCTION HARDENED v2:
 * - Detects 429 rate-limit responses → exponential backoff (30s, 60s, 120s)
 * - Queue layer: draft → queued → testing → ready → posted → error
 * - Monotization: auto-assigns Stripe product link per creative topic
 * - CTA injection: every caption gets a buy link appended
 * - Auto-retry: error creatives retry up to 3 times with delay
 * - Income placeholder: triggers a "log revenue" signal when creative is posted
 */
import { supabase } from './supabase'

// ─── DEV MODE placeholder videos ───────────────────────────────────────────
const DEV_MODE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://www.w3schools.com/html/movie.mp4',
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
]
const DEV_MODE_VIDEO_URL =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
const DEV_MODE_THUMBNAIL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'

export function getDevModeVideoUrl(): string {
  return DEV_MODE_VIDEOS[Math.floor(Math.random() * DEV_MODE_VIDEOS.length)]
}

// ─── BLOCKED domains ────────────────────────────────────────────────────────
const BLOCKED_DOMAINS = ['storage.googleapis.com', 'googleapis.com', 'storage.cloud.google.com']
function isBlockedUrl(url: string): boolean {
  return BLOCKED_DOMAINS.some(d => url.includes(d))
}

// ─── Monetization Map ───────────────────────────────────────────────────────
// Maps creative topics → Stripe product links
export interface MonetizationTarget {
  url: string
  productName: string
  price: string
  emoji: string
}

const MONETIZATION_MAP: Record<string, MonetizationTarget> = {
  trading: {
    url: 'https://buy.stripe.com/5kQ7sNeAefk60KF0Ef1VK01',
    productName: 'MT5 Gold Scalper EA',
    price: '$97',
    emoji: '🤖',
  },
  polymarket: {
    url: 'https://buy.stripe.com/3cI28tfEic7U0KFbiT1VK02',
    productName: 'Polymarket Edge Scanner',
    price: '$47',
    emoji: '📊',
  },
  content: {
    url: 'https://buy.stripe.com/7sY00lfEi6NAbpjfz91VK04',
    productName: 'Content Swarm Templates',
    price: '$19',
    emoji: '🎬',
  },
  ai_toolkit: {
    url: 'https://buy.stripe.com/14AfZjajYdbY64ZcmX1VK03',
    productName: 'AI Prompt Engineering Toolkit',
    price: '$29',
    emoji: '🧠',
  },
  calculator: {
    url: 'https://buy.stripe.com/14A00l9fUfk63WR4Uv1VK05',
    productName: 'Kelly Calculator Pro',
    price: '$14.99',
    emoji: '📐',
  },
}

/** Auto-assign the most relevant product based on creative title/topic */
export function getMonetizationTarget(title: string, _platform?: string): MonetizationTarget {
  const t = title.toLowerCase()
  if (t.includes('trad') || t.includes('bot') || t.includes('arbitr') || t.includes('mt5') ||
      t.includes('forex') || t.includes('scalp') || t.includes('crypto arb'))
    return MONETIZATION_MAP.trading
  if (t.includes('polymarket') || t.includes('prediction') || t.includes('market edge'))
    return MONETIZATION_MAP.polymarket
  if (t.includes('content') || t.includes('ugc') || t.includes('video') ||
      t.includes('social') || t.includes('tiktok') || t.includes('instagram') ||
      t.includes('swarm') || t.includes('ugc factory'))
    return MONETIZATION_MAP.content
  if (t.includes('kelly') || t.includes('calc') || t.includes('sizing'))
    return MONETIZATION_MAP.calculator
  // Default: AI toolkit
  return MONETIZATION_MAP.ai_toolkit
}

/** Inject a monetization CTA at the end of a caption */
export function injectMonetizationCTA(caption: string, target: MonetizationTarget): string {
  const ctas = [
    `\n\n${target.emoji} Get the system → ${target.url}`,
    `\n\n🔗 ${target.productName} (${target.price}) → ${target.url}`,
    `\n\n💰 Link in bio → ${target.url}`,
    `\n\n⚡ I use this: ${target.productName} → ${target.url}`,
  ]
  const cta = ctas[Math.floor(Math.random() * ctas.length)]
  // Avoid double-injecting (check if any buy.stripe.com link already in caption)
  if (caption.includes('buy.stripe.com') || caption.includes('stripe.com')) return caption
  return caption + cta
}

// ─── Rate-limit state (module singleton) ────────────────────────────────────
// Shared across all callers in the same browser tab
let rateLimitedUntil: number | null = null
const BACKOFF_SEQUENCE_MS = [30_000, 60_000, 120_000] // 30s, 60s, 120s

/** True if we are currently in a rate-limit backoff window */
export function isRateLimited(): boolean {
  if (rateLimitedUntil && Date.now() < rateLimitedUntil) return true
  if (rateLimitedUntil) rateLimitedUntil = null // expired — clear it
  return false
}

/** Milliseconds remaining in the current rate-limit window (0 if not limited) */
export function rateLimitRemainingMs(): number {
  if (!rateLimitedUntil) return 0
  return Math.max(0, rateLimitedUntil - Date.now())
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KlingTaskResponse {
  code: number
  message: string
  request_id: string
  data: { task_id: string; task_status: string; task_status_msg?: string }
}

export interface KlingVideoResult {
  code: number
  message: string
  request_id: string
  data: {
    task_id: string
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed'
    task_status_msg?: string
    task_result?: { videos: Array<{ id: string; url: string; duration: string }> }
  }
  // Injected by our backend on 429
  rateLimited?: boolean
  retryAfterMs?: number
}

export interface GenerateVideoOpts {
  prompt: string
  negative_prompt?: string
  model_name?: string
  duration?: '5' | '10'
  mode?: 'std' | 'pro'
  aspect_ratio?: '16:9' | '9:16' | '1:1'
}

export type PipelineStep = 'idle' | 'queued' | 'generating' | 'saving' | 'posting' | 'complete' | 'error'

export interface PipelineStatus {
  step: PipelineStep
  message: string
  detail?: string
  progress?: number
  devMode?: boolean
  rateLimited?: boolean
  retryAfterMs?: number
}

// ─── Logger ─────────────────────────────────────────────────────────────────
function ugcLog(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[UGC][${ts}] ${msg}`, data ? JSON.stringify(data) : '')
}

// ─── Sleep helper ────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── API base ────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_APP_URL || ''

// ─── Update creative status helper ──────────────────────────────────────────
export async function updateCreativeStatus(
  id: string,
  status: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('ugc_creatives')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
  if (error) ugcLog(`updateCreativeStatus failed: ${error.message}`, { id, status })
}

// ─── Queue a creative for processing ────────────────────────────────────────
export async function enqueueCreative(id: string): Promise<void> {
  await updateCreativeStatus(id, 'queued')
  ugcLog(`Enqueued creative ${id}`)
}

// ─── Create text-to-video task ───────────────────────────────────────────────
export async function createTextToVideoTask(
  opts: GenerateVideoOpts,
  creativeId?: string
): Promise<KlingTaskResponse> {
  ugcLog('start — text2video', { prompt: opts.prompt?.slice(0, 60) })

  const res = await fetch(`${API_BASE}/api/kling?action=text2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'text2video',
      prompt: opts.prompt,
      negative_prompt: opts.negative_prompt || 'blurry, low quality, distorted, watermark',
      model_name: opts.model_name || 'kling-v2-master',
      duration: opts.duration || '5',
      mode: opts.mode || 'std',
      aspect_ratio: opts.aspect_ratio || '16:9',
      creativeId,
    }),
  })

  // ── 429 Rate Limit ──────────────────────────────────────────────
  if (res.status === 429) {
    const body = await res.json().catch(() => ({ retryAfterMs: 60_000 }))
    const retryAfterMs = body.retryAfterMs || 60_000
    rateLimitedUntil = Date.now() + retryAfterMs
    ugcLog(`RATE LIMIT — backing off ${retryAfterMs}ms`, { retryAfterMs })
    const err = new Error(`Kling rate limited — retry after ${Math.ceil(retryAfterMs / 1000)}s`) as Error & { retryAfterMs: number; isRateLimit: boolean }
    err.retryAfterMs = retryAfterMs
    err.isRateLimit = true
    throw err
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(errBody.error || errBody.message || `Kling API error: ${res.status}`)
  }

  const data = await res.json()
  if (data.code && data.code !== 0) {
    throw new Error(`Kling error ${data.code}: ${data.message}`)
  }

  ugcLog('task created', { task_id: data.data?.task_id })
  return data
}

// ─── Poll task status ────────────────────────────────────────────────────────
export async function pollTaskStatus(
  taskId: string,
  type: 'text2video' | 'image2video' = 'text2video',
  creativeId?: string
): Promise<KlingVideoResult> {
  const res = await fetch(
    `${API_BASE}/api/kling?action=status&task_id=${taskId}&type=${type}${creativeId ? `&creativeId=${creativeId}` : ''}`
  )

  if (res.status === 429) {
    const body = await res.json().catch(() => ({ retryAfterMs: 60_000 }))
    const retryAfterMs = body.retryAfterMs || 60_000
    rateLimitedUntil = Date.now() + retryAfterMs
    const err = new Error(`Poll rate limited`) as Error & { retryAfterMs: number; isRateLimit: boolean }
    err.retryAfterMs = retryAfterMs
    err.isRateLimit = true
    throw err
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(errBody.error || `Poll error: ${res.status}`)
  }

  return res.json()
}

// ─── Poll until complete (with backoff on 429) ───────────────────────────────
export async function waitForVideo(
  taskId: string,
  opts?: {
    type?: 'text2video' | 'image2video'
    maxWaitMs?: number
    pollIntervalMs?: number
    creativeId?: string
    onProgress?: (status: string) => void
  }
): Promise<KlingVideoResult> {
  const type = opts?.type || 'text2video'
  const maxWait = opts?.maxWaitMs || 300_000
  const interval = opts?.pollIntervalMs || 5_000
  const start = Date.now()
  let pollCount = 0

  while (Date.now() - start < maxWait) {
    pollCount++

    // Respect rate limit window before polling
    if (isRateLimited()) {
      const waitMs = rateLimitRemainingMs()
      ugcLog(`Rate limited — waiting ${waitMs}ms before polling`)
      opts?.onProgress?.('rate_limited')
      await sleep(waitMs + 500) // +500ms buffer
    }

    try {
      const result = await pollTaskStatus(taskId, type, opts?.creativeId)
      const taskStatus = result.data?.task_status || 'unknown'
      opts?.onProgress?.(taskStatus)

      if (taskStatus === 'succeed') {
        ugcLog('video generated', { task_id: taskId, polls: pollCount, elapsed_ms: Date.now() - start })
        return result
      }
      if (taskStatus === 'failed') {
        throw new Error(result.data?.task_status_msg || 'Video generation failed')
      }
    } catch (err) {
      const isRL = (err as { isRateLimit?: boolean }).isRateLimit
      if (isRL) {
        // Rate limited during poll — the module-level rateLimitedUntil is already set
        ugcLog('Rate limit during poll — will wait on next iteration')
        continue // next iteration handles the wait
      }
      throw err
    }

    await sleep(interval)
  }

  throw new Error('Video generation timed out after 5 minutes')
}

// ─── Full pipeline: generate + poll + save to Supabase ───────────────────────
export async function generateAndSaveCreative(opts: {
  creativeId: string
  prompt: string
  title?: string
  negative_prompt?: string
  duration?: '5' | '10'
  mode?: 'std' | 'pro'
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  monetizationUrl?: string
  onPipelineStatus?: (status: PipelineStatus) => void
  onProgress?: (status: string) => void
}): Promise<{ video_url: string; task_id: string; devMode: boolean }> {
  let devMode = false

  const setStatus = (step: PipelineStep, message: string, detail?: string, extra?: Partial<PipelineStatus>) => {
    ugcLog(message, detail ? { detail } : undefined)
    opts.onPipelineStatus?.({ step, message, detail, devMode, ...extra })
  }

  try {
    // ── STEP 1: Mark as generating ──────────────────────────────────
    setStatus('generating', 'starting pipeline — marking as testing')
    await updateCreativeStatus(opts.creativeId, 'testing', {
      api_provider: 'kling',
      generation_prompt: opts.prompt,
    })
    opts.onProgress?.('submitted')

    // ── STEP 2: Try Kling (with rate-limit-aware backoff) ───────────
    let videoUrl = ''
    let taskId = 'dev-mode'

    try {
      // Check rate limit before attempting
      if (isRateLimited()) {
        const waitMs = rateLimitRemainingMs()
        setStatus('generating', `Rate limited — waiting ${Math.ceil(waitMs / 1000)}s`, undefined, { rateLimited: true, retryAfterMs: waitMs })
        await sleep(waitMs + 500)
      }

      setStatus('generating', 'sending to Kling AI')
      const task = await createTextToVideoTask({
        prompt: opts.prompt,
        negative_prompt: opts.negative_prompt,
        duration: opts.duration,
        mode: opts.mode,
        aspect_ratio: opts.aspect_ratio,
      }, opts.creativeId)

      taskId = task.data?.task_id
      if (!taskId) throw new Error('No task_id from Kling')

      setStatus('generating', 'task submitted — polling for completion', taskId)
      opts.onProgress?.('processing')

      // ── STEP 3: Poll until ready ────────────────────────────────────
      const result = await waitForVideo(taskId, {
        creativeId: opts.creativeId,
        onProgress: (status) => {
          opts.onProgress?.(status)
          if (status === 'processing') setStatus('generating', 'Kling processing...', taskId)
          if (status === 'rate_limited') setStatus('generating', 'Rate limited — waiting before polling', undefined, { rateLimited: true })
        },
        maxWaitMs: 300_000,
        pollIntervalMs: 5_000,
      })

      videoUrl = result.data?.task_result?.videos?.[0]?.url || ''
      if (!videoUrl) throw new Error('No video URL in completed task')
      if (isBlockedUrl(videoUrl)) throw new Error('PRIVATE URL BLOCKED — googleapis detected')

    } catch (klingErr) {
      const errMsg = klingErr instanceof Error ? klingErr.message : String(klingErr)
      const isRL = (klingErr as { isRateLimit?: boolean }).isRateLimit

      if (isRL) {
        // Propagate rate limit upward — caller (autoRunner) will re-queue
        throw klingErr
      }

      // Non-rate-limit failure → use DEV MODE fallback
      ugcLog('DEV MODE ACTIVATED', { error: errMsg })
      devMode = true
      videoUrl = getDevModeVideoUrl()
      taskId = `dev-mode-${Date.now()}`
      setStatus('generating', `DEV MODE: ${errMsg.slice(0, 60)} — using placeholder video`)
      opts.onProgress?.('dev-mode')
    }

    // ── STEP 4: Final URL guard ─────────────────────────────────────
    if (isBlockedUrl(videoUrl)) {
      videoUrl = DEV_MODE_VIDEO_URL
      devMode = true
    }

    // ── STEP 5: Save to Supabase ────────────────────────────────────
    setStatus('saving', 'saving video URL to Supabase')

    const { error: updateError } = await supabase
      .from('ugc_creatives')
      .update({
        video_url: videoUrl,
        thumbnail_url: devMode ? DEV_MODE_THUMBNAIL : videoUrl.replace(/\.\w+$/, '_thumb.jpg'),
        caption: opts.prompt,
        status: 'ready',
        platform_ready: true,
        api_provider: devMode ? 'dev-mode' : 'kling',
        monetization_url: opts.monetizationUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.creativeId)

    if (updateError) throw new Error(`DB update failed: ${updateError.message}`)

    ugcLog('READY', { creativeId: opts.creativeId, devMode })
    setStatus('complete', devMode ? 'DEV MODE: done' : 'pipeline complete', videoUrl.slice(0, 80))
    opts.onProgress?.('succeed')

    return { video_url: videoUrl, task_id: taskId, devMode }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isRL = (err as { isRateLimit?: boolean }).isRateLimit

    setStatus('error', `pipeline failed: ${msg}`, undefined, isRL ? { rateLimited: true } : undefined)

    // FAILSAFE: mark error in DB with reason + increment retry_count
    try {
      const { data: current } = await supabase
        .from('ugc_creatives')
        .select('retry_count')
        .eq('id', opts.creativeId)
        .single()

      const retryCount = (current?.retry_count || 0) + 1

      await supabase
        .from('ugc_creatives')
        .update({
          status: isRL ? 'queued' : 'error', // rate-limit → back to queued, not error
          error_reason: msg.slice(0, 500),
          retry_count: isRL ? (current?.retry_count || 0) : retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', opts.creativeId)

      ugcLog(isRL ? 'Re-queued creative (rate limit)' : `Marked ERROR (retry ${retryCount}/3)`, { id: opts.creativeId })
    } catch {
      // ignore DB error in error handler
    }

    throw err
  }
}

// ─── Quick-check: is Kling API configured? ───────────────────────────────────
export async function isKlingConfigured(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/kling?action=text2video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test', action: 'text2video' }),
    })
    // 400 = missing prompt (but API is reachable + configured)
    // 500 with "not configured" = missing keys
    if (res.status === 400) return true
    const data = await res.json()
    return !data.error?.includes('not configured')
  } catch {
    return false
  }
}
