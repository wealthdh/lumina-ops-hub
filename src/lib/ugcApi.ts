/**
 * UGC API â Kling AI Video Generation Client
 *
 * HARDENED PIPELINE: generate â save â distribute
 * - [UGC] logging at every step
 * - 2x retry on Kling failures
 * - Status callback for UI tracking
 */
import { supabase } from './supabase'

// âââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface KlingTaskResponse {
  code: number
  message: string
  request_id: string
  data: {
    task_id: string
    task_status: string
    task_status_msg?: string
    created_at?: number
    updated_at?: number
  }
}

export interface KlingVideoResult {
  code: number
  message: string
  request_id: string
  data: {
    task_id: string
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed'
    task_status_msg?: string
    task_result?: {
      videos: Array<{
        id: string
        url: string
        duration: string
      }>
    }
    created_at?: number
    updated_at?: number
  }
}

export interface GenerateVideoOpts {
  prompt: string
  negative_prompt?: string
  model_name?: string
  duration?: '5' | '10'
  mode?: 'std' | 'pro'
  aspect_ratio?: '16:9' | '9:16' | '1:1'
}

/** Pipeline step names for UI status tracking */
export type PipelineStep =
  | 'idle'
  | 'generating'
  | 'saving'
  | 'posting'
  | 'complete'
  | 'error'

export interface PipelineStatus {
  step: PipelineStep
  message: string
  detail?: string
  progress?: number // 0-100
}

// âââ Logger âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function ugcLog(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[UGC][${ts}] ${msg}`, data ? JSON.stringify(data) : '')
}

// âââ API base ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const API_BASE = import.meta.env.VITE_APP_URL || ''

// âââ Retry helper ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2
): Promise<T> {
  let lastError: Error = new Error('unknown')
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) ugcLog(`${label} â retry ${attempt - 1}/${maxRetries}`)
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      ugcLog(`${label} â attempt ${attempt} failed: ${lastError.message}`)
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * attempt)) // backoff
      }
    }
  }
  throw lastError
}

// âââ Create text-to-video task âââââââââââââââââââââââââââââââââââââââââââââââ
export async function createTextToVideoTask(
  opts: GenerateVideoOpts
): Promise<KlingTaskResponse> {
  ugcLog('start â sending text2video to Kling', { prompt: opts.prompt?.slice(0, 60) })

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
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Kling API error: ${res.status}`)
  }

  const data = await res.json()
  ugcLog('video task created', { task_id: data.data?.task_id, status: data.data?.task_status })
  return data
}

// âââ Poll task status ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export async function pollTaskStatus(
  taskId: string,
  type: 'text2video' | 'image2video' = 'text2video'
): Promise<KlingVideoResult> {
  const res = await fetch(
    `${API_BASE}/api/kling?action=status&task_id=${taskId}&type=${type}`
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Poll error: ${res.status}`)
  }

  return res.json()
}

