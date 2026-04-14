/**
 * AI UGC + Content Swarm â EXECUTION MODE
 *
 * AUTONOMOUS REVENUE ENGINE:
 * - Auto-runs pipeline every 3 min (3 creatives per cycle)
 * - Viral hooks + CTA rotation on every caption
 * - Daily goal tracking (50 generated, 30 ready/posted)
 * - Manual post queue for ready creatives
 * - Conversion tracking (views, clicks, conversions)
 * - Debug panel per creative
 * - Failsafe: retry + DEV MODE fallback
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Video,
  Zap,
  Globe,
  TrendingUp,
  Play,
  Search,
  ExternalLink,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Film,
  TestTube2,
  ArrowRight,
  XCircle,
  Send,
  Bug,
  Rocket,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Power,
  StopCircle,
  Target,
  Clock,
  BarChart3,
  Clipboard,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  generateAndSaveCreative,
  isRateLimited,
  rateLimitRemainingMs,
  type PipelineStatus,
} from '../lib/ugcApi'
import {
  distributeToAll,
  postToTwitter,
  type DistributeResponse,
  type DistributionResult,
} from '../lib/distributeApi'
import { buildCaption } from '../lib/viralEngine'
import {
  startAutoRunner,
  stopAutoRunner,
  getAutoRunnerState,
  getTodayStats,
  type AutoRunnerState,
  type AutoRunnerController,
} from '../lib/autoRunner'
import clsx from 'clsx'

// âââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface UgcCreative {
  id: string
  title: string
  platform: string
  status: string
  views: number
  ctr: number
  roas: number
  tool: string
  created_at: string
  video_url?: string | null
  thumbnail_url?: string | null
  caption?: string | null
  platform_ready?: boolean
  distributed_to?: string[]
  generation_prompt?: string | null
  api_provider?: string | null
  clicks?: number
  conversions?: number
  hooks?: Array<{ text: string; category: string; score: number }> | null
  hook_used?: string | null
  hook_score?: number | null
  cta_used?: string | null
  posted_at?: string | null
  retry_count?: number
  error_reason?: string | null
  monetization_url?: string | null
  monetization_product?: string | null
}

interface SeoKeyword {
  id: string
  keyword: string
  position: number | null
  volume: number | null
  difficulty: number | null
  url: string | null
  updated_at: string
}

// âââ Logger âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function ugcLog(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[UGC][${ts}] ${msg}`, data ? JSON.stringify(data) : '')
}

// âââ Update creative status helper ââââââââââââââââââââââââââââââââââââââââââ
async function updateCreativeStatus(
  id: string,
  status: string,
  extra?: Record<string, unknown>
) {
  ugcLog(`status â ${status}`, { id: id.slice(0, 8), ...extra })
  const { error } = await supabase
    .from('ugc_creatives')
    .update({ status, ...extra })
    .eq('id', id)
  if (error) throw error
}

// âââ Supabase hooks with realtime ââââââââââââââââââââââââââââââââââââââââââââ
function useUgcCreatives() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('ugc_creatives_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ugc_creatives' },
        (payload) => {
          ugcLog('realtime update', {
            event: payload.eventType,
            id: (payload.new as Record<string, unknown>)?.id,
            status: (payload.new as Record<string, unknown>)?.status,
          })
          qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc])

  return useQuery<UgcCreative[]>({
    queryKey: ['ugc_creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        console.warn('[UGC] ugc_creatives query:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 10_000,
  })
}

function useSeoKeywords() {
  return useQuery<SeoKeyword[]>({
    queryKey: ['seo_keywords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seo_keywords')
        .select('*')
        .order('position', { ascending: true, nullsFirst: false })
      if (error) return []
      return data ?? []
    },
    staleTime: 120_000,
  })
}

// âââ Run Full Pipeline (ONE CLICK) ââââââââââââââââââââââââââââââââââââââââââ
function useRunPipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: {
      creativeId: string
      prompt: string
      duration?: '5' | '10'
      mode?: 'std' | 'pro'
      aspect_ratio?: '16:9' | '9:16' | '1:1'
      onStep?: (step: string, detail?: string) => void
    }) => {
      const { creativeId, prompt, onStep } = opts

      // STEP 1: draft â testing
      onStep?.('testing', 'Sending to video generation...')
      await updateCreativeStatus(creativeId, 'testing')
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })

      // STEP 2: Generate video
      onStep?.('generating', 'Generating video (Kling AI or DEV MODE)...')
      let result
      try {
        result = await generateAndSaveCreative({
          creativeId,
          prompt,
          duration: opts.duration || '5',
          mode: opts.mode || 'std',
          aspect_ratio: opts.aspect_ratio || '16:9',
        })
        qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
        onStep?.('ready', `Video ready (${result.devMode ? 'DEV MODE' : 'Kling AI'})`)
      } catch (err) {
        // FAILSAFE: retry once
        onStep?.('retrying', 'First attempt failed, retrying...')
        try {
          result = await generateAndSaveCreative({
            creativeId,
            prompt,
            duration: opts.duration || '5',
            mode: opts.mode || 'std',
            aspect_ratio: opts.aspect_ratio || '16:9',
          })
          qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
          onStep?.('ready', `Video ready on retry (${result.devMode ? 'DEV MODE' : 'Kling AI'})`)
        } catch (retryErr) {
          await updateCreativeStatus(creativeId, 'error')
          qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
          throw retryErr
        }
      }

      // STEP 3: Try Twitter/X â NEVER throw, never block pipeline
      onStep?.('posting', 'Attempting Twitter/X post...')
      try {
        const tweetResult = await postToTwitter(creativeId)
        if (tweetResult.success) {
          await updateCreativeStatus(creativeId, 'posted', {
            distributed_to: ['Twitter/X'],
            posted_at: new Date().toISOString(),
          })
          onStep?.('posted', `Tweet posted: ${tweetResult.post_url || 'success'}`)
        } else {
          // Twitter failed but pipeline is complete â mark ready_to_post for manual queue
          await updateCreativeStatus(creativeId, 'ready_to_post')
          onStep?.('ready_to_post', `Twitter unavailable: ${tweetResult.error?.slice(0, 60)} â added to manual queue`)
        }
      } catch {
        // Twitter completely unavailable â mark ready_to_post, DON'T crash
        await updateCreativeStatus(creativeId, 'ready_to_post').catch((e) => console.error('[ContentSwarm] Failed to persist ready_to_post â Supabase may be down:', e))
        onStep?.('ready_to_post', 'Twitter offline â creative ready in manual post queue')
      }

      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
      onStep?.('complete', 'Pipeline complete')
      return result
    },
    onError: (err, opts) => {
      // Mark draft as error if pipeline throws
      updateCreativeStatus(opts.creativeId, 'error').catch(() => {})
    },
  })
}

// âââ Generate + Run Pipeline âââââââââââââââââââââââââââââââââââââââââââââââââ
function useGenerateAndRun() {
  const qc = useQueryClient()
  const runPipeline = useRunPipeline()

  return useMutation({
    mutationFn: async (opts: {
      title: string
      platform: string
      tool: string
      prompt?: string
      duration?: '5' | '10'
      mode?: 'std' | 'pro'
      aspect_ratio?: '16:9' | '9:16' | '1:1'
      onStep?: (step: string, detail?: string) => void
    }) => {
      const { onStep } = opts

      // Build viral caption
      const captionData = buildCaption({
        title: opts.title,
        platform: opts.platform,
        prompt: opts.prompt || opts.title,
      })

      onStep?.('inserting', 'Creating creative row with viral caption...')
      const { data: creative, error } = await supabase
        .from('ugc_creatives')
        .insert({
          title: opts.title,
          platform: opts.platform,
          status: 'draft',
          views: 0,
          ctr: 0,
          roas: 0,
          tool: opts.tool,
          api_provider: 'kling',
          generation_prompt: opts.prompt || opts.title,
          caption: captionData.caption,
          hooks: captionData.hooks,
          hook_used: captionData.hookUsed,
          hook_score: captionData.hookScore,
          cta_used: captionData.ctaUsed,
        })
        .select()
        .single()
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
      onStep?.('inserted', `Row created: ${creative.id.slice(0, 8)}... | Hook: "${captionData.hookUsed.slice(0, 40)}"`)

      let result
      try {
        result = await runPipeline.mutateAsync({
          creativeId: creative.id,
          prompt: opts.prompt || opts.title,
          duration: opts.duration,
          mode: opts.mode,
          aspect_ratio: opts.aspect_ratio,
          onStep,
        })
      } catch (err) {
        // Cleanup orphaned draft row — mark as error so it doesn't silently sit in 'draft' state
        await updateCreativeStatus(creative.id, 'error').catch(() => {})
        qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
        throw err
      }

      return { creative, result }
    },
  })
}

function useDeleteCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ugc_creatives').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ugc_creatives'] }) },
  })
}

/** Mark a creative as "posted" after manual Twitter fallback */
function useMarkPosted() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ugc_creatives')
        .update({
          status: 'posted',
          distributed_to: ['Twitter/X'],
          posted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ugc_creatives'] }) },
  })
}

