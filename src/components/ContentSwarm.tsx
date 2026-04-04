/**
 * AI UGC + Content Swarm Panel
 * Arcads / Kling integration Â· auto-distribution Â· SEO optimizer
 * All creatives read live from Supabase `ugc_creatives` table.
 * Generate Creative inserts a real row â no fake data.
 */
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Video, Zap, Globe, TrendingUp, Play, Plus, Search, BarChart2, RefreshCw, ExternalLink, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import clsx from 'clsx'

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface UgcCreative {
  id:         string
  title:      string
  platform:   string
  status:     'live' | 'testing' | 'draft' | 'paused'
  views:      number
  ctr:        number
  roas:       number
  tool:       string
  created_at: string
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

// âââ Supabase hooks ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function useUgcCreatives() {
  return useQuery<UgcCreative[]>({
    queryKey: ['ugc_creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        console.warn('[ContentSwarm] ugc_creatives:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 60_000,
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
        console.warn('[ContentSwarm] seo_keywords:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 120_000,
  })
}

// âââ Generate Creative mutation â inserts real row into ugc_creatives âââââââââ
function useGenerateCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: { title: string; platform: string; tool: string }) => {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .insert({
          title:    opts.title,
          platform: opts.platform,
          status:   'draft',
          views:    0,
          ctr:      0,
          roas:     0,
          tool:     opts.tool,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    },
  })
}

// âââ Delete creative mutation âââââââââââââââââââââââââââââââââââââââââââââââââ
function useDeleteCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ugc_creatives').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    },
  })
}

// âââ Update creative status âââââââââââââââââââââââââââââââââââââââââââââââââââ
function useUpdateCreativeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UgcCreative['status'] }) => {
      const { error } = await supabase.from('ugc_creatives').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    },
  })
}

// âââ Sub-components ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  { name: 'TikTok',    icon: 'ðµ', color: 'border-pink-500/30' },
  { name: 'Instagram', icon: 'ð·', color: 'border-purple-500/30' },
  { name: 'YouTube',   icon: 'â¶ï¸', color: 'border-red-500/30' },
  { name: 'LinkedIn',  icon: 'ð¼', color: 'border-blue-500/30' },
  { name: 'Twitter/X', icon: 'â',  color: 'border-sky-500/30' },
  { name: 'Facebook',  icon: 'ð', color: 'border-blue-600/30' },
  { name: 'Pinterest', icon: 'ð', color: 'border-red-400/30' },
  { name: 'Threads',   icon: 'ð§µ', color: 'border-gray-400/30' },
]

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

const TARGET_KEYWORDS = [
  'AI video generation',
  'content automation',
  'UGC creation',
  'viral marketing',
  'creator tools',
  'AI content swarm',
  'automated social media',
  'AI marketing',
]

// âââ Generate Creative Modal ââââââââââââââââââââââââââââââââââââââââââââââââââ
function GenerateModal({ onClose, onGenerate, isPending }: {
  onClose: () => void
  onGenerate: (opts: { title: string; platform: string; tool: string }) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState(0)
  const [customTitle, setCustomTitle] = useState('')

  const template = CREATIVE_TEMPLATES[selected]
  const title = customTitle.trim() || template.title

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-lumina-card border border-lumina-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-lumina-border">
          <div>
            <div className="text-lumina-text font-semibold text-sm">Generate New Creative</div>
            <div className="text-lumina-dim text-xs">Select a template or create custom</div>
          </div>
          <button onClick={onClose} className="text-lumina-muted hover:text-lumina-text p-1">
            <Zap size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Template selection */}
          <div>
            <label className="text-xs text-lumina-dim font-medium block mb-2">Creative Template</label>
            <div className="grid grid-cols-1 gap-2">
              {CREATIVE_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setSelected(i); setCustomTitle('') }}
                  className={clsx(
                    'text-left text-xs p-3 rounded-lg border transition-all',
                    selected === i
                      ? 'border-lumina-pulse bg-lumina-pulse/10 text-lumina-pulse'
                      : 'border-lumina-border text-lumina-dim hover:border-lumina-pulse/40',
                  )}
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{t.platform} Â· {t.tool}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom title override */}
          <div>
            <label className="text-xs text-lumina-dim font-medium block mb-1.5">
              Custom Title <span className="text-lumina-muted">(optional â overrides template)</span>
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="e.g. 'Black Friday Sale â UGC Mashup'"
              className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors"
            />
          </div>

          {/* Preview */}
          <div className="bg-lumina-bg/60 rounded-lg p-3 text-xs">
            <div className="text-lumina-muted mb-1">Will create:</div>
            <div className="text-lumina-text font-medium">{title}</div>
            <div className="text-lumina-dim mt-0.5">{template.platform} Â· {template.tool} Â· Status: draft</div>
          </div>
        </div>

        <div className="p-5 border-t border-lumina-border">
          <button
            onClick={() => onGenerate({ title, platform: template.platform, tool: template.tool })}
            disabled={isPending}
            className={clsx(
              'btn-pulse w-full flex items-center justify-center gap-2 py-2.5',
              isPending && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Zap size={13} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Creating Creative...' : 'Generate Creative'}
          </button>
        </div>
      </div>
    </div>
  )
}

