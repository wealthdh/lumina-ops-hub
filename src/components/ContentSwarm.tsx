/**
 * AI UGC + Content Swarm Panel — HARDENED PIPELINE
 *
 * UGC → Kling → Supabase → Twitter
 *
 * Features:
 * - Visible pipeline status: Generating → Saving → Posting → Complete
 * - Retry logic (2x) on Kling + Twitter failures
 * - Supabase realtime auto-refresh after insert
 * - [UGC] logging at every step
 * - "Test Pipeline" button for full-flow verification
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Video, Zap, Globe, TrendingUp, Play, Plus, Search,
  ExternalLink, Trash2, Loader2, CheckCircle, AlertCircle,
  Film, TestTube2, ArrowRight, RefreshCw, XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  generateAndSaveCreative, checkKlingApiHealth,
  type PipelineStatus,
} from '../lib/ugcApi'
import {
  distributeToAll, postToTwitter,
  type DistributeResponse,
} from '../lib/distributeApi'
import clsx from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────────────
interface UgcCreative {
  id:                string
  title:             string
  platform:          string
  status:            'live' | 'testing' | 'draft' | 'paused'
  views:             number
  ctr:               number
  roas:              number
  tool:              string
  created_at:        string
  video_url?:        string | null
  thumbnail_url?:    string | null
  caption?:          string | null
  platform_ready?:   boolean
  distributed_to?:   string[]
  generation_prompt?: string | null
  api_provider?:     string | null
}

interface SeoKeyword {
  id:         string
  keyword:    string
  position:   number | null
  volume:     number | null
  difficulty: number | null
  url:        string | null
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

  // Auto-refresh on realtime INSERT/UPDATE
  useEffect(() => {
    const channel = supabase
      .channel('ugc_creatives_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ugc_creatives' },
        (payload) => {
          ugcLog('realtime update', { event: payload.eventType, id: (payload.new as Record<string, unknown>)?.id })
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
          title:             opts.title,
          platform:          opts.platform,
          status:            'draft',
          views:             0,
          ctr:               0,
          roas:              0,
          tool:              opts.tool,
          api_provider:      'kling',
          generation_prompt: opts.prompt || opts.title,
        })
        .select()
        .single()
      if (error) throw error

      ugcLog('draft row created', { id: creative.id, title: creative.title })

      if (opts.tool === 'Kling') {
        // Fire Kling generation — NOT detached, we await it for status tracking
        generateAndSaveCreative({
          creativeId: creative.id,
          prompt: opts.prompt || opts.title,
          duration: opts.duration || '5',
          mode: opts.mode || 'std',
          aspect_ratio: opts.aspect_ratio || '16:9',
          onProgress: opts.onProgress,
          onPipelineStatus: opts.onPipelineStatus,
        }).then(() => {
          qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
        }).catch((err) => {
          ugcLog('pipeline error', { error: err.message, creativeId: creative.id })
          supabase
            .from('ugc_creatives')
            .update({ status: 'paused' })
            .eq('id', creative.id)
            .then(() => qc.invalidateQueries({ queryKey: ['ugc_creatives'] }))
        })
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

function useUpdateCreativeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UgcCreative['status'] }) => {
      const { error } = await supabase.from('ugc_creatives').update({ status }).eq('id', id)
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

// ─── Pipeline Status Tracker Component ───────────────────────────────────────
function PipelineTracker({ status }: { status: PipelineStatus | null }) {
  if (!status || status.step === 'idle') return null

  const steps: { key: string; label: string }[] = [
    { key: 'generating', label: 'Generating' },
    { key: 'saving',     label: 'Saving' },
    { key: 'posting',    label: 'Posting' },
    { key: 'complete',   label: 'Complete' },
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
      </div>

      {/* Step indicators */}
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
                <ArrowRight size={10} className={clsx(
                  done ? 'text-lumina-success' : 'text-lumina-muted',
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Status message */}
      <div className="text-xs text-lumina-dim font-mono">
        {status.message}
        {status.detail && <span className="text-lumina-muted ml-1">({status.detail})</span>}
      </div>
    </div>
  )
}