/** Update engagement metrics from real platform analytics */
function useUpdateMetrics() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: { id: string; views?: number; clicks?: number; conversions?: number }) => {
      const updates: Record<string, number> = {}
      if (opts.views !== undefined) updates.views = opts.views
      if (opts.clicks !== undefined) updates.clicks = opts.clicks
      if (opts.conversions !== undefined) updates.conversions = opts.conversions
      if (Object.keys(updates).length === 0) return
      const { error } = await supabase
        .from('ugc_creatives')
        .update(updates)
        .eq('id', opts.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ugc_creatives'] }) },
  })
}

function usePostToX() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: { creativeId: string; caption?: string }): Promise<DistributionResult & { manualFallback?: boolean }> => {
      try {
        const result = await postToTwitter(opts.creativeId)
        if (result.success) {
          await updateCreativeStatus(opts.creativeId, 'posted', {
            distributed_to: ['Twitter/X'],
            posted_at: new Date().toISOString(),
          })
          qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
          return result
        }
        // API returned success:false – persist ready_to_post then trigger manual fallback
        await updateCreativeStatus(opts.creativeId, 'ready_to_post').catch((e) =>
          console.error('[usePostToX] Failed to persist ready_to_post on success:false:', e)
        )
        qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
        return openManualPostFallback(opts.caption || '', result.error)
      } catch (err) {
        // API completely unavailable – persist ready_to_post status before fallback
        await updateCreativeStatus(opts.creativeId, 'ready_to_post').catch((e) =>
          console.error('[usePostToX] Failed to persist ready_to_post on exception:', e)
        )
        return openManualPostFallback(opts.caption || '', 'API unavailable')
      }
    },
  })
}

