/**
 * AI UGC + Content Swarm Panel
 * Arcads / Kling integration · auto-distribution · SEO optimizer
 * All creatives read live from Supabase `ugc_creatives` table.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Video, Zap, Globe, TrendingUp, Play, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Supabase hook ────────────────────────────────────────────────────────────
function useUgcCreatives() {
  return useQuery<UgcCreative[]>({
    queryKey: ['ugc_creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        // Table may not exist yet — return empty rather than crash
        console.warn('[ContentSwarm] ugc_creatives:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 60_000,
  })
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
  { name: 'TikTok',    icon: '🎵' },
  { name: 'Instagram', icon: '📷' },
  { name: 'YouTube',   icon: '▶️' },
  { name: 'LinkedIn',  icon: '💼' },
  { name: 'Twitter/X', icon: '✕'  },
  { name: 'Facebook',  icon: '📘' },
  { name: 'Pinterest', icon: '📌' },
  { name: 'Threads',   icon: '🧵' },
]

// ─── Main component ───────────────────────────────────────────────────────────
export default function ContentSwarm() {
  const { data: creatives = [], isLoading } = useUgcCreatives()
  const qc = useQueryClient()
  const [generating, setGenerating] = useState(false)

  function generate() {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    }, 3000)
  }

  const liveCreatives = creatives.filter((c) => c.status === 'live')
  const totalViews = creatives.reduce((s, c) => s + (c.views ?? 0), 0)
  const roasItems  = creatives.filter((c) => (c.roas ?? 0) > 0)
  const avgRoas    = roasItems.length
    ? roasItems.reduce((s, c) => s + c.roas, 0) / roasItems.length
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">AI UGC + Content Swarm</h1>
          <p className="text-lumina-dim text-sm">Arcads · Kling · Auto-Distribution · SEO Optimizer</p>
        </div>
        <button className="btn-pulse flex items-center gap-2" onClick={generate}>
          <Zap size={14} className={generating ? 'animate-pulse-fast' : ''} />
          {generating ? 'Generating...' : 'Generate Creative'}
        </button>
      </div>

      {/* Generation progress */}
      {generating && (
        <div className="card-glow border-lumina-pulse/30 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="pulse-dot" />
            <span className="text-lumina-pulse text-sm font-semibold">AI generating UGC video creative...</span>
          </div>
          <div className="w-full bg-lumina-bg rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-violet rounded-full animate-pulse-slow w-3/4" />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-lumina-dim font-mono">
            <span>✓ Script generated</span>
            <span>✓ Voice cloned</span>
            <span className="text-lumina-pulse">⟳ Rendering video...</span>
            <span>○ Distributing</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
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
              <div key={c.id} className="p-3 bg-lumina-bg/60 rounded-xl flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-lumina-border rounded-lg flex items-center justify-center flex-shrink-0">
                    <Play size={14} className="text-lumina-dim" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-lumina-text font-medium truncate">{c.title}</div>
                    <div className="text-xs text-lumina-dim">{c.platform} · {c.tool}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  {(c.views ?? 0) > 0 && (
                    <>
                      <span className="text-lumina-dim">{(c.views / 1000).toFixed(0)}k views</span>
                      <span className="text-lumina-text">{c.ctr}% CTR</span>
                      <span className={clsx('font-semibold', c.roas >= 2 ? 'text-lumina-success' : 'text-lumina-warning')}>
                        {c.roas}x ROAS
                      </span>
                    </>
                  )}
                  <StatusBadge status={c.status} />
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
            <div key={p.name} className="p-3 rounded-lg border bg-lumina-bg/40 border-lumina-border opacity-70 text-center">
              <div className="text-lg mb-1">{p.icon}</div>
              <div className="text-xs text-lumina-text font-medium">{p.name}</div>
              <div className="text-[10px] text-lumina-dim mt-0.5">Connect in Settings</div>
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
        <div className="text-center py-8 text-lumina-dim text-sm">
          <TrendingUp size={24} className="mx-auto mb-2 text-lumina-border" />
          Connect Google Search Console to track live keyword rankings and search volume.
          <br />
          <span className="text-xs mt-1 block">
            Add your GSC credentials to{' '}
            <code className="text-lumina-pulse bg-lumina-surface px-1 rounded">seo_keywords</code>{' '}
            table to enable live tracking.
          </span>
        </div>
      </div>
    </div>
  )
}