// âââ Poll until complete (with timeout) ââââââââââââââââââââââââââââââââââââââ
export async function waitForVideo(
  taskId: string,
  opts?: {
    type?: 'text2video' | 'image2video'
    maxWaitMs?: number
    pollIntervalMs?: number
    onProgress?: (status: string) => void
  }
): Promise<KlingVideoResult> {
  const type = opts?.type || 'text2video'
  const maxWait = opts?.maxWaitMs || 300_000 // 5 min default
  const interval = opts?.pollIntervalMs || 5_000 // 5s polls
  const start = Date.now()
  let pollCount = 0

  while (Date.now() - start < maxWait) {
    pollCount++
    const result = await pollTaskStatus(taskId, type)
    const taskStatus = result.data?.task_status || 'unknown'

    opts?.onProgress?.(taskStatus)

    if (taskStatus === 'succeed') {
      ugcLog('video generated', { task_id: taskId, polls: pollCount, elapsed_ms: Date.now() - start })
      return result
    }

    if (taskStatus === 'failed') {
      ugcLog('video generation failed', { task_id: taskId, msg: result.data?.task_status_msg })
      throw new Error(result.data?.task_status_msg || 'Video generation failed')
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error('Video generation timed out after 5 minutes')
}

// âââ Full pipeline: generate + poll + save to Supabase âââââââââââââââââââââââ
export async function generateAndSaveCreative(opts: {
  creativeId: string
  prompt: string
  negative_prompt?: string
  duration?: '5' | '10'
  mode?: 'std' | 'pro'
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  onPipelineStatus?: (status: PipelineStatus) => void
  onProgress?: (status: string) => void
}): Promise<{ video_url: string; task_id: string }> {
  const setStatus = (step: PipelineStep, message: string, detail?: string) => {
    ugcLog(message, detail ? { detail } : undefined)
    opts.onPipelineStatus?.({ step, message, detail })
  }

  try {
    // ââ STEP 1: Mark as generating ââââââââââââââââââââââââââââââââââ
    setStatus('generating', 'start â preparing creative row')
    await supabase
      .from('ugc_creatives')
      .update({
        api_provider: 'kling',
        generation_prompt: opts.prompt,
        status: 'testing',
      })
      .eq('id', opts.creativeId)

    opts.onProgress?.('submitted')

    // ââ STEP 2: Create Kling task (with 2x retry) ââââââââââââââââââ
    setStatus('generating', 'sending to Kling AI (retries enabled)')
    const task = await withRetry(
      () => createTextToVideoTask({
        prompt: opts.prompt,
        negative_prompt: opts.negative_prompt,
        duration: opts.duration,
        mode: opts.mode,
        aspect_ratio: opts.aspect_ratio,
      }),
      'Kling text2video',
      2 // 2 retries
    )

    const taskId = task.data?.task_id
    if (!taskId) {
      throw new Error('No task_id returned from Kling API')
    }

    setStatus('generating', 'video task submitted, polling for completion', taskId)
    opts.onProgress?.('processing')

    // ââ STEP 3: Poll until video is ready ââââââââââââââââââââââââââ
    const result = await waitForVideo(taskId, {
      onProgress: (status) => {
        opts.onProgress?.(status)
        if (status === 'processing') {
          setStatus('generating', 'Kling processing video...', taskId)
        }
      },
      maxWaitMs: 300_000,
      pollIntervalMs: 5_000,
    })

    const videoUrl = result.data?.task_result?.videos?.[0]?.url
    if (!videoUrl) {
      ugcLog('ERROR: no video URL in completed task', { task_id: taskId })
      throw new Error('No video URL in completed task')
    }

    // ââ STEP 4: Save to Supabase âââââââââââââââââââââââââââââââââââ
    setStatus('saving', 'saved to db â writing video URL to ugc_creatives')
    const videoDuration = result.data?.task_result?.videos?.[0]?.duration || null

    const { error: updateError } = await supabase
      .from('ugc_creatives')
      .update({
        video_url: videoUrl,
        thumbnail_url: videoUrl.replace(/\.\w+$/, '_thumb.jpg'),
        caption: opts.prompt,
        status: 'testing',
        platform_ready: true,
      })
      .eq('id', opts.creativeId)

    if (updateError) {
      ugcLog('ERROR: failed to save video to Supabase', { error: updateError.message })
      throw new Error(`Saved video but failed to update DB: ${updateError.message}`)
    }

    ugcLog('saved to db', {
      creativeId: opts.creativeId,
      video_url: videoUrl.slice(0, 80),
      duration: videoDuration,
    })

    setStatus('complete', 'pipeline complete â video saved', videoUrl.slice(0, 80))
    opts.onProgress?.('succeed')

    return { video_url: videoUrl, task_id: taskId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus('error', `pipeline failed: ${msg}`)
    throw err
  }
}

// âââ Quick-check: is Kling API configured? âââââââââââââââââââââââââââââââââââ
export async function checkKlingApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/kling?action=status&task_id=health-check&type=text2video`)
    return res.status !== 500
  } catch {
    return false
  }
}