/** Open X/Twitter compose page + copy caption to clipboard as fallback */
function openManualPostFallback(caption: string, errorReason?: string): DistributionResult & { manualFallback: boolean } {
  const text = caption || ''
  // Copy caption to clipboard
  if (text) navigator.clipboard.writeText(text).catch(() => {})
  // Open X compose page with pre-filled text (truncated to 280 chars for URL)
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text.slice(0, 280))}`
  window.open(tweetUrl, '_blank', 'noopener,noreferrer')
  return {
    platform: 'Twitter/X',
    success: false,
    error: errorReason,
    manualFallback: true,
  }
}

// âââ Badges ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function DevModeBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
      <AlertCircle size={10} />DEV
    </span>
  )
}

function MonetizationBadge({ url, product }: { url?: string | null; product?: string | null }) {
  if (!url && !product) return null
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-lumina-gold/20 border border-lumina-gold/30 text-lumina-gold text-[9px] font-bold hover:bg-lumina-gold/30 transition-colors"
      onClick={e => e.stopPropagation()}
    >
      💰 {product ? product.slice(0, 20) : 'Product link'}
    </a>
  )
}

function RetryBadge({ count }: { count?: number }) {
  if (!count || count === 0) return null
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold',
      count >= 3 ? 'bg-red-500/20 border border-red-500/30 text-red-400' : 'bg-orange-500/20 border border-orange-500/30 text-orange-400'
    )}>
      ↻ {count}/3
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    ready: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    ready_to_post: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    posted: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    testing: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    queued: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    draft: 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/30',
    paused: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    failed: 'bg-red-500/20 text-red-400 border border-red-500/30',
    error: 'bg-red-500/20 text-red-400 border border-red-500/30',
  }
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', map[status] ?? 'bg-zinc-700/40 text-zinc-400')}>{status}</span>
}

// âââ FRONTEND FAILSAFE: Override stuck status âââââââââââââââââââââââââââââââ
function getEffectiveStatus(creative: UgcCreative): string {
  // If video_url exists but status is still testing â it's actually ready
  if (creative.video_url && creative.status === 'testing') return 'ready'
  return creative.status
}

// âââ Pipeline Steps ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function CreativePipelineSteps({ creative }: { creative: UgcCreative }) {
  const hasVideo = !!creative.video_url
  const effectiveStatus = getEffectiveStatus(creative)
  const steps = [
    { label: 'Draft', done: true },
    { label: 'Testing', done: ['testing', 'ready', 'ready_to_post', 'posted', 'live'].includes(effectiveStatus) },
    { label: 'Ready', done: hasVideo && ['ready', 'ready_to_post', 'posted', 'live'].includes(effectiveStatus) },
    { label: 'Posted', done: effectiveStatus === 'posted' || (creative.distributed_to?.length ?? 0) > 0 },
  ]
  return (
    <div className="flex items-center gap-1 mt-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1">
          <div className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold',
            s.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500',
          )}>
            {s.done && <CheckCircle size={9} />}{s.label}
          </div>
          {i < steps.length - 1 && <ArrowRight size={8} className={clsx(s.done ? 'text-emerald-400' : 'text-zinc-600')} />}
        </div>
      ))}
    </div>
  )
}

// âââ Debug Panel âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function DebugPanel({ creative }: { creative: UgcCreative }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 border border-zinc-700/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
      >
        <span className="flex items-center gap-1.5"><Bug size={10} /> Debug</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && (
        <div className="px-3 py-2 bg-zinc-900/80 text-[10px] font-mono space-y-1 border-t border-zinc-700/60">
          <div><span className="text-zinc-500">id:</span> <span className="text-cyan-400">{creative.id}</span></div>
          <div><span className="text-zinc-500">status:</span> <span className="text-amber-400">{creative.status}</span></div>
          <div><span className="text-zinc-500">video_url:</span> <span className="text-emerald-400 break-all">{creative.video_url || 'null'}</span></div>
          <div><span className="text-zinc-500">api_provider:</span> <span className="text-zinc-400">{creative.api_provider || 'null'}</span></div>
          <div><span className="text-zinc-500">hook_used:</span> <span className="text-purple-400 break-all">{creative.hook_used || 'null'}</span></div>
          <div><span className="text-zinc-500">hook_score:</span> <span className="text-zinc-400">{creative.hook_score ?? 'null'}</span></div>
          <div><span className="text-zinc-500">cta_used:</span> <span className="text-sky-400">{creative.cta_used || 'null'}</span></div>
          <div><span className="text-zinc-500">retry_count:</span> <span className="text-orange-400">{creative.retry_count ?? 0}</span></div>
          {creative.error_reason && <div><span className="text-zinc-500">error_reason:</span> <span className="text-red-400 break-all">{creative.error_reason}</span></div>}
          {creative.monetization_url && <div><span className="text-zinc-500">monetization:</span> <a href={creative.monetization_url} target="_blank" rel="noreferrer" className="text-lumina-gold underline break-all">{creative.monetization_product || creative.monetization_url}</a></div>}
          <div><span className="text-zinc-500">clicks:</span> <span className="text-zinc-400">{creative.clicks ?? 0}</span> | <span className="text-zinc-500">conversions:</span> <span className="text-zinc-400">{creative.conversions ?? 0}</span></div>
          <div><span className="text-zinc-500">distributed_to:</span> <span className="text-zinc-400">{JSON.stringify(creative.distributed_to || [])}</span></div>
          {creative.hooks && creative.hooks.length > 0 && (
            <div className="mt-1 pt-1 border-t border-zinc-700/40">
              <div className="text-zinc-500 mb-1">All Hooks:</div>
              {creative.hooks.map((h, i) => (
                <div key={i} className="text-zinc-400">
                  [{h.category}] (score:{h.score}) {h.text.slice(0, 60)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// âââ Run Pipeline Button (per-card) ââââââââââââââââââââââââââââââââââââââââââ
function RunPipelineButton({ creative }: { creative: UgcCreative }) {
  const runPipeline = useRunPipeline()
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const effectiveStatus = getEffectiveStatus(creative)
  const canRun = ['draft'].includes(effectiveStatus) && !creative.video_url && !runPipeline.isPending

  const handleRun = useCallback(() => {
    runPipeline.mutate({
      creativeId: creative.id,
      prompt: creative.generation_prompt || creative.title,
      onStep: (step, detail) => setCurrentStep(`${step}: ${detail || ''}`),
    })
  }, [creative, runPipeline])

  if (!canRun && !runPipeline.isPending) return null

  return (
    <div className="space-y-1">
      {canRun && (
        <button onClick={handleRun} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-lumina-pulse/20 text-lumina-pulse hover:bg-lumina-pulse/30 border border-lumina-pulse/30 transition-all w-full justify-center">
          <Rocket size={11} /> Run Pipeline
        </button>
      )}
      {runPipeline.isPending && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-lumina-pulse/10 text-lumina-pulse border border-lumina-pulse/20 animate-pulse">
          <Loader2 size={11} className="animate-spin" />
          <span className="truncate">{currentStep || 'Running...'}</span>
        </div>
      )}
    </div>
  )
}

// âââ Manual Post Queue âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function ManualPostQueue({ creatives }: { creatives: UgcCreative[] }) {
  const readyCreatives = creatives.filter(c => {
    const eff = getEffectiveStatus(c)
    return ['ready', 'ready_to_post'].includes(eff) && c.video_url && !(c.distributed_to && c.distributed_to.length > 0)
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [postedId, setPostedId] = useState<string | null>(null)
  const markPosted = useMarkPosted()

  const copyCaption = useCallback((creative: UgcCreative) => {
    const text = creative.caption || creative.title
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(creative.id)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => {})
  }, [])

  const postToX = useCallback((creative: UgcCreative) => {
    const text = creative.caption || creative.title
    navigator.clipboard.writeText(text).catch(() => {})
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text.slice(0, 280))}`
    window.open(tweetUrl, '_blank', 'noopener,noreferrer')
    setPostedId(creative.id)
  }, [])

  const confirmPosted = useCallback((id: string) => {
    markPosted.mutate(id, { onSuccess: () => setPostedId(null) })
  }, [markPosted])

  if (readyCreatives.length === 0) return null

  return (
    <div className="card-glow border-2 border-dashed border-amber-500/30">
      <div className="flex items-center justify-between p-4 border-b border-lumina-border">
        <div className="flex items-center gap-2">
          <Clipboard size={16} className="text-amber-400" />
          <span className="text-sm font-bold text-lumina-text">Manual Post Queue</span>
          <span className="text-[10px] text-amber-400 font-mono">{readyCreatives.length} ready to post</span>
        </div>
        <span className="text-[10px] text-lumina-dim">Copy caption â Post to X â Confirm posted</span>
      </div>
      <div className="p-4 space-y-3">
        {readyCreatives.slice(0, 10).map(c => (
          <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-lumina-bg/60 border border-lumina-border/40">
            {c.video_url && (
              <video
                src={c.video_url}
                className="w-20 h-14 rounded object-cover flex-shrink-0"
                muted
                playsInline
                controls
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-lumina-text font-medium truncate">{c.title}</div>
              <div className="text-[10px] text-lumina-dim mt-0.5 line-clamp-2">{c.caption?.slice(0, 140)}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[9px] text-lumina-muted">{c.platform}</span>
                {c.hook_used && <span className="text-[9px] text-purple-400">Hook: {c.hook_score}</span>}
                {c.cta_used && <span className="text-[9px] text-sky-400">CTA: {c.cta_used.slice(0, 20)}</span>}
              </div>
              {postedId === c.id && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-amber-400">Did you post it?</span>
                  <button
                    onClick={() => confirmPosted(c.id)}
                    disabled={markPosted.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all"
                  >
                    <CheckCircle size={10} /> Yes, mark posted
                  </button>
                  <button
                    onClick={() => setPostedId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={() => postToX(c)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 border border-sky-500/30 transition-all"
              >
                <Send size={11} /> Post to X
              </button>
              <button
                onClick={() => copyCaption(c)}
                className={clsx(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                  copiedId === c.id
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30',
                )}
              >
                {copiedId === c.id ? <><CheckCircle size={11} /> Copied!</> : <><Copy size={11} /> Copy Caption</>}
              </button>
              {c.video_url && (
                <a
                  href={c.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-lumina-pulse/10 text-lumina-pulse hover:bg-lumina-pulse/20 border border-lumina-pulse/20 transition-all"
                >
                  <ExternalLink size={11} /> Open Video
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// âââ Auto-Runner Control Panel âââââââââââââââââââââââââââââââââââââââââââââââ
function AutoRunnerPanel() {
  const [state, setState] = useState<AutoRunnerState | null>(null)
  const [running, setRunning] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlRef = useRef<{ stop: () => void } | null>(null)

  // Poll state every 5s when running
  useEffect(() => {
    if (running) {
      pollRef.current = setInterval(() => {
        setState(getAutoRunnerState())
      }, 5000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [running])

  const handleStart = useCallback(() => {
    const ctrl = startAutoRunner({
      intervalMs: 900_000, // 15 minutes (reduced from 3 min to respect Kling rate limits)
      dailyGoal: 50,
      onUpdate: (newState) => setState(newState),
    })
    controlRef.current = ctrl
    setRunning(true)
    setState(ctrl.getState())
  }, [])

  const handleStop = useCallback(() => {
    stopAutoRunner()
    controlRef.current = null
    setRunning(false)
  }, [])

  return (
    <div className={clsx(
      'card-glow border-2',
      running ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-lumina-border',
    )}>
      <div className="flex items-center justify-between p-4 border-b border-lumina-border">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-3 h-3 rounded-full',
            running ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600',
          )} />
          <span className="text-sm font-bold text-lumina-text">Autonomous Engine</span>
          <span className="text-[10px] font-mono text-lumina-dim">
            {running ? 'RUNNING â queue mode, 1 job at a time' : 'STOPPED'}
          </span>
        </div>
        <button
          onClick={running ? handleStop : handleStart}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
            running
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30',
          )}
        >
          {running ? <><StopCircle size={12} /> Stop Engine</> : <><Power size={12} /> Start Engine</>}
        </button>
        {running && (
          <button
            onClick={() => controlRef.current?.enqueueNow?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30 transition-all"
            title="Add 3 new creatives to queue immediately"
          >
            <Zap size={12} /> Enqueue 3
          </button>
        )}
      </div>

      {state && (
        <div className="p-4">
          {/* Daily Progress */}
          {/* Rate limit banner */}
          {state.rateLimitedUntil && new Date(state.rateLimitedUntil) > new Date() && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs">
              <AlertCircle size={12} className="flex-shrink-0 animate-pulse" />
              <span>Rate limited — resuming at {state.rateLimitedUntil.slice(11, 19)}</span>
            </div>
          )}
          {state.currentlyProcessing && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-lumina-pulse/10 border border-lumina-pulse/20 text-lumina-pulse text-xs">
              <Loader2 size={12} className="flex-shrink-0 animate-spin" />
              <span>Processing: {state.currentlyProcessing.slice(0, 8)}...</span>
            </div>
          )}
          <div className="grid grid-cols-6 gap-2 mb-4">
            <div className="text-center">
              <div className="text-[10px] text-lumina-dim">Queued</div>
              <div className="text-lg font-bold font-mono text-indigo-400">{state.queuedCount ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-lumina-dim">Generated</div>
              <div className="text-lg font-bold font-mono text-lumina-text">{state.todayGenerated}</div>
              <div className="text-[9px] text-lumina-muted">/{state.dailyGoal}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-lumina-dim">Ready</div>
              <div className="text-lg font-bold font-mono text-emerald-400">{state.todayReady}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-lumina-dim">Posted</div>
              <div className="text-lg font-bold font-mono text-blue-400">{state.todayPosted}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-lumina-dim">Errors</div>
              <div className="text-lg font-bold font-mono text-red-400">{state.todayErrors}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-lumina-dim">Cycles</div>
              <div className="text-lg font-bold font-mono text-lumina-pulse">{state.cycleCount}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-lumina-dim mb-1">
              <span>Daily Goal Progress</span>
              <span>{Math.round((state.todayGenerated / state.dailyGoal) * 100)}%</span>
            </div>
            <div className="w-full bg-lumina-bg rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lumina-pulse to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (state.todayGenerated / state.dailyGoal) * 100)}%` }}
              />
            </div>
          </div>

          {/* Timing */}
          <div className="flex items-center gap-4 text-[10px] text-lumina-dim mb-3">
            {state.lastCycleAt && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> Last: {state.lastCycleAt.slice(11, 19)}
              </span>
            )}
            {state.nextCycleAt && running && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> Next: {state.nextCycleAt.slice(11, 19)}
              </span>
            )}
          </div>

          {/* Recent Log */}
          {state.log.length > 0 && (
            <div className="bg-zinc-900/60 rounded-lg p-3 max-h-32 overflow-y-auto">
              <div className="text-[10px] text-lumina-dim font-semibold mb-1">Activity Log</div>
              {state.log.slice(-8).reverse().map((l, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] font-mono py-0.5">
                  <span className="text-zinc-600 flex-shrink-0">{l.ts.slice(11, 19)}</span>
                  <span className={clsx(
                    l.level === 'success' && 'text-emerald-400',
                    l.level === 'error' && 'text-red-400',
                    l.level === 'warn' && 'text-amber-400',
                    l.level === 'info' && 'text-zinc-400',
                  )}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// âââ Test Pipeline Panel âââââââââââââââââââââââââââââââââââââââââââââââââââââ
function TestPipelinePanel() {
  const generateAndRun = useGenerateAndRun()
  const [log, setLog] = useState<Array<{ step: string; status: 'ok' | 'fail' | 'running'; msg: string }>>([])

  const addLog = useCallback((step: string, status: 'ok' | 'fail' | 'running', msg: string) => {
    setLog(prev => {
      // When a NEW step arrives, mark ALL prior 'running' steps as 'ok' (they completed)
      let next = prev.map(l => l.status === 'running' ? { ...l, status: 'ok' as const } : l)
      // Now add or update the current step
      const idx = next.findIndex(l => l.step === step)
      if (idx >= 0) { next = [...next]; next[idx] = { step, status, msg }; return next }
      return [...next, { step, status, msg }]
    })
  }, [])

  const runTest = useCallback(async () => {
    setLog([])
    addLog('pipeline', 'running', 'Starting full pipeline test...')
    try {
      await generateAndRun.mutateAsync({
        title: `[TEST] Pipeline ${new Date().toISOString().slice(11, 19)}`,
        platform: 'Twitter/X',
        tool: 'Kling',
        prompt: 'Test: A sleek trading dashboard with glowing cyan charts and dark background',
        onStep: (step, detail) => addLog(step, step === 'complete' ? 'ok' : 'running', detail || step),
      })
      addLog('pipeline', 'ok', 'Full pipeline complete: draft â testing â ready â posted')
    } catch (err) {
      addLog('pipeline', 'fail', `Pipeline failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [generateAndRun, addLog])

  return (
    <div className="card-glow border-2 border-dashed border-lumina-pulse/30">
      <div className="flex items-center justify-between p-4 border-b border-lumina-border">
        <div className="flex items-center gap-2">
          <TestTube2 size={16} className="text-lumina-pulse" />
          <span className="text-sm font-bold text-lumina-text">One-Click Pipeline Test</span>
          <span className="text-[10px] text-lumina-dim font-mono">Create â Generate â Ready â Post</span>
        </div>
        <button
          onClick={runTest}
          disabled={generateAndRun.isPending}
          className={clsx('btn-pulse text-xs px-4 py-1.5 flex items-center gap-1.5', generateAndRun.isPending && 'opacity-50 cursor-not-allowed')}
        >
          {generateAndRun.isPending ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
          {generateAndRun.isPending ? 'Running...' : 'Test Pipeline'}
        </button>
      </div>
      {log.length > 0 && (
        <div className="p-4 space-y-2">
          {log.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs font-mono">
              {l.status === 'ok' && <CheckCircle size={13} className="text-lumina-success flex-shrink-0 mt-0.5" />}
              {l.status === 'fail' && <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />}
              {l.status === 'running' && <Loader2 size={13} className="text-lumina-pulse animate-spin flex-shrink-0 mt-0.5" />}
              <div>
                <span className="text-lumina-text font-semibold">[{l.step}]</span>{' '}
                <span className="text-lumina-dim">{l.msg}</span>
              </div>
            </div>
          ))}
          {!generateAndRun.isPending && log.length > 0 && (
            <div className={clsx(
              'mt-3 p-3 rounded-lg text-xs font-bold text-center',
              log.every(l => l.status === 'ok') && 'bg-lumina-success/10 text-lumina-success border border-lumina-success/30',
              log.some(l => l.status === 'fail') && 'bg-red-500/10 text-red-400 border border-red-500/30',
            )}>
              {log.every(l => l.status === 'ok') ? 'PIPELINE COMPLETE' : 'PIPELINE INCOMPLETE â check logs'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// âââ Generate Modal ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const CREATIVE_TEMPLATES = [
  { title: 'Product Testimonial â AI Voice Clone', platform: 'TikTok', tool: 'Arcads' },
  { title: 'Problem/Solution Hook â Stock Footage', platform: 'Instagram', tool: 'Kling' },
  { title: 'Before/After Transformation â UGC Style', platform: 'YouTube', tool: 'Arcads' },
  { title: 'FAQ Explainer â AI Avatar', platform: 'LinkedIn', tool: 'Kling' },
  { title: 'Trending Sound Remix â Split Screen', platform: 'TikTok', tool: 'Arcads' },
  { title: 'Customer Story â Cinematic B-Roll', platform: 'Instagram', tool: 'Kling' },
  { title: 'Pain Point Callout â Text Overlay', platform: 'Twitter/X', tool: 'Arcads' },
  { title: 'How-To Tutorial â Screen Recording + VO', platform: 'YouTube', tool: 'Kling' },
]

function GenerateModal({ onClose, onGenerate, isPending }: {
  onClose: () => void
  onGenerate: (opts: {
    title: string; platform: string; tool: string; prompt?: string
    duration?: '5' | '10'; mode?: 'std' | 'pro'; aspect_ratio?: '16:9' | '9:16' | '1:1'
  }) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState(0)
  const [customTitle, setCustomTitle] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [duration, setDuration] = useState<'5' | '10'>('5')
  const [mode, setMode] = useState<'std' | 'pro'>('std')
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9')

  const template = CREATIVE_TEMPLATES[selected]
  const title = customTitle.trim() || template.title
  const isKling = template.tool === 'Kling'
  const defaultPrompt = `Create a high-quality ${template.platform} video: ${template.title}. Professional lighting, smooth motion, engaging for social media.`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-lumina-card border border-lumina-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-lumina-border">
          <div>
            <div className="text-lumina-text font-semibold text-sm">Generate + Run Pipeline</div>
            <div className="text-lumina-dim text-xs">One click: Create â Viral Caption â Generate â Post</div>
          </div>
          <button onClick={onClose} className="text-lumina-muted hover:text-lumina-text p-1"><XCircle size={16} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
          <div>
            <label className="text-xs text-lumina-dim font-medium block mb-2">Template</label>
            <div className="grid grid-cols-1 gap-2">
              {CREATIVE_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setSelected(i); setCustomTitle(''); setCustomPrompt('') }}
                  className={clsx(
                    'text-left text-xs p-3 rounded-lg border transition-all',
                    selected === i ? 'border-lumina-pulse bg-lumina-pulse/10 text-lumina-pulse' : 'border-lumina-border text-lumina-dim hover:border-lumina-pulse/40',
                  )}
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{t.platform} | {t.tool}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-lumina-dim font-medium block mb-1.5">Custom Title <span className="text-lumina-muted">(optional)</span></label>
            <input type="text" value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="e.g. 'Black Friday Sale â UGC'" className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors" />
          </div>
          {isKling && (
            <>
              <div>
                <label className="text-xs text-lumina-dim font-medium block mb-1.5">Video Prompt</label>
                <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder={defaultPrompt} rows={3} className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[10px] text-lumina-dim block mb-1">Duration</label><select value={duration} onChange={e => setDuration(e.target.value as '5' | '10')} className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-2 py-1.5 text-xs text-lumina-text"><option value="5">5s</option><option value="10">10s</option></select></div>
                <div><label className="text-[10px] text-lumina-dim block mb-1">Quality</label><select value={mode} onChange={e => setMode(e.target.value as 'std' | 'pro')} className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-2 py-1.5 text-xs text-lumina-text"><option value="std">Standard</option><option value="pro">Pro</option></select></div>
                <div><label className="text-[10px] text-lumina-dim block mb-1">Aspect</label><select value={aspect} onChange={e => setAspect(e.target.value as '16:9' | '9:16' | '1:1')} className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-2 py-1.5 text-xs text-lumina-text"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></div>
              </div>
            </>
          )}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[10px] text-amber-400 font-semibold">
            Viral caption with hook + CTA will be auto-generated. DEV MODE fallback if Kling unavailable.
          </div>
        </div>
        <div className="p-5 border-t border-lumina-border">
          <button
            onClick={() => onGenerate({ title, platform: template.platform, tool: template.tool, prompt: customPrompt.trim() || defaultPrompt, duration, mode, aspect_ratio: aspect })}
            disabled={isPending}
            className={clsx('btn-pulse w-full flex items-center justify-center gap-2 py-2.5', isPending && 'opacity-50 cursor-not-allowed')}
          >
            <Rocket size={13} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Running Pipeline...' : 'Generate + Run Pipeline'}
          </button>
        </div>
      </div>
    </div>
  )
}

// âââ Creative Card âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function CreativeCard({ creative, onDelete }: { creative: UgcCreative; onDelete: (id: string) => void }) {
  const postToX = usePostToX()
  const markPosted = useMarkPosted()
  const updateMetrics = useUpdateMetrics()
  const [postResult, setPostResult] = useState<DistributionResult | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)
  const [metricViews, setMetricViews] = useState('')
  const [metricClicks, setMetricClicks] = useState('')
  const [metricConversions, setMetricConversions] = useState('')
  const isDevMode = creative.api_provider === 'dev-mode' || creative.api_provider === 'fallback'
  const hasVideo = !!creative.video_url
  const effectiveStatus = getEffectiveStatus(creative)
  const isPosted = effectiveStatus === 'posted' || (creative.distributed_to?.length ?? 0) > 0

  useEffect(() => { setVideoError(false) }, [creative.video_url])

  return (
    <div className="p-4 bg-lumina-bg/60 rounded-xl border border-lumina-border/50 group hover:border-lumina-pulse/30 transition-all">
      <div className="flex items-start gap-3">
        {/* Video */}
        {hasVideo && !videoError ? (
          <div className="w-32 h-20 rounded-lg overflow-hidden flex-shrink-0 relative bg-black">
            <video src={creative.video_url || ''} className="w-full h-full object-cover" muted loop playsInline controls
              onMouseEnter={e => { (e.target as HTMLVideoElement).play().catch(() => {}) }}
              onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
              onError={() => setVideoError(true)} poster={creative.thumbnail_url || undefined} />
            {isDevMode && <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-amber-500/90 text-black text-[8px] font-bold rounded">DEV</div>}
            <div className="absolute bottom-1 right-1 bg-emerald-500/90 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">{effectiveStatus.toUpperCase()}</div>
          </div>
        ) : hasVideo && videoError ? (
          <div className="w-32 h-20 bg-red-900/30 border border-red-500/30 rounded-lg flex flex-col items-center justify-center flex-shrink-0 gap-1">
            <AlertCircle size={14} className="text-red-400" />
            <button onClick={() => setVideoError(false)} className="text-[8px] text-cyan-400 underline">Retry</button>
          </div>
        ) : ['testing', 'draft'].includes(effectiveStatus) && !hasVideo ? (
          <div className="w-32 h-20 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0 animate-pulse">
            <Loader2 size={18} className="text-lumina-pulse animate-spin" />
          </div>
        ) : (
          <div className="w-32 h-20 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0">
            <Play size={18} className="text-lumina-dim" />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm text-lumina-text font-medium truncate">{creative.title}</span>
            <StatusBadge status={effectiveStatus} />
            {isDevMode && <DevModeBadge />}
            <RetryBadge count={creative.retry_count} />
            {creative.hook_score && creative.hook_score > 70 && (
              <span className="text-[9px] text-purple-400 font-bold">VIRAL {creative.hook_score}</span>
            )}
            <MonetizationBadge url={creative.monetization_url} product={creative.monetization_product} />
          </div>
          <div className="text-xs text-lumina-dim">
            {creative.platform} | {creative.tool}
            {creative.cta_used && <span className="ml-1 text-sky-400 text-[10px]">CTA: {creative.cta_used.slice(0, 25)}</span>}
          </div>
          {creative.caption && (
            <div className="text-[10px] text-lumina-dim mt-1 line-clamp-2 italic">&quot;{creative.caption.slice(0, 120)}&quot;</div>
          )}
          {((creative.views ?? 0) > 0 || (creative.clicks ?? 0) > 0) && (
            <div className="flex items-center gap-3 text-xs font-mono mt-1.5">
              <span className="text-lumina-dim">{creative.views}v</span>
              <span className="text-sky-400">{creative.clicks ?? 0}c</span>
              <span className="text-emerald-400">{creative.conversions ?? 0}cv</span>
              <span className={clsx('font-semibold', (creative.roas ?? 0) >= 2 ? 'text-lumina-success' : 'text-lumina-warning')}>{creative.roas}x</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0 w-28">
          <RunPipelineButton creative={creative} />
          {hasVideo && ['ready', 'ready_to_post'].includes(effectiveStatus) && !isPosted && (
            <button
              onClick={() => postToX.mutate(
                { creativeId: creative.id, caption: creative.caption || creative.title },
                {
                  onSuccess: (res) => setPostResult(res),
                  onError: (err) => setPostResult({ platform: 'Twitter/X', success: false, error: err instanceof Error ? err.message : String(err) }),
                }
              )}
              disabled={postToX.isPending}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all w-full justify-center',
                postToX.isPending ? 'bg-sky-500/10 text-sky-400 cursor-not-allowed' : 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 border border-sky-500/30')}
            >
              {postToX.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {postToX.isPending ? 'Posting...' : 'Post to X'}
            </button>
          )}
          <button
            onClick={() => { if (window.confirm(`Delete "${creative.title}"?`)) onDelete(creative.id) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 w-full justify-center"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>
      </div>

      {postResult && (
        <div className={clsx('mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2',
          postResult.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : ('manualFallback' in postResult && postResult.manualFallback) ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400')}>
          {postResult.success
            ? <><CheckCircle size={12} /><span>Posted! {postResult.post_url && <a href={postResult.post_url} target="_blank" rel="noreferrer" className="underline ml-1">View</a>}</span></>
            : ('manualFallback' in postResult && postResult.manualFallback)
              ? <>
                  <ExternalLink size={12} />
                  <span>Caption copied + X compose opened â paste and post!</span>
                  <button
                    onClick={() => markPosted.mutate(creative.id, { onSuccess: () => setPostResult(null) })}
                    disabled={markPosted.isPending}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all flex-shrink-0"
                  >
                    <CheckCircle size={10} /> {markPosted.isPending ? 'Saving...' : 'Mark Posted'}
                  </button>
                </>
              : <><XCircle size={12} /><span>Failed: {postResult.error}</span></>}
        </div>
      )}

      {/* Engagement Metrics â for posted creatives, enter real numbers from X/Twitter analytics */}
      {isPosted && (
        <div className="mt-2">
          {!showMetrics ? (
            <button
              onClick={() => {
                setShowMetrics(true)
                setMetricViews(String(creative.views ?? 0))
                setMetricClicks(String(creative.clicks ?? 0))
                setMetricConversions(String(creative.conversions ?? 0))
              }}
              className="flex items-center gap-1 text-[10px] text-lumina-dim hover:text-lumina-pulse transition-colors"
            >
              <BarChart3 size={10} /> Update metrics from X analytics
            </button>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-lumina-border/40">
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-lumina-dim">Views</label>
                <input type="number" value={metricViews} onChange={e => setMetricViews(e.target.value)} className="w-16 bg-lumina-bg border border-lumina-border rounded px-1.5 py-0.5 text-[10px] text-lumina-text font-mono" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-lumina-dim">Clicks</label>
                <input type="number" value={metricClicks} onChange={e => setMetricClicks(e.target.value)} className="w-16 bg-lumina-bg border border-lumina-border rounded px-1.5 py-0.5 text-[10px] text-lumina-text font-mono" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-lumina-dim">Conversions</label>
                <input type="number" value={metricConversions} onChange={e => setMetricConversions(e.target.value)} className="w-16 bg-lumina-bg border border-lumina-border rounded px-1.5 py-0.5 text-[10px] text-lumina-text font-mono" />
              </div>
              <button
                onClick={() => {
                  updateMetrics.mutate({
                    id: creative.id,
                    views: parseInt(metricViews) || 0,
                    clicks: parseInt(metricClicks) || 0,
                    conversions: parseInt(metricConversions) || 0,
                  }, { onSuccess: () => setShowMetrics(false) })
                }}
                disabled={updateMetrics.isPending}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-lumina-pulse/20 text-lumina-pulse hover:bg-lumina-pulse/30 border border-lumina-pulse/30 transition-all"
              >
                {updateMetrics.isPending ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle size={9} />} Save
              </button>
              <button onClick={() => setShowMetrics(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300">Cancel</button>
            </div>
          )}
        </div>
      )}

      <CreativePipelineSteps creative={creative} />
      <DebugPanel creative={creative} />
    </div>
  )
}

// âââ Distribution Channels ââââââââââââââââââââââââââââââââââââââââââââââââââ
const DISTRIBUTION_PLATFORMS = [
  { name: 'TikTok', icon: 'ðµ', color: 'border-pink-500/30' },
  { name: 'Instagram', icon: 'ð·', color: 'border-purple-500/30' },
  { name: 'YouTube', icon: 'â¶ï¸', color: 'border-red-500/30' },
  { name: 'LinkedIn', icon: 'ð¼', color: 'border-blue-500/30' },
  { name: 'Twitter/X', icon: 'â', color: 'border-sky-500/30' },
  { name: 'Facebook', icon: 'ð', color: 'border-blue-600/30' },
  { name: 'Pinterest', icon: 'ð', color: 'border-red-400/30' },
  { name: 'Threads', icon: 'ð§µ', color: 'border-gray-400/30' },
]

const TARGET_KEYWORDS = [
  'AI video generation', 'content automation', 'UGC creation', 'viral marketing',
  'creator tools', 'AI content swarm', 'automated social media', 'AI marketing',
]

// âââ Main component ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function ContentSwarm() {
  const { data: creatives = [], isLoading } = useUgcCreatives()
  const { data: seoKeywords = [] } = useSeoKeywords()
  const generateAndRun = useGenerateAndRun()
  const deleteCreative = useDeleteCreative()
  const qc = useQueryClient()

  const [showGenerateModal, setShowGenerateModal] = useState(false)

  // Stats
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayCreatives = creatives.filter(c => c.created_at?.startsWith(todayStr))
  const todayGenerated = todayCreatives.length
  const todayReady = todayCreatives.filter(c => ['ready', 'posted', 'live'].includes(c.status)).length
  const todayPosted = todayCreatives.filter(c => c.status === 'posted').length
  const totalReady = creatives.filter(c => c.video_url).length
  const totalPosted = creatives.filter(c => c.status === 'posted').length
  const devModeCount = creatives.filter(c => c.api_provider === 'dev-mode' || c.api_provider === 'fallback').length
  const totalViews = creatives.reduce((s, c) => s + (c.views ?? 0), 0)
  const totalClicks = creatives.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const totalConversions = creatives.reduce((s, c) => s + (c.conversions ?? 0), 0)

  const rankedKeywords = seoKeywords.filter(k => k.position && k.position <= 10)
  const seoScore = seoKeywords.length > 0
    ? Math.round((rankedKeywords.length / Math.max(seoKeywords.length, 1)) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl flex items-center gap-2">
            AI UGC + Content Swarm
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
              EXECUTION MODE
            </span>
          </h1>
          <p className="text-lumina-dim text-sm">Autonomous Revenue Engine | Viral Hooks | Auto-Post | Conversion Tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['ugc_creatives'] })}
            className="p-2 rounded-lg text-lumina-dim hover:text-lumina-text hover:bg-lumina-border/30 transition-all"
            title="Force refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button className="btn-pulse flex items-center gap-2" onClick={() => setShowGenerateModal(true)}>
            <Rocket size={14} /> Generate + Run
          </button>
        </div>
      </div>

      {/* DEV MODE Banner */}
      {devModeCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
          <div className="text-xs">
            <span className="text-amber-400 font-bold">DEV MODE ACTIVE</span>
            <span className="text-amber-400/70 ml-2">{devModeCount} creative{devModeCount > 1 ? 's' : ''} using placeholder video</span>
          </div>
        </div>
      )}

      {/* === PHASE 1: Auto-Runner Engine === */}
      <AutoRunnerPanel />

      {/* === Today's Dashboard Counters === */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="card-glow text-center py-3">
          <div className="text-[10px] text-lumina-dim flex items-center justify-center gap-1"><Target size={10} />Today Gen</div>
          <div className="text-xl font-bold font-mono text-lumina-text">{todayGenerated}</div>
          <div className="text-[9px] text-lumina-muted">/ 50 goal</div>
        </div>
        <div className="card-glow text-center py-3">
          <div className="text-[10px] text-lumina-dim flex items-center justify-center gap-1"><CheckCircle size={10} />Today Ready</div>
          <div className="text-xl font-bold font-mono text-emerald-400">{todayReady}</div>
          <div className="text-[9px] text-lumina-muted">/ 30 goal</div>
        </div>
        <div className="card-glow text-center py-3">
          <div className="text-[10px] text-lumina-dim flex items-center justify-center gap-1"><Send size={10} />Today Posted</div>
          <div className="text-xl font-bold font-mono text-blue-400">{todayPosted}</div>
        </div>
        <div className="card-glow text-center py-3">
          <div className="text-[10px] text-lumina-dim flex items-center justify-center gap-1"><BarChart3 size={10} />All Views</div>
          <div className="text-xl font-bold font-mono text-lumina-pulse">{totalViews > 999 ? `${(totalViews/1000).toFixed(0)}k` : totalViews}</div>
        </div>
        <div className="card-glow text-center py-3">
          <div className="text-[10px] text-lumina-dim flex items-center justify-center gap-1"><TrendingUp size={10} />Clicks</div>
          <div className="text-xl font-bold font-mono text-sky-400">{totalClicks}</div>
        </div>
        <div className="card-glow text-center py-3">
          <div className="text-[10px] text-lumina-dim flex items-center justify-center gap-1"><Zap size={10} />Conversions</div>
          <div className="text-xl font-bold font-mono text-lumina-gold">{totalConversions}</div>
        </div>
      </div>

      {/* === PHASE 3: Manual Post Queue === */}
      <ManualPostQueue creatives={creatives} />

      {/* Test Pipeline */}
      <TestPipelinePanel />

      {/* Creatives list */}
      <div className="card-glow">
        <div className="section-header flex items-center justify-between">
          <span className="flex items-center gap-2"><Video size={14} /> Active Creatives ({creatives.length})</span>
          <span className="text-[10px] text-lumina-dim font-mono">{totalReady} ready | {totalPosted} posted</span>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-lumina-dim text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : creatives.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <Rocket size={28} className="text-lumina-border mx-auto" />
            <p className="text-lumina-dim text-sm">No creatives yet. Start the engine or click <span className="text-lumina-pulse font-bold">Generate + Run</span>.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {creatives.map(c => <CreativeCard key={c.id} creative={c} onDelete={(id) => deleteCreative.mutate(id)} />)}
          </div>
        )}
      </div>

      {/* Distribution channels â shows real distribution data */}
      <div className="card-glow">
        <div className="section-header"><Globe size={14} /> Auto-Distribution Channels</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {DISTRIBUTION_PLATFORMS.map(p => {
            // Count how many creatives were actually distributed to this platform
            const distributed = creatives.filter(c =>
              c.distributed_to?.includes(p.name)
            ).length
            // Sum views for creatives distributed to this platform
            const platformViews = creatives
              .filter(c => c.distributed_to?.includes(p.name))
              .reduce((sum, c) => sum + (c.views ?? 0), 0)
            const isConnected = p.name === 'Twitter/X' // Only Twitter is actually connected
            return (
              <div key={p.name} className={clsx('p-3 rounded-lg border bg-lumina-bg/40 text-center transition-all hover:border-lumina-pulse/40', p.color)}>
                <div className="text-lg mb-1">{p.icon}</div>
                <div className="text-xs text-lumina-text font-medium">{p.name}</div>
                {distributed > 0 ? (
                  <div className="text-[10px] text-lumina-success mt-0.5 font-mono">
                    {distributed} posted{platformViews > 0 ? ` - ${platformViews} views` : ''}
                  </div>
                ) : isConnected ? (
                  <div className="text-[10px] text-amber-400 mt-0.5">Ready</div>
                ) : (
                  <div className="text-[10px] text-lumina-muted mt-0.5">Not connected</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* SEO */}
      <div className="card-glow">
        <div className="section-header"><TrendingUp size={14} /> SEO Optimizer</div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-lumina-dim">Score</span>
          <span className={clsx('text-xl font-bold font-mono', seoScore >= 70 ? 'text-lumina-success' : seoScore >= 40 ? 'text-lumina-gold' : 'text-lumina-danger')}>{seoScore}/100</span>
        </div>
        <div className="w-full bg-lumina-bg rounded-full h-2 mb-4 overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all duration-700', seoScore >= 70 ? 'bg-lumina-success' : seoScore >= 40 ? 'bg-lumina-gold' : 'bg-lumina-danger')} style={{ width: `${seoScore}%` }} />
        </div>
        {seoKeywords.length > 0 ? (
          <div className="space-y-1">
            {seoKeywords.map(k => (
              <div key={k.id} className="flex items-center justify-between text-xs py-1.5 border-b border-lumina-border/40 last:border-0">
                <span className="text-lumina-text font-medium">{k.keyword}</span>
                <span className={clsx('font-mono', k.position && k.position <= 10 ? 'text-lumina-success' : 'text-lumina-dim')}>#{k.position ?? '-'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-lumina-dim text-xs">No keywords tracked yet</div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <GenerateModal
          onClose={() => setShowGenerateModal(false)}
          onGenerate={(opts) => generateAndRun.mutate(opts)}
          isPending={generateAndRun.isPending}
        />
      )}
    </div>
  )
}
