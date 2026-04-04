/**
 * UGC API - Kling AI Video Generation Client
 * Frontend module that calls /api/kling Vercel serverless function.
 * Keys stay server-side. This module only talks to our own proxy.
 */
import { supabase } from './supabase'

export interface KlingTaskResponse {
  code: number; message: string; request_id: string;
  data: { task_id: string; task_status: string; task_status_msg?: string; created_at?: number; updated_at?: number; }
}

export interface KlingVideoResult {
  code: number; message: string; request_id: string;
  data: {
    task_id: string; task_status: 'submitted' | 'processing' | 'succeed' | 'failed'; task_status_msg?: string;
    task_result?: { videos: Array<{ id: string; url: string; duration: string; }> };
    created_at?: number; updated_at?: number;
  }
}

export interface GenerateVideoOpts {
  prompt: string; negative_prompt?: string; model_name?: string;
  duration?: '5' | '10'; mode?: 'std' | 'pro'; aspect_ratio?: '16:9' | '9:16' | '1:1';
}

const API_BASE = import.meta.env.VITE_APP_URL || ''

export async function createTextToVideoTask(opts: GenerateVideoOpts): Promise<KlingTaskResponse> {
  const res = await fetch(API_BASE + '/api/kling?action=text2video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'text2video', prompt: opts.prompt,
      negative_prompt: opts.negative_prompt || 'blurry, low quality, distorted, watermark',
      model_name: opts.model_name || 'kling-v2-master',
      duration: opts.duration || '5', mode: opts.mode || 'std',
      aspect_ratio: opts.aspect_ratio || '16:9',
    }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'Kling API error: ' + res.status); }
  return res.json()
}

export async function pollTaskStatus(taskId: string, type: 'text2video' | 'image2video' = 'text2video'): Promise<KlingVideoResult> {
  const res = await fetch(API_BASE + '/api/kling?action=status&task_id=' + taskId + '&type=' + type)
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'Poll error: ' + res.status); }
  return res.json()
}

export async function waitForVideo(taskId: string, opts?: {
  type?: 'text2video' | 'image2video'; maxWaitMs?: number; pollIntervalMs?: number;
  onProgress?: (status: string) => void;
}): Promise<KlingVideoResult> {
  const type = opts?.type || 'text2video'
  const maxWait = opts?.maxWaitMs || 300_000
  const interval = opts?.pollIntervalMs || 5_000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const result = await pollTaskStatus(taskId, type)
    opts?.onProgress?.(result.data?.task_status || 'unknown')
    if (result.data?.task_status === 'succeed') return result
    if (result.data?.task_status === 'failed') throw new Error(result.data?.task_status_msg || 'Video generation failed')
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  throw new Error('Video generation timed out after 5 minutes')
}

export async function generateAndSaveCreative(opts: {
  creativeId: string; prompt: string; negative_prompt?: string;
  duration?: '5' | '10'; mode?: 'std' | 'pro'; aspect_ratio?: '16:9' | '9:16' | '1:1';
  onProgress?: (status: string) => void;
}): Promise<{ video_url: string; task_id: string }> {
  await supabase.from('ugc_creatives').update({ api_provider: 'kling', generation_prompt: opts.prompt, status: 'testing' }).eq('id', opts.creativeId)
  opts.onProgress?.('submitted')
  const task = await createTextToVideoTask({ prompt: opts.prompt, negative_prompt: opts.negative_prompt, duration: opts.duration, mode: opts.mode, aspect_ratio: opts.aspect_ratio })
  const taskId = task.data?.task_id
  if (!taskId) throw new Error('No task_id returned from Kling API')
  opts.onProgress?.('processing')
  const result = await waitForVideo(taskId, { onProgress: opts.onProgress, maxWaitMs: 300_000, pollIntervalMs: 5_000 })
  const videoUrl = result.data?.task_result?.videos?.[0]?.url
  if (!videoUrl) throw new Error('No video URL in completed task')
  await supabase.from('ugc_creatives').update({ video_url: videoUrl, platform_ready: true }).eq('id', opts.creativeId)
  opts.onProgress?.('succeed')
  return { video_url: videoUrl, task_id: taskId }
}

export async function checkKlingApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(API_BASE + '/api/kling?action=status&task_id=health-check&type=text2video')
    return res.status !== 500
  } catch { return false }
}