// ─── Test Pipeline Button + Modal ────────────────────────────────────────────
function TestPipelinePanel() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<Array<{ step: string; status: 'ok' | 'fail' | 'skip' | 'running'; msg: string }>>([])

  const addLog = useCallback((step: string, status: 'ok' | 'fail' | 'skip' | 'running', msg: string) => {
    setLog(prev => {
      // Update existing step if running, otherwise add new
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
    ugcLog('TEST PIPELINE — starting full flow')

    // ── Step 1: Insert test creative ────────────────────────────────
    addLog('insert', 'running', 'Inserting test creative row...')
    let creativeId = "" as string
    try {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .insert({
          title: `[TEST] Pipeline test ${new Date().toISOString().slice(11, 19)}`,
          platform: 'Twitter/X',
          status: 'draft',
          views: 0, ctr: 0, roas: 0,
          tool: 'Kling',
          api_provider: 'kling',
          generation_prompt: 'Test: A sleek trading dashboard with glowing cyan charts and dark background',
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

    // ── Step 2: Generate via Kling ──────────────────────────────────
    addLog('kling', 'running', 'Sending to Kling AI...')
    try {
      const result = await generateAndSaveCreative({
        creativeId,
        prompt: 'Test: A sleek trading dashboard with glowing cyan charts and dark background',
        duration: '5',
        mode: 'std',
        aspect_ratio: '16:9',
        onPipelineStatus: (status) => {
          if (status.step === 'generating') {
            addLog('kling', 'running', status.message)
          }
        },
      })
      addLog('kling', 'ok', `Video generated: ${result.video_url.slice(0, 60)}...`)
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    } catch (err) {
      addLog('kling', 'fail', `Kling failed: ${err instanceof Error ? err.message : String(err)}`)
      setRunning(false)
      return
    }

    // ── Step 3: Verify DB row ───────────────────────────────────────
    addLog('verify-db', 'running', 'Checking Supabase row...')
    try {
      const { data: row } = await supabase
        .from('ugc_creatives')
        .select('id, video_url, status, platform_ready')
        .eq('id', creativeId)
        .single()
      if (row?.video_url) {
        addLog('verify-db', 'ok', `DB row confirmed: video_url present, status=${row.status}`)
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

    // ── Step 4: Post to Twitter/X ───────────────────────────────────
    addLog('twitter', 'running', 'Posting to Twitter/X...')
    try {
      const tweetResult = await postToTwitter(creativeId)
      if (tweetResult.success) {
        addLog('twitter', 'ok', `Tweet posted: ${tweetResult.post_url || 'no URL returned'}`)
      } else {
        addLog('twitter', 'fail', `Twitter failed: ${tweetResult.error}`)
      }
    } catch (err) {
      addLog('twitter', 'fail', `Twitter error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // ── Done ────────────────────────────────────────────────────────
    ugcLog('TEST PIPELINE — complete')
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
          <span className="text-[10px] text-lumina-dim font-mono">Kling → Supabase → Twitter</span>
        </div>
        <button
          onClick={runTest}
          disabled={running}
          className={clsx(
            'btn-pulse text-xs px-4 py-1.5 flex items-center gap-1.5',
            running && 'opacity-50 cursor-not-allowed',
          )}
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
              {allOk
                ? 'TEST PASSED: Kling → Supabase → Twitter'
                : 'TEST FAILED — check logs above'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    live:    'badge-success',
    testing: 'badge-gold',
    draft:   'badge bg-lumina-muted/20 text-lumina-dim',
    paused:  'badge-danger',
  }
  return <span className={clsx('badge', map[status] ?? 'badge')}>{status}</span>
}

const DISTRIBUTION_PLATFORMS = [
  { name: 'TikTok',    icon: '🎵', color: 'border-pink-500/30' },
  { name: 'Instagram', icon: '📷', color: 'border-purple-500/30' },
  { name: 'YouTube',   icon: '►️', color: 'border-red-500/30' },
  { name: 'LinkedIn',  icon: '💼', color: 'border-blue-500/30' },
  { name: 'Twitter/X', icon: '✕',  color: 'border-sky-500/30' },
  { name: 'Facebook',  icon: '📘', color: 'border-blue-600/30' },
  { name: 'Pinterest', icon: '📌', color: 'border-red-400/30' },
  { name: 'Threads',   icon: '🧵', color: 'border-gray-400/30' },
]

const CREATIVE_TEMPLATES = [
  { title: 'Product Testimonial — AI Voice Clone', platform: 'TikTok', tool: 'Arcads' },
  { title: 'Problem/Solution Hook — Stock Footage', platform: 'Instagram', tool: 'Kling' },
  { title: 'Before/After Transformation — UGC Style', platform: 'YouTube', tool: 'Arcads' },
  { title: 'FAQ Explainer — AI Avatar', platform: 'LinkedIn', tool: 'Kling' },
  { title: 'Trending Sound Remix — Split Screen', platform: 'TikTok', tool: 'Arcads' },
  { title: 'Customer Story — Cinematic B-Roll', platform: 'Instagram', tool: 'Kling' },
  { title: 'Pain Point Callout — Text Overlay', platform: 'Twitter/X', tool: 'Arcads' },
  { title: 'How-To Tutorial — Screen Recording + VO', platform: 'YouTube', tool: 'Kling' },
]

const TARGET_KEYWORDS = [
  'AI video generation', 'content automation', 'UGC creation', 'viral marketing',
  'creator tools', 'AI content swarm', 'automated social media', 'AI marketing',
]

// ─── Generate Creative Modal ─────────────────────────────────────────────────
function GenerateModal({ onClose, onGenerate, isPending, pipelineStatus }: {
  onClose: () => void
  onGenerate: (opts: {
    title: string; platform: string; tool: string;
    prompt?: string; duration?: '5' | '10'; mode?: 'std' | 'pro';
    aspect_ratio?: '16:9' | '9:16' | '1:1'
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
              {isKling ? '⚡ Kling AI — Real video generation (2x retry)' : 'Arcads template — draft only'}
            </div>
          </div>
          <button onClick={onClose} className="text-lumina-muted hover:text-lumina-text p-1">
            <Zap size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
          {/* Pipeline status inside modal */}
          {pipelineStatus && pipelineStatus.step !== 'idle' && (
            <PipelineTracker status={pipelineStatus} />
          )}

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
                    {t.platform} | {t.tool}
                    {t.tool === 'Kling' && ' ⚡ Real AI Video'}
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
              placeholder="e.g. 'Black Friday Sale — UGC Mashup'"
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
              <div className="mt-2 text-lumina-pulse text-[10px]">
                ⚡ Kling AI with 2x retry (~1-3 min) → auto-save to Supabase
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-lumina-border">
          <button
            onClick={() => onGenerate({
              title,
              platform: template.platform,
              tool: template.tool,
              prompt: customPrompt.trim() || defaultPrompt,
              duration, mode, aspect_ratio: aspect,
            })}
            disabled={isPending}
            className={clsx(
              'btn-pulse w-full flex items-center justify-center gap-2 py-2.5',
              isPending && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Zap size={13} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Creating Creative...' : isKling ? '⚡ Generate with Kling AI' : 'Generate Creative'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ContentSwarm() {
  const { data: creatives = [], isLoading } = useUgcCreatives()
  const { data: seoKeywords = [] } = useSeoKeywords()
  const generateCreative = useGenerateCreative()
  const deleteCreative = useDeleteCreative()
  const updateStatus = useUpdateCreativeStatus()
  const distributeCreative = useDistributeCreative()
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [distributeResult, setDistributeResult] = useState<DistributeResponse | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)

  const liveCreatives = creatives.filter((c) => c.status === 'live')
  const videosReady = creatives.filter((c) => c.video_url).length
  const videosGenerating = creatives.filter((c) => c.api_provider === 'kling' && !c.video_url && c.status === 'testing').length
  const totalViews = creatives.reduce((s, c) => s + (c.views ?? 0), 0)
  const roasItems  = creatives.filter((c) => (c.roas ?? 0) > 0)
  const avgRoas    = roasItems.length ? roasItems.reduce((s, c) => s + c.roas, 0) / roasItems.length : 0
  const rankedKeywords = seoKeywords.filter(k => k.position && k.position <= 10)
  const seoScore = seoKeywords.length > 0 ? Math.round((rankedKeywords.length / Math.max(seoKeywords.length, 1)) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">AI UGC + Content Swarm</h1>
          <p className="text-lumina-dim text-sm">Kling AI | Auto-Distribution | 2x Retry | [UGC] Logging</p>
        </div>
        <button className="btn-pulse flex items-center gap-2" onClick={() => setShowGenerateModal(true)}>
          <Zap size={14} />
          Generate Creative
        </button>
      </div>

      {/* Pipeline Status Tracker — shows when active */}
      <PipelineTracker status={pipelineStatus} />

      {/* Test Pipeline */}
      <TestPipelinePanel />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-glow text-center">
          <div className="stat-label">Total Views</div>
          <div className="stat-value text-lumina-pulse">
            {totalViews > 0 ? `${(totalViews / 1000).toFixed(0)}k` : '—'}
          </div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Avg ROAS</div>
          <div className="stat-value text-lumina-gold">
            {avgRoas > 0 ? `${avgRoas.toFixed(1)}x` : '—'}
          </div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Live Creatives</div>
          <div className="stat-value text-lumina-success">{liveCreatives.length}</div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">AI Videos</div>
          <div className="stat-value text-lumina-pulse">
            {videosReady}
            {videosGenerating > 0 && (
              <span className="text-xs text-lumina-dim ml-1">+{videosGenerating} gen</span>
            )}
          </div>
        </div>
      </div>

      {/* Creatives list */}
      <div className="card-glow">
        <div className="section-header">
          <Video size={14} />
          Active Creatives
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-lumina-dim text-sm">Loading...</div>
        ) : creatives.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <Play size={28} className="text-lumina-border mx-auto" />
            <p className="text-lumina-dim text-sm">
              No creatives yet. Click <span className="text-lumina-pulse">Generate Creative</span> to start,
              or run the <span className="text-lumina-pulse">Pipeline Test</span> above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {creatives.map((c) => (
              <div key={c.id} className="p-3 bg-lumina-bg/60 rounded-xl flex flex-wrap items-center gap-3 group">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {c.video_url ? (
                    <a href={c.video_url} target="_blank" rel="noreferrer" className="w-14 h-10 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden relative hover:ring-2 ring-lumina-pulse transition-all" title="Open video">
                      <Film size={14} className="text-lumina-success" />
                      <div className="absolute bottom-0 right-0 bg-lumina-success/90 text-[8px] text-white px-1 rounded-tl">READY</div>
                    </a>
                  ) : c.api_provider === 'kling' && c.status === 'testing' ? (
                    <div className="w-14 h-10 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0 animate-pulse">
                      <Loader2 size={14} className="text-lumina-pulse animate-spin" />
                    </div>
                  ) : (
                    <div className="w-14 h-10 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0">
                      <Play size={14} className="text-lumina-dim" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm text-lumina-text font-medium truncate">{c.title}</div>
                    <div className="text-xs text-lumina-dim">
                      {c.platform} | {c.tool}
                      {c.api_provider === 'kling' && c.video_url && <span className="text-lumina-success ml-1">| Video ready</span>}
                      {c.api_provider === 'kling' && !c.video_url && c.status === 'testing' && <span className="text-lumina-pulse ml-1">| Generating...</span>}
                      {c.distributed_to && c.distributed_to.length > 0 && <span className="text-lumina-gold ml-1">| Distributed: {c.distributed_to.join(', ')}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  {(c.views ?? 0) > 0 && (
                    <>
                      <span className="text-lumina-dim">{(c.views / 1000).toFixed(0)}k views</span>
                      <span className="text-lumina-text">{c.ctr}% CTR</span>
                      <span className={clsx('font-semibold', c.roas >= 2 ? 'text-lumina-success' : 'text-lumina-warning')}>{c.roas}x ROAS</span>
                    </>
                  )}
                  {c.video_url && (
                    <a href={c.video_url} target="_blank" rel="noreferrer" className="text-lumina-pulse hover:text-lumina-pulse/80" title="Open video">
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button
                    onClick={() => {
                      const next: Record<string, UgcCreative['status']> = { draft: 'testing', testing: 'live', live: 'paused', paused: 'draft' }
                      void updateStatus.mutate({ id: c.id, status: next[c.status] ?? 'draft' })
                    }}
                    title={`Click to advance status (${c.status})`}
                    disabled={updateStatus.isPending}
                  >
                    <StatusBadge status={c.status} />
                  </button>
                  {c.status === 'live' && (
                    <button
                      onClick={() => distributeCreative.mutate(c.id, { onSuccess: (res) => setDistributeResult(res) })}
                      disabled={distributeCreative.isPending}
                      className="text-lumina-pulse hover:text-lumina-pulse/80 flex items-center gap-1 text-[10px] font-semibold"
                      title="Distribute to all platforms"
                    >
                      {distributeCreative.isPending ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                      Distribute
                    </button>
                  )}
                  <button
                    onClick={() => { if (window.confirm(`Delete "${c.title}"?`)) void deleteCreative.mutate(c.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-lumina-muted hover:text-lumina-danger"
                    title="Delete creative"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribution channels */}
      <div className="card-glow">
        <div className="section-header">
          <Globe size={14} />
          Auto-Distribution Channels
        </div>
        {distributeResult && (
          <div className="p-3 mb-3 bg-lumina-success/10 border border-lumina-success/30 rounded-lg text-xs text-lumina-text flex items-start justify-between">
            <div>
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <CheckCircle size={12} className="text-lumina-success" />
                Distributed to {distributeResult.successful}/{distributeResult.total} platforms
              </div>
              <div className="text-lumina-dim space-x-2">
                {distributeResult.results.map((r) => (
                  <span key={r.platform} className={r.success ? 'text-lumina-success' : 'text-lumina-danger'}>
                    {r.success ? '✓' : '✗'} {r.platform}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={() => setDistributeResult(null)} className="text-lumina-muted hover:text-lumina-text ml-2">✕</button>
          </div>
        )}
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
        <div className="section-header">
          <TrendingUp size={14} />
          SEO Optimizer — Keyword Tracking
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-lumina-dim">Current SEO Score</span>
          <span className={clsx('text-xl font-bold font-mono', seoScore >= 70 ? 'text-lumina-success' : seoScore >= 40 ? 'text-lumina-gold' : 'text-lumina-danger')}>{seoScore}/100</span>
        </div>
        <div className="w-full bg-lumina-bg rounded-full h-2 mb-4 overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all duration-700', seoScore >= 70 ? 'bg-lumina-success' : seoScore >= 40 ? 'bg-lumina-gold' : 'bg-lumina-danger')} style={{ width: `${seoScore}%` }} />
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

      {/* Generate Creative Modal */}
      {showGenerateModal && (
        <GenerateModal
          onClose={() => setShowGenerateModal(false)}
          isPending={generateCreative.isPending}
          pipelineStatus={pipelineStatus}
          onGenerate={(opts) => {
            generateCreative.mutate(
              {
                title: opts.title,
                platform: opts.platform,
                tool: opts.tool,
                prompt: opts.prompt,
                duration: opts.duration,
                mode: opts.mode,
                aspect_ratio: opts.aspect_ratio,
                onPipelineStatus: setPipelineStatus,
              },
              { onSuccess: () => setShowGenerateModal(false) },
            )
          }}
        />
      )}
    </div>
  )
}
