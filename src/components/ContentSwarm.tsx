/**
 * AI UGC + Content Swarm Panel — HARDENED PIPELINE + DEV MODE
 *
 * UGC → Kling (or DEV MODE fallback) → Supabase → Twitter
 *
 * Features:
 * - DEV MODE: if Kling fails (no credits, API down), uses placeholder video
 * - Pipeline ALWAYS completes: Generate → Save → Display → Distribute
 * - Per-creative Pipeline Status Panel: Generated ✅ → Saved ✅ → Posted ⏳/✅
 * - Per-creative "Post to X" button
 * - Video preview with playable video
 * - Visible "DEV MODE (No Kling Credits)" badge
 * - Supabase realtime auto-refresh after insert
 * - [UGC] logging at every step
 */
import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  generateAndSaveCreative,
  type PipelineStatus,
} from '../lib/ugcApi'
import {
  distributeToAll,
  postToTwitter,
  type DistributeResponse,
  type DistributionResult,
} from '../lib/distributeApi'
import clsx from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Logger ─────────────────────────────────────────────────────────────────
function ugcLog(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[UGC][${ts}] ${msg}`, data ? JSON.stringify(data) : '')
}

// ─── Supabase hooks with realtime ────────────────────────────────────────────
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
    staleTime: 30_000,
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
      if (error) {
        console.warn('[UGC] seo_keywords:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 120_000,
  })
}

// ─── Generate Creative mutation ──────────────────────────────────────────────
function useGenerateCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: {
      title: string
      platform: string
      tool: string
      prompt?: string
      duration?: '5' | '10'
      mode?: 'std' | 'pro'
      aspect_ratio?: '16:9' | '9:16' | '1:1'
      onProgress?: (status: string) => void
      onPipelineStatus?: (status: PipelineStatus) => void
    }) => {
      ugcLog('start — inserting draft row')
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
        })
        .select()
        .single()
      if (error) throw error
      ugcLog('draft row created', { id: creative.id, title: creative.title })

      // Fire generation — awaits for DEV MODE fallback to work
      try {
        await generateAndSaveCreative({
          creativeId: creative.id,
          prompt: opts.prompt || opts.title,
          duration: opts.duration || '5',
          mode: opts.mode || 'std',
          aspect_ratio: opts.aspect_ratio || '16:9',
          onProgress: opts.onProgress,
          onPipelineStatus: opts.onPipelineStatus,
        })
        qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
      } catch (err) {
        ugcLog('pipeline error', { error: err instanceof Error ? err.message : String(err), creativeId: creative.id })
        await supabase
          .from('ugc_creatives')
          .update({ status: 'failed' })
          .eq('id', creative.id)
        qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
      }

      return creative
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
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

function useDistributeCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (creativeId: string): Promise<DistributeResponse> => {
      const result = await distributeToAll(creativeId)
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
      return result
    },
  })
}

// ─── Post to X mutation (single platform) ────────────────────────────────────
function usePostToX() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (creativeId: string): Promise<DistributionResult> => {
      ugcLog('Post to X initiated', { creative_id: creativeId })
      const result = await postToTwitter(creativeId)

      if (result.success) {
        await supabase
          .from('ugc_creatives')
          .update({ status: 'posted', distributed_to: ['Twitter/X'] })
          .eq('id', creativeId)
      }

      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
      return result
    },
  })
}

// ─── DEV MODE Badge ──────────────────────────────────────────────────────────
function DevModeBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
      <AlertCircle size={10} />
      DEV MODE (No Kling Credits)
    </span>
  )
}

// ─── Pipeline Status Tracker Component ───────────────────────────────────────
function PipelineTracker({ status }: { status: PipelineStatus | null }) {
  if (!status || status.step === 'idle') return null

  const steps: { key: string; label: string }[] = [
    { key: 'generating', label: 'Generated' },
    { key: 'saving', label: 'Saved' },
    { key: 'posting', label: 'Posted' },
    { key: 'complete', label: 'Complete' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status.step)
  const isError = status.step === 'error'

  return (
    <div className={clsx(
      'card-glow p-4 border-l-4',
      isError ? 'border-l-red-500 bg-red-500/5' : 'border-l-lumina-pulse bg-lumina-pulse/5'
    )}>
      <div className="flex items-center gap-2 mb-3">
        {isError ? (
          <XCircle size={16} className="text-red-500" />
        ) : status.step === 'complete' ? (
          <CheckCircle size={16} className="text-lumina-success" />
        ) : (
          <Loader2 size={16} className="text-lumina-pulse animate-spin" />
        )}
        <span className="text-sm font-semibold text-lumina-text">
          {isError ? 'Pipeline Failed' : status.step === 'complete' ? 'Pipeline Complete' : 'Pipeline Running'}
        </span>
        {status.devMode && <DevModeBadge />}
      </div>
      <div className="flex items-center gap-1 mb-3">
        {steps.map((s, i) => {
          const done = !isError && (currentIdx > i || status.step === 'complete')
          const active = !isError && currentIdx === i && status.step !== 'complete'
          return (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold flex-1 text-center justify-center',
                done && 'bg-lumina-success/20 text-lumina-success',
                active && 'bg-lumina-pulse/20 text-lumina-pulse animate-pulse',
                !done && !active && 'bg-lumina-bg text-lumina-muted',
              )}>
                {done && <CheckCircle size={10} />}
                {active && <Loader2 size={10} className="animate-spin" />}
                {s.label}
              </div>
              {i < steps.length - 1 && (
                <ArrowRight size={10} className={clsx(done ? 'text-lumina-success' : 'text-lumina-muted')} />
              )}
            </div>
          )
        })}
      </div>
      <div className="text-xs text-lumina-dim font-mono">
        {status.message}
        {status.detail && <span className="text-lumina-muted ml-1">({status.detail})</span>}
      </div>
    </div>
  )
}

// ─── Per-Creative Pipeline Step Indicators ────────────────────────────────────
function CreativePipelineSteps({ creative, postResult }: {
  creative: UgcCreative
  postResult?: { success: boolean; post_url?: string; error?: string } | null
}) {
  const hasVideo = !!creative.video_url
  const isSaved = hasVideo && ['ready', 'posted', 'live'].includes(creative.status)
  const isPosted = creative.status === 'posted' || (creative.distributed_to && creative.distributed_to.length > 0)
  const isFailed = creative.status === 'failed'
  const postFailed = postResult && !postResult.success

  const steps = [
    { label: 'Generated', done: hasVideo, failed: isFailed && !hasVideo, pending: false },
    { label: 'Saved', done: isSaved, failed: false, pending: false },
    { label: 'Posted', done: !!isPosted, failed: !!postFailed, pending: isSaved && !isPosted && !postFailed },
  ]

  return (
    <div className="flex items-center gap-1 mt-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1">
          <div className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold',
            s.done && 'bg-emerald-500/20 text-emerald-400',
            s.failed && 'bg-red-500/20 text-red-400',
            s.pending && 'bg-amber-500/15 text-amber-400',
            !s.done && !s.failed && !s.pending && 'bg-zinc-800 text-zinc-500',
          )}>
            {s.done && <CheckCircle size={9} />}
            {s.failed && <XCircle size={9} />}
            Step {i + 1}: {s.label} {s.done ? '\u2705' : s.failed ? '\u274C' : s.pending ? '\u23F3' : ''}
          </div>
          {i < steps.length - 1 && <ArrowRight size={8} className="text-zinc-600" />}
        </div>
      ))}
    </div>
  )
}

// ─── Test Pipeline Panel ─────────────────────────────────────────────────────
function TestPipelinePanel() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<Array<{ step: string; status: 'ok' | 'fail' | 'skip' | 'running'; msg: string }>>([])

  const addLog = useCallback((step: string, status: 'ok' | 'fail' | 'skip' | 'running', msg: string) => {
    setLog(prev => {
      const idx = prev.findIndex(l => l.step === step && l.status === 'running')
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { step, status, msg }
        return next
      }
      return [...prev, { step, status, msg }]
    })
  }, [])

  const runTest = useCallback(async () => {
    setRunning(true)
    setLog([])
    ugcLog('TEST PIPELINE — starting full flow (DEV MODE enabled)')

    // Step 1: Insert
    addLog('insert', 'running', 'Inserting test creative row...')
    let creativeId = '' as string
    try {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .insert({
          title: `[TEST] Pipeline ${new Date().toISOString().slice(11, 19)}`,
          platform: 'Twitter/X',
          status: 'draft',
          views: 0, ctr: 0, roas: 0,
          tool: 'Kling',
          api_provider: 'kling',
          generation_prompt: 'Test: A sleek trading dashboard with glowing cyan charts',
        })
        .select()
        .single()
      if (error) throw error
      creativeId = data.id
      addLog('insert', 'ok', `Row created: ${creativeId.slice(0, 8)}...`)
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    } catch (err) {
      addLog('insert', 'fail', `DB insert failed: ${err instanceof Error ? err.message : String(err)}`)
      setRunning(false)
      return
    }

    // Step 2: Generate (Kling or DEV MODE fallback)
    addLog('generate', 'running', 'Generating video (Kling or DEV MODE)...')
    try {
      const result = await generateAndSaveCreative({
        creativeId,
        prompt: 'Test: A sleek trading dashboard with glowing cyan charts and dark background',
        duration: '5',
        mode: 'std',
        aspect_ratio: '16:9',
        onPipelineStatus: (status) => {
          if (status.step === 'generating') {
            addLog('generate', 'running', status.message)
          }
        },
      })
      const modeLabel = result.devMode ? 'DEV MODE placeholder' : 'Kling AI'
      addLog('generate', 'ok', `Video ready (${modeLabel}): ${result.video_url.slice(0, 50)}...`)
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    } catch (err) {
      addLog('generate', 'fail', `Generation failed: ${err instanceof Error ? err.message : String(err)}`)
      setRunning(false)
      return
    }

    // Step 3: Verify DB
    addLog('verify-db', 'running', 'Checking Supabase row...')
    try {
      const { data: row } = await supabase
        .from('ugc_creatives')
        .select('id, video_url, status, platform_ready, api_provider, caption')
        .eq('id', creativeId)
        .single()
      if (row?.video_url) {
        addLog('verify-db', 'ok', `DB confirmed: video_url present, status=${row.status}, provider=${row.api_provider}`)
      } else {
        addLog('verify-db', 'fail', 'DB row exists but video_url is null')
        setRunning(false)
        return
      }
    } catch (err) {
      addLog('verify-db', 'fail', `DB check failed: ${err instanceof Error ? err.message : String(err)}`)
      setRunning(false)
      return
    }

    // Step 4: Post to Twitter/X
    addLog('twitter', 'running', 'Posting to Twitter/X...')
    try {
      const tweetResult = await postToTwitter(creativeId)
      if (tweetResult.success) {
        addLog('twitter', 'ok', `Tweet posted: ${tweetResult.post_url || 'no URL returned'}`)
        await supabase.from('ugc_creatives').update({ status: 'posted' }).eq('id', creativeId)
      } else {
        addLog('twitter', 'fail', `Twitter failed: ${tweetResult.error}`)
      }
    } catch (err) {
      addLog('twitter', 'fail', `Twitter error: ${err instanceof Error ? err.message : String(err)}`)
    }

    ugcLog('TEST PIPELINE — complete')
    qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    setRunning(false)
  }, [addLog, qc])

  const allOk = log.length > 0 && log.every(l => l.status === 'ok')
  const hasFail = log.some(l => l.status === 'fail')

  return (
    <div className="card-glow border-2 border-dashed border-lumina-pulse/30">
      <div className="flex items-center justify-between p-4 border-b border-lumina-border">
        <div className="flex items-center gap-2">
          <TestTube2 size={16} className="text-lumina-pulse" />
          <span className="text-sm font-bold text-lumina-text">Pipeline Test</span>
          <span className="text-[10px] text-lumina-dim font-mono">Kling (or DEV MODE) → Supabase → Twitter</span>
        </div>
        <button
          onClick={runTest}
          disabled={running}
          className={clsx('btn-pulse text-xs px-4 py-1.5 flex items-center gap-1.5', running && 'opacity-50 cursor-not-allowed')}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <TestTube2 size={12} />}
          {running ? 'Running...' : 'Run Test'}
        </button>
      </div>
      {log.length > 0 && (
        <div className="p-4 space-y-2">
          {log.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs font-mono">
              {l.status === 'ok' && <CheckCircle size={13} className="text-lumina-success flex-shrink-0 mt-0.5" />}
              {l.status === 'fail' && <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />}
              {l.status === 'running' && <Loader2 size={13} className="text-lumina-pulse animate-spin flex-shrink-0 mt-0.5" />}
              {l.status === 'skip' && <AlertCircle size={13} className="text-lumina-gold flex-shrink-0 mt-0.5" />}
              <div>
                <span className="text-lumina-text font-semibold">[{l.step}]</span>{' '}
                <span className="text-lumina-dim">{l.msg}</span>
              </div>
            </div>
          ))}
          {!running && log.length > 0 && (
            <div className={clsx(
              'mt-3 p-3 rounded-lg text-xs font-bold text-center',
              allOk && 'bg-lumina-success/10 text-lumina-success border border-lumina-success/30',
              hasFail && 'bg-red-500/10 text-red-400 border border-red-500/30',
            )}>
              {allOk ? 'PIPELINE COMPLETE: Generate \u2192 Save \u2192 Post' : 'PIPELINE INCOMPLETE \u2014 check logs above'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    ready: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    posted: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    testing: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    draft: 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/30',
    paused: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    failed: 'bg-red-500/20 text-red-400 border border-red-500/30',
  }
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', map[status] ?? 'bg-zinc-700/40 text-zinc-400')}>{status}</span>
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DISTRIBUTION_PLATFORMS = [
  { name: 'TikTok', icon: '\uD83C\uDFB5', color: 'border-pink-500/30' },
  { name: 'Instagram', icon: '\uD83D\uDCF7', color: 'border-purple-500/30' },
  { name: 'YouTube', icon: '\u25B6\uFE0F', color: 'border-red-500/30' },
  { name: 'LinkedIn', icon: '\uD83D\uDCBC', color: 'border-blue-500/30' },
  { name: 'Twitter/X', icon: '\u2715', color: 'border-sky-500/30' },
  { name: 'Facebook', icon: '\uD83D\uDCD8', color: 'border-blue-600/30' },
  { name: 'Pinterest', icon: '\uD83D\uDCCC', color: 'border-red-400/30' },
  { name: 'Threads', icon: '\uD83E\uDDF5', color: 'border-gray-400/30' },
]

const CREATIVE_TEMPLATES = [
  { title: 'Product Testimonial \u2014 AI Voice Clone', platform: 'TikTok', tool: 'Arcads' },
  { title: 'Problem/Solution Hook \u2014 Stock Footage', platform: 'Instagram', tool: 'Kling' },
  { title: 'Before/After Transformation \u2014 UGC Style', platform: 'YouTube', tool: 'Arcads' },
  { title: 'FAQ Explainer \u2014 AI Avatar', platform: 'LinkedIn', tool: 'Kling' },
  { title: 'Trending Sound Remix \u2014 Split Screen', platform: 'TikTok', tool: 'Arcads' },
  { title: 'Customer Story \u2014 Cinematic B-Roll', platform: 'Instagram', tool: 'Kling' },
  { title: 'Pain Point Callout \u2014 Text Overlay', platform: 'Twitter/X', tool: 'Arcads' },
  { title: 'How-To Tutorial \u2014 Screen Recording + VO', platform: 'YouTube', tool: 'Kling' },
]

const TARGET_KEYWORDS = [
  'AI video generation', 'content automation', 'UGC creation', 'viral marketing',
  'creator tools', 'AI content swarm', 'automated social media', 'AI marketing',
]

// ─── Generate Creative Modal ─────────────────────────────────────────────────
function GenerateModal({ onClose, onGenerate, isPending, pipelineStatus }: {
  onClose: () => void
  onGenerate: (opts: {
    title: string; platform: string; tool: string; prompt?: string
    duration?: '5' | '10'; mode?: 'std' | 'pro'; aspect_ratio?: '16:9' | '9:16' | '1:1'
  }) => void
  isPending: boolean
  pipelineStatus: PipelineStatus | null
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
            <div className="text-lumina-text font-semibold text-sm">Generate New Creative</div>
            <div className="text-lumina-dim text-xs">
              {isKling ? 'Kling AI \u2014 auto DEV MODE fallback if no credits' : 'Arcads template \u2014 draft only'}
            </div>
          </div>
          <button onClick={onClose} className="text-lumina-muted hover:text-lumina-text p-1"><Zap size={16} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
          {pipelineStatus && pipelineStatus.step !== 'idle' && <PipelineTracker status={pipelineStatus} />}
          <div>
            <label className="text-xs text-lumina-dim font-medium block mb-2">Creative Template</label>
            <div className="grid grid-cols-1 gap-2">
              {CREATIVE_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setSelected(i); setCustomTitle(''); setCustomPrompt('') }}
                  className={clsx(
                    'text-left text-xs p-3 rounded-lg border transition-all',
                    selected === i
                      ? 'border-lumina-pulse bg-lumina-pulse/10 text-lumina-pulse'
                      : 'border-lumina-border text-lumina-dim hover:border-lumina-pulse/40',
                  )}
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    {t.platform} | {t.tool} {t.tool === 'Kling' && ' \u2014 Real AI Video (DEV MODE fallback)'}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-lumina-dim font-medium block mb-1.5">
              Custom Title <span className="text-lumina-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="e.g. 'Black Friday Sale \u2014 UGC Mashup'"
              className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors"
            />
          </div>
          {isKling && (
            <>
              <div>
                <label className="text-xs text-lumina-dim font-medium block mb-1.5">
                  Video Prompt <span className="text-lumina-muted">(sent to Kling AI)</span>
                </label>
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder={defaultPrompt}
                  rows={3}
                  className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-lumina-dim font-medium block mb-1">Duration</label>
                  <select value={duration} onChange={e => setDuration(e.target.value as '5' | '10')} className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-2 py-1.5 text-xs text-lumina-text">
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-lumina-dim font-medium block mb-1">Quality</label>
                  <select value={mode} onChange={e => setMode(e.target.value as 'std' | 'pro')} className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-2 py-1.5 text-xs text-lumina-text">
                    <option value="std">Standard</option>
                    <option value="pro">Pro (slower)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-lumina-dim font-medium block mb-1">Aspect</label>
                  <select value={aspect} onChange={e => setAspect(e.target.value as '16:9' | '9:16' | '1:1')} className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-2 py-1.5 text-xs text-lumina-text">
                    <option value="16:9">16:9 landscape</option>
                    <option value="9:16">9:16 portrait</option>
                    <option value="1:1">1:1 square</option>
                  </select>
                </div>
              </div>
            </>
          )}
          <div className="bg-lumina-bg/60 rounded-lg p-3 text-xs">
            <div className="text-lumina-muted mb-1">Will create:</div>
            <div className="text-lumina-text font-medium">{title}</div>
            <div className="text-lumina-dim mt-0.5">
              {template.platform} | {template.tool} | Status: draft
              {isKling && ` | ${duration}s | ${mode} | ${aspect}`}
            </div>
            {isKling && (
              <div className="mt-2 text-amber-400 text-[10px] font-semibold">
                If Kling has no credits \u2192 DEV MODE auto-activates with placeholder video. Pipeline ALWAYS completes.
              </div>
            )}
          </div>
        </div>
        <div className="p-5 border-t border-lumina-border">
          <button
            onClick={() => onGenerate({
              title, platform: template.platform, tool: template.tool,
              prompt: customPrompt.trim() || defaultPrompt, duration, mode, aspect_ratio: aspect,
            })}
            disabled={isPending}
            className={clsx('btn-pulse w-full flex items-center justify-center gap-2 py-2.5', isPending && 'opacity-50 cursor-not-allowed')}
          >
            <Zap size={13} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Creating Creative...' : 'Generate Creative'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Creative Card with Video Preview, Pipeline Steps, Post to X ────────────
function CreativeCard({ creative, onDelete }: {
  creative: UgcCreative
  onDelete: (id: string) => void
}) {
  const postToX = usePostToX()
  const distributeCreative = useDistributeCreative()
  const [postResult, setPostResult] = useState<DistributionResult | null>(null)
  const isDevMode = creative.api_provider === 'dev-mode'
  const hasVideo = !!creative.video_url
  const isPosted = creative.status === 'posted' || (creative.distributed_to && creative.distributed_to.length > 0)

  return (
    <div className="p-4 bg-lumina-bg/60 rounded-xl border border-lumina-border/50 group hover:border-lumina-pulse/30 transition-all">
      <div className="flex items-start gap-3">
        {/* Video Preview */}
        {hasVideo ? (
          <div className="w-32 h-20 rounded-lg overflow-hidden flex-shrink-0 relative bg-black">
            <video
              src={creative.video_url || ''}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              onMouseEnter={e => { const v = e.target as HTMLVideoElement; v.play().catch(() => {}) }}
              onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
              poster={creative.thumbnail_url || undefined}
            />
            {isDevMode && (
              <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-amber-500/90 text-black text-[8px] font-bold rounded">DEV MODE</div>
            )}
            <div className="absolute bottom-1 right-1 bg-emerald-500/90 text-white text-[8px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
              <Film size={8} /> READY
            </div>
          </div>
        ) : creative.status === 'testing' || creative.status === 'draft' ? (
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
            <StatusBadge status={creative.status} />
            {isDevMode && <DevModeBadge />}
          </div>
          <div className="text-xs text-lumina-dim">
            {creative.platform} | {creative.tool}
            {creative.api_provider && <span className="ml-1 text-lumina-muted">({creative.api_provider})</span>}
          </div>
          {creative.caption && (
            <div className="text-[11px] text-lumina-dim mt-1 line-clamp-2 italic">
              &quot;{creative.caption.slice(0, 120)}{creative.caption.length > 120 ? '...' : ''}&quot;
            </div>
          )}
          {(creative.views ?? 0) > 0 && (
            <div className="flex items-center gap-3 text-xs font-mono mt-1.5">
              <span className="text-lumina-dim">{(creative.views / 1000).toFixed(0)}k views</span>
              <span className="text-lumina-text">{creative.ctr}% CTR</span>
              <span className={clsx('font-semibold', creative.roas >= 2 ? 'text-lumina-success' : 'text-lumina-warning')}>{creative.roas}x ROAS</span>
            </div>
          )}
          {creative.distributed_to && creative.distributed_to.length > 0 && (
            <div className="text-[10px] text-lumina-gold mt-1">Distributed: {creative.distributed_to.join(', ')}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {hasVideo && !isPosted && (
            <button
              onClick={() => postToX.mutate(creative.id, {
                onSuccess: (res) => setPostResult(res),
                onError: (err) => setPostResult({ platform: 'Twitter/X', success: false, error: err instanceof Error ? err.message : String(err) }),
              })}
              disabled={postToX.isPending}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                postToX.isPending
                  ? 'bg-sky-500/10 text-sky-400 cursor-not-allowed'
                  : 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 border border-sky-500/30',
              )}
            >
              {postToX.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {postToX.isPending ? 'Posting...' : 'Post to X'}
            </button>
          )}
          {hasVideo && (
            <a
              href={creative.video_url || ''}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-lumina-pulse/10 text-lumina-pulse hover:bg-lumina-pulse/20 border border-lumina-pulse/20 transition-all"
            >
              <ExternalLink size={11} /> Open Video
            </a>
          )}
          {hasVideo && creative.status === 'live' && (
            <button
              onClick={() => distributeCreative.mutate(creative.id)}
              disabled={distributeCreative.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-lumina-pulse/10 text-lumina-pulse hover:bg-lumina-pulse/20 border border-lumina-pulse/20 transition-all"
            >
              {distributeCreative.isPending ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
              Distribute All
            </button>
          )}
          <button
            onClick={() => { if (window.confirm(`Delete "${creative.title}"?`)) onDelete(creative.id) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>
      </div>

      {/* Post result */}
      {postResult && (
        <div className={clsx(
          'mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2',
          postResult.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400',
        )}>
          {postResult.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {postResult.success
            ? <span>Posted to X! {postResult.post_url && <a href={postResult.post_url} target="_blank" rel="noreferrer" className="underline ml-1">View tweet</a>}</span>
            : <span>Post failed: {postResult.error}</span>}
        </div>
      )}

      {/* Pipeline Steps */}
      <CreativePipelineSteps creative={creative} postResult={postResult} />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ContentSwarm() {
  const { data: creatives = [], isLoading } = useUgcCreatives()
  const { data: seoKeywords = [] } = useSeoKeywords()
  const generateCreative = useGenerateCreative()
  const deleteCreative = useDeleteCreative()

  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)

  const liveCreatives = creatives.filter((c) => ['live', 'ready', 'posted'].includes(c.status))
  const videosReady = creatives.filter((c) => c.video_url).length
  const devModeCount = creatives.filter((c) => c.api_provider === 'dev-mode').length
  const videosGenerating = creatives.filter((c) => c.api_provider === 'kling' && !c.video_url && ['testing', 'draft'].includes(c.status)).length
  const totalViews = creatives.reduce((s, c) => s + (c.views ?? 0), 0)
  const roasItems = creatives.filter((c) => (c.roas ?? 0) > 0)
  const avgRoas = roasItems.length ? roasItems.reduce((s, c) => s + c.roas, 0) / roasItems.length : 0

  const rankedKeywords = seoKeywords.filter(k => k.position && k.position <= 10)
  const seoScore = seoKeywords.length > 0
    ? Math.round((rankedKeywords.length / Math.max(seoKeywords.length, 1)) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">AI UGC + Content Swarm</h1>
          <p className="text-lumina-dim text-sm">Kling AI | DEV MODE Fallback | Pipeline Always Completes</p>
        </div>
        <button className="btn-pulse flex items-center gap-2" onClick={() => setShowGenerateModal(true)}>
          <Zap size={14} /> Generate Creative
        </button>
      </div>

      {/* Global DEV MODE banner */}
      {devModeCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
          <div className="text-xs">
            <span className="text-amber-400 font-bold">DEV MODE ACTIVE</span>
            <span className="text-amber-400/70 ml-2">
              {devModeCount} creative{devModeCount > 1 ? 's' : ''} using placeholder video (Kling has no credits).
              Pipeline still works: Generate \u2192 Save \u2192 Display \u2192 Distribute
            </span>
          </div>
        </div>
      )}

      {/* Pipeline Status Tracker */}
      <PipelineTracker status={pipelineStatus} />

      {/* Test Pipeline */}
      <TestPipelinePanel />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-glow text-center">
          <div className="stat-label">Total Views</div>
          <div className="stat-value text-lumina-pulse">{totalViews > 0 ? `${(totalViews / 1000).toFixed(0)}k` : '\u2014'}</div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Avg ROAS</div>
          <div className="stat-value text-lumina-gold">{avgRoas > 0 ? `${avgRoas.toFixed(1)}x` : '\u2014'}</div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Pipeline Ready</div>
          <div className="stat-value text-lumina-success">{liveCreatives.length}</div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">AI Videos</div>
          <div className="stat-value text-lumina-pulse">
            {videosReady}
            {videosGenerating > 0 && <span className="text-xs text-lumina-dim ml-1">+{videosGenerating} gen</span>}
          </div>
        </div>
      </div>

      {/* Creatives list */}
      <div className="card-glow">
        <div className="section-header"><Video size={14} /> Active Creatives</div>
        {isLoading ? (
          <div className="text-center py-8 text-lumina-dim text-sm">Loading...</div>
        ) : creatives.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <Play size={28} className="text-lumina-border mx-auto" />
            <p className="text-lumina-dim text-sm">
              No creatives yet. Click <span className="text-lumina-pulse">Generate Creative</span> to start.
              <br />
              <span className="text-amber-400 text-[11px]">DEV MODE auto-activates if Kling has no credits \u2014 pipeline always completes.</span>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {creatives.map((c) => (
              <CreativeCard key={c.id} creative={c} onDelete={(id) => deleteCreative.mutate(id)} />
            ))}
          </div>
        )}
      </div>

      {/* Distribution channels */}
      <div className="card-glow">
        <div className="section-header"><Globe size={14} /> Auto-Distribution Channels</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {DISTRIBUTION_PLATFORMS.map((p) => (
            <div key={p.name} className={clsx('p-3 rounded-lg border bg-lumina-bg/40 text-center transition-all hover:border-lumina-pulse/40', p.color)}>
              <div className="text-lg mb-1">{p.icon}</div>
              <div className="text-xs text-lumina-text font-medium">{p.name}</div>
              <div className="text-[10px] text-lumina-success mt-0.5">Enabled</div>
            </div>
          ))}
        </div>
      </div>

      {/* SEO optimizer */}
      <div className="card-glow">
        <div className="section-header"><TrendingUp size={14} /> SEO Optimizer</div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-lumina-dim">Current SEO Score</span>
          <span className={clsx('text-xl font-bold font-mono',
            seoScore >= 70 ? 'text-lumina-success' : seoScore >= 40 ? 'text-lumina-gold' : 'text-lumina-danger'
          )}>{seoScore}/100</span>
        </div>
        <div className="w-full bg-lumina-bg rounded-full h-2 mb-4 overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all duration-700',
            seoScore >= 70 ? 'bg-lumina-success' : seoScore >= 40 ? 'bg-lumina-gold' : 'bg-lumina-danger'
          )} style={{ width: `${seoScore}%` }} />
        </div>
        {seoKeywords.length > 0 ? (
          <div className="space-y-2 mb-4">
            <div className="text-xs text-lumina-dim font-semibold flex items-center gap-1.5"><Search size={10} />Tracked Keywords</div>
            <div className="space-y-1">
              {seoKeywords.map((k) => (
                <div key={k.id} className="flex items-center justify-between text-xs py-1.5 border-b border-lumina-border/40 last:border-0">
                  <span className="text-lumina-text font-medium">{k.keyword}</span>
                  <div className="flex items-center gap-4 font-mono">
                    {k.position && <span className={clsx(k.position <= 3 ? 'text-lumina-success' : k.position <= 10 ? 'text-lumina-gold' : 'text-lumina-dim')}>#{k.position}</span>}
                    {k.volume && <span className="text-lumina-dim">{k.volume.toLocaleString()} vol</span>}
                    {k.url && <a href={k.url} target="_blank" rel="noreferrer" className="text-lumina-pulse hover:text-lumina-pulse/80"><ExternalLink size={10} /></a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="text-xs text-lumina-dim font-semibold flex items-center gap-1.5 mb-2"><Search size={10} />Keywords Being Targeted</div>
            <div className="flex flex-wrap gap-2">
              {TARGET_KEYWORDS.map((kw) => (
                <span key={kw} className="px-2 py-1 rounded-md bg-lumina-pulse/10 border border-lumina-pulse/20 text-lumina-pulse text-xs font-mono">{kw}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <GenerateModal
          onClose={() => setShowGenerateModal(false)}
          isPending={generateCreative.isPending}
          pipelineStatus={pipelineStatus}
          onGenerate={(opts) => {
            generateCreative.mutate(
              {
                title: opts.title, platform: opts.platform, tool: opts.tool,
                prompt: opts.prompt, duration: opts.duration, mode: opts.mode,
                aspect_ratio: opts.aspect_ratio, onPipelineStatus: setPipelineStatus,
              },
              { onSuccess: () => setShowGenerateModal(false) },
            )
          }}
        />
      )}
    </div>
  )
}