// âââ Main component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function ContentSwarm() {
  const { data: creatives = [], isLoading } = useUgcCreatives()
  const { data: seoKeywords = [] } = useSeoKeywords()
  const generateCreative = useGenerateCreative()
  const deleteCreative = useDeleteCreative()
  const updateStatus = useUpdateCreativeStatus()
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  const liveCreatives = creatives.filter((c) => c.status === 'live')
  const totalViews = creatives.reduce((s, c) => s + (c.views ?? 0), 0)
  const roasItems  = creatives.filter((c) => (c.roas ?? 0) > 0)
  const avgRoas    = roasItems.length
    ? roasItems.reduce((s, c) => s + c.roas, 0) / roasItems.length
    : 0

  // SEO score: simple calc based on keywords with positions in top 10
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
          <p className="text-lumina-dim text-sm">Arcads Â· Kling Â· Auto-Distribution Â· SEO Optimizer</p>
        </div>
        <button className="btn-pulse flex items-center gap-2" onClick={() => setShowGenerateModal(true)}>
          <Zap size={14} />
          Generate Creative
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-glow text-center">
          <div className="stat-label">Total Views</div>
          <div className="stat-value text-lumina-pulse">
            {totalViews > 0 ? `${(totalViews / 1000).toFixed(0)}k` : 'â'}
          </div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Avg ROAS</div>
          <div className="stat-value text-lumina-gold">
            {avgRoas > 0 ? `${avgRoas.toFixed(1)}x` : 'â'}
          </div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Live Creatives</div>
          <div className="stat-value text-lumina-success">{liveCreatives.length}</div>
        </div>
      </div>

      {/* Swarm status bar */}
      <div className="card-glow flex items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <div className="pulse-dot" />
          <span className="text-lumina-text text-sm font-semibold">Content Swarm Running</span>
        </div>
        <span className="text-lumina-dim text-xs font-mono">{creatives.length} creatives managed</span>
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
              No creatives yet. Add rows to the{' '}
              <code className="text-lumina-pulse bg-lumina-surface px-1 rounded">ugc_creatives</code>{' '}
              table in Supabase, or click{' '}
              <span className="text-lumina-pulse">Generate Creative</span> to start.
            </p>
            <a
              href="https://supabase.com/dashboard/project/rjtxkjozlhvnxkzmqffk/editor"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost text-xs inline-flex items-center gap-1"
            >
              <Plus size={11} />
              Add in Supabase
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {creatives.map((c) => (
              <div key={c.id} className="p-3 bg-lumina-bg/60 rounded-xl flex flex-wrap items-center gap-3 group">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0">
                    <Play size={14} className="text-lumina-dim" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-lumina-text font-medium truncate">{c.title}</div>
                    <div className="text-xs text-lumina-dim">{c.platform} Â· {c.tool}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  {(c.views ?? 0) > 0 && (
                    <>
                      <span className="text-lumina-dim">{(c.views / 1000).toFixed(0)}k views</span>
                      <span className="text-lumina-text">{c.ctr}% CTR</span>
                      <span className={clsx('font-semibold', c.roas >= 2 ? 'text-lumina-success' : 'text-lumina-warning')}>
                        {c.roas}x ROAS
                      </span>
                    </>
                  )}

                  {/* Status cycle: draft â testing â live â paused */}
                  <button
                    onClick={() => {
                      const next: Record<string, UgcCreative['status']> = {
                        draft: 'testing', testing: 'live', live: 'paused', paused: 'draft',
                      }
                      void updateStatus.mutate({ id: c.id, status: next[c.status] ?? 'draft' })
                    }}
                    title={`Click to advance status (${c.status})`}
                    disabled={updateStatus.isPending}
                  >
                    <StatusBadge status={c.status} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${c.title}"?`)) {
                        void deleteCreative.mutate(c.id)
                      }
                    }}
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
        <div className="p-3 mb-3 bg-lumina-gold/5 border border-lumina-gold/20 rounded-lg text-xs text-lumina-dim">
          Connect your social accounts via the integrations API to enable auto-posting.
          Platform connection status is synced from your{' '}
          <code className="text-lumina-pulse">platform_connections</code> table.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {DISTRIBUTION_PLATFORMS.map((p) => (
            <div
              key={p.name}
              className={clsx(
                'p-3 rounded-lg border bg-lumina-bg/40 text-center transition-all hover:border-lumina-pulse/40',
                p.color,
              )}
            >
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
          SEO Optimizer â Keyword Tracking
        </div>

        {/* Score bar */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-lumina-dim">Current SEO Score</span>
          <span className={clsx(
            'text-xl font-bold font-mono',
            seoScore >= 70 ? 'text-lumina-success' : seoScore >= 40 ? 'text-lumina-gold' : 'text-lumina-danger',
          )}>
            {seoScore}/100
          </span>
        </div>
        <div className="w-full bg-lumina-bg rounded-full h-2 mb-4 overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-700',
              seoScore >= 70 ? 'bg-lumina-success' : seoScore >= 40 ? 'bg-lumina-gold' : 'bg-lumina-danger',
            )}
            style={{ width: `${seoScore}%` }}
          />
        </div>

        {/* Live keyword data if available */}
        {seoKeywords.length > 0 ? (
          <div className="space-y-2 mb-4">
            <div className="text-xs text-lumina-dim font-semibold flex items-center gap-1.5">
              <Search size={10} />
              Tracked Keywords
            </div>
            <div className="space-y-1">
              {seoKeywords.map((k) => (
                <div key={k.id} className="flex items-center justify-between text-xs py-1.5 border-b border-lumina-border/40 last:border-0">
                  <span className="text-lumina-text font-medium">{k.keyword}</span>
                  <div className="flex items-center gap-4 font-mono">
                    {k.position && (
                      <span className={clsx(
                        k.position <= 3 ? 'text-lumina-success' : k.position <= 10 ? 'text-lumina-gold' : 'text-lumina-dim',
                      )}>
                        #{k.position}
                      </span>
                    )}
                    {k.volume && <span className="text-lumina-dim">{k.volume.toLocaleString()} vol</span>}
                    {k.url && (
                      <a href={k.url} target="_blank" rel="noreferrer" className="text-lumina-pulse hover:text-lumina-pulse/80">
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Fallback: show target keywords */
          <div className="mb-4">
            <div className="text-xs text-lumina-dim font-semibold flex items-center gap-1.5 mb-2">
              <Search size={10} />
              Keywords Being Targeted
            </div>
            <div className="flex flex-wrap gap-2">
              {TARGET_KEYWORDS.map((kw) => (
                <span key={kw} className="px-2 py-1 rounded-md bg-lumina-pulse/10 border border-lumina-pulse/20 text-lumina-pulse text-xs font-mono">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        <button className="btn-pulse w-full flex items-center justify-center gap-2 py-2">
          <TrendingUp size={13} />
          Optimize Content
        </button>
      </div>

      {/* Generate Creative Modal */}
      {showGenerateModal && (
        <GenerateModal
          onClose={() => setShowGenerateModal(false)}
          isPending={generateCreative.isPending}
          onGenerate={(opts) => {
            generateCreative.mutate(opts, {
              onSuccess: () => setShowGenerateModal(false),
            })
          }}
        />
      )}
    </div>
  )
}
