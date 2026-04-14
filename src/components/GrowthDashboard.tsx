/**
 * GrowthDashboard — Revenue Growth Analytics
 *
 * Surfaces real DB data:
 *   - Top hooks by CTR / conversions
 *   - Revenue per creative / per product
 *   - Platform performance breakdown
 *   - Daily posting cadence & peak-hour scheduler
 *   - Click funnel: impressions → clicks → conversions → revenue
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CreativeAnalytic {
  id: string
  title: string
  platform: string
  hook_score: number
  caption: string
  monetization_url: string | null
  status: string
  views: number
  clicks: number
  conversions: number
  ctr: number          // clicks / views
  cvr: number          // conversions / clicks
  revenue_usd: number
  roas: number
  posted_at: string | null
  created_at: string
}

interface PlatformStat {
  platform: string
  count: number
  views: number
  clicks: number
  conversions: number
  revenue: number
  avg_ctr: number
  avg_hook: number
}

interface DailyRevenue {
  date: string
  revenue: number
  posts: number
  clicks: number
}

interface ProductRevenue {
  product: string
  url_fragment: string
  revenue: number
  conversions: number
  creatives: number
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useTopCreatives(limit = 20) {
  return useQuery<CreativeAnalytic[]>({
    queryKey: ['growth_top_creatives', limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('ugc_creatives')
        .select('id, title, platform, hook_score, caption, monetization_url, status, views, clicks, conversions, ctr, cvr, revenue_usd, roas, posted_at, created_at')
        .eq('user_id', user.id)
        .order('revenue_usd', { ascending: false })
        .limit(limit)
      if (!data) return []
      return data.map((r: Record<string, unknown>) => ({
        id:              String(r.id ?? ''),
        title:           String(r.title ?? ''),
        platform:        String(r.platform ?? 'twitter'),
        hook_score:      Number(r.hook_score ?? 0),
        caption:         String(r.caption ?? ''),
        monetization_url: r.monetization_url ? String(r.monetization_url) : null,
        status:          String(r.status ?? ''),
        views:           Number(r.views ?? 0),
        clicks:          Number(r.clicks ?? 0),
        conversions:     Number(r.conversions ?? 0),
        ctr:             Number(r.ctr ?? 0),
        cvr:             Number(r.cvr ?? 0),
        revenue_usd:     Number(r.revenue_usd ?? 0),
        roas:            Number(r.roas ?? 0),
        posted_at:       r.posted_at ? String(r.posted_at) : null,
        created_at:      String(r.created_at ?? ''),
      }))
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

function usePlatformStats() {
  return useQuery<PlatformStat[]>({
    queryKey: ['growth_platform_stats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('ugc_creatives')
        .select('platform, views, clicks, conversions, revenue_usd, hook_score')
        .eq('user_id', user.id)
      if (!data) return []

      const map = new Map<string, PlatformStat>()
      for (const r of data as Array<{ platform: string; views: number; clicks: number; conversions: number; revenue_usd: number; hook_score: number }>) {
        const p = r.platform || 'twitter'
        const s = map.get(p) ?? { platform: p, count: 0, views: 0, clicks: 0, conversions: 0, revenue: 0, avg_ctr: 0, avg_hook: 0 }
        s.count++
        s.views       += Number(r.views ?? 0)
        s.clicks      += Number(r.clicks ?? 0)
        s.conversions += Number(r.conversions ?? 0)
        s.revenue     += Number(r.revenue_usd ?? 0)
        s.avg_hook    += Number(r.hook_score ?? 0)
        map.set(p, s)
      }

      return Array.from(map.values()).map(s => ({
        ...s,
        avg_ctr:  s.views > 0 ? (s.clicks / s.views) * 100 : 0,
        avg_hook: s.count > 0 ? s.avg_hook / s.count : 0,
      })).sort((a, b) => b.revenue - a.revenue)
    },
    staleTime: 60_000,
  })
}

function useDailyRevenue(days = 14) {
  return useQuery<DailyRevenue[]>({
    queryKey: ['growth_daily_revenue', days],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      // Income entries for UGC (creative_id is not null)
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
      const { data: income } = await supabase
        .from('income_entries')
        .select('amount, entry_date')
        .eq('user_id', user.id)
        .gte('entry_date', cutoff)
        .not('creative_id' as string, 'is', null)

      // Posts per day from ugc_creatives
      const { data: posts } = await supabase
        .from('ugc_creatives')
        .select('posted_at, clicks')
        .eq('user_id', user.id)
        .eq('status', 'posted')
        .gte('posted_at', cutoff + 'T00:00:00Z')

      const map = new Map<string, DailyRevenue>()

      // Seed with last N days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
        map.set(d, { date: d, revenue: 0, posts: 0, clicks: 0 })
      }

      for (const e of (income ?? []) as Array<{ amount: number; entry_date: string }>) {
        const d = String(e.entry_date).slice(0, 10)
        const s = map.get(d)
        if (s) s.revenue += Number(e.amount)
      }

      for (const p of (posts ?? []) as Array<{ posted_at: string; clicks: number }>) {
        const d = String(p.posted_at ?? '').slice(0, 10)
        const s = map.get(d)
        if (s) { s.posts++; s.clicks += Number(p.clicks ?? 0) }
      }

      return Array.from(map.values())
    },
    staleTime: 60_000,
  })
}

function useProductRevenue() {
  return useQuery<ProductRevenue[]>({
    queryKey: ['growth_product_revenue'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('ugc_creatives')
        .select('monetization_url, revenue_usd, conversions')
        .eq('user_id', user.id)
        .not('monetization_url', 'is', null)

      const PRODUCTS: Record<string, string> = {
        'mt5-gold':     'MT5 Gold Scalper EA ($97)',
        'polymarket':   'Polymarket Edge Scanner ($47)',
        'ai-prompt':    'AI Prompt Toolkit ($29)',
        'ugc-swarm':    'UGC Swarm Templates ($19)',
        'kelly-pro':    'Kelly Pro Calculator ($14.99)',
      }

      const map = new Map<string, ProductRevenue>()
      for (const [key, label] of Object.entries(PRODUCTS)) {
        map.set(key, { product: label, url_fragment: key, revenue: 0, conversions: 0, creatives: 0 })
      }

      for (const r of (data ?? []) as Array<{ monetization_url: string; revenue_usd: number; conversions: number }>) {
        const url = String(r.monetization_url ?? '')
        for (const key of Object.keys(PRODUCTS)) {
          if (url.includes(key)) {
            const s = map.get(key)!
            s.revenue     += Number(r.revenue_usd ?? 0)
            s.conversions += Number(r.conversions ?? 0)
            s.creatives++
            break
          }
        }
      }

      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
    },
    staleTime: 60_000,
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏',
  tiktok: '♪',
  instagram: '◈',
  youtube: '▶',
  linkedin: 'in',
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter:   '#1d9bf0',
  tiktok:    '#ff0050',
  instagram: '#e1306c',
  youtube:   '#ff0000',
  linkedin:  '#0077b5',
}

const PEAK_HOURS: Record<string, string[]> = {
  twitter:   ['8 AM', '12 PM', '5 PM', '9 PM'],
  tiktok:    ['6 AM', '2 PM', '9 PM'],
  instagram: ['7 AM', '11 AM', '6 PM'],
  youtube:   ['12 PM', '4 PM', '8 PM'],
  linkedin:  ['9 AM', '12 PM', '5 PM'],
}

function fmt$(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function scoreColor(s: number) {
  if (s >= 90) return '#22c55e'
  if (s >= 75) return '#f59e0b'
  return '#ef4444'
}

function miniBar(value: number, max: number, color: string) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 6 }}>
      <div style={{ width: `${pct}%`, background: color, borderRadius: 3, height: 6, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// Simple sparkline using inline SVG
function Sparkline({ data, color = '#22c55e', height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />
  const max = Math.max(...data, 0.01)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 120
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts.split(' ').pop()?.split(',')[0]} cy={pts.split(' ').pop()?.split(',')[1]} r={3} fill={color} />
    </svg>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'hooks' | 'platforms' | 'products' | 'cadence'

export default function GrowthDashboard() {
  const [tab, setTab] = useState<Tab>('overview')
  const [hookFilter, setHookFilter] = useState<'all' | 'viral' | 'good'>('viral')

  const { data: creatives = [], isLoading: loadingC } = useTopCreatives(50)
  const { data: platforms = [] } = usePlatformStats()
  const { data: daily = [] } = useDailyRevenue(14)
  const { data: products = [] } = useProductRevenue()

  // Portfolio-level KPIs from top creatives
  const allViews       = creatives.reduce((s, c) => s + c.views,       0)
  const allClicks      = creatives.reduce((s, c) => s + c.clicks,      0)
  const allConversions = creatives.reduce((s, c) => s + c.conversions,  0)
  const allRevenue     = creatives.reduce((s, c) => s + c.revenue_usd,  0)
  const avgHook        = creatives.length > 0 ? creatives.reduce((s, c) => s + c.hook_score, 0) / creatives.length : 0
  const overallCTR     = allViews  > 0 ? (allClicks / allViews) * 100 : 0
  const overallCVR     = allClicks > 0 ? (allConversions / allClicks) * 100 : 0

  // Revenue trend for sparkline
  const revTrend = daily.map(d => d.revenue)

  // Filter creatives for hook analysis
  const filteredHooks = creatives.filter(c => {
    if (hookFilter === 'viral') return c.hook_score >= 90
    if (hookFilter === 'good')  return c.hook_score >= 75 && c.hook_score < 90
    return true
  }).slice(0, 15)

  const maxRev = Math.max(...creatives.map(c => c.revenue_usd), 0.01)

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: '#0a0a0f',
      color: '#e2e8f0',
      minHeight: '100vh',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },
    pulse: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#22c55e',
      boxShadow: '0 0 8px #22c55e',
      animation: 'pulse 2s infinite',
    },
    title: {
      fontSize: 22,
      fontWeight: 700,
      background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    kpiGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12,
      marginBottom: 24,
    },
    kpiCard: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '16px',
    },
    kpiLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 1 },
    kpiValue: { fontSize: 26, fontWeight: 700, margin: '4px 0 2px' },
    kpiSub:   { fontSize: 12, color: '#64748b' },
    tabs: {
      display: 'flex',
      gap: 4,
      marginBottom: 20,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      paddingBottom: 0,
    },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '8px 16px',
      borderRadius: '8px 8px 0 0',
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      color: active ? '#22c55e' : '#64748b',
      background: active ? 'rgba(34,197,94,0.08)' : 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid #22c55e' : '2px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
    card: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '20px',
      marginBottom: 16,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: 13,
    },
    th: {
      textAlign: 'left' as const,
      color: '#64748b',
      fontSize: 11,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
      padding: '8px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    td: {
      padding: '10px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      verticalAlign: 'middle' as const,
    },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
    }),
  }

  return (
    <div style={styles.container}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }`}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.pulse} />
        <span style={styles.title}>Growth Dashboard</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
          Live · {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* KPI Row */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Revenue</div>
          <div style={{ ...styles.kpiValue, color: '#22c55e' }}>{fmt$(allRevenue)}</div>
          <div style={styles.kpiSub}>
            <Sparkline data={revTrend} color="#22c55e" height={24} />
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Views</div>
          <div style={{ ...styles.kpiValue, color: '#06b6d4' }}>{fmtN(allViews)}</div>
          <div style={styles.kpiSub}>{fmtN(allClicks)} clicks</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Overall CTR</div>
          <div style={{ ...styles.kpiValue, color: '#f59e0b' }}>{overallCTR.toFixed(2)}%</div>
          <div style={styles.kpiSub}>CVR {overallCVR.toFixed(2)}%</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Conversions</div>
          <div style={{ ...styles.kpiValue, color: '#a78bfa' }}>{fmtN(allConversions)}</div>
          <div style={styles.kpiSub}>{fmt$(allRevenue / Math.max(allConversions, 1))} / sale</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Avg Hook Score</div>
          <div style={{ ...styles.kpiValue, color: scoreColor(avgHook) }}>{avgHook.toFixed(1)}</div>
          <div style={styles.kpiSub}>{creatives.filter(c => c.hook_score >= 90).length} viral hooks</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Creatives</div>
          <div style={{ ...styles.kpiValue, color: '#e2e8f0' }}>{creatives.length}</div>
          <div style={styles.kpiSub}>{creatives.filter(c => c.status === 'posted').length} posted</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['overview', 'hooks', 'platforms', 'products', 'cadence'] as Tab[]).map(t => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <>
          {/* Daily revenue + posts chart */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📈 14-Day Revenue & Posts</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
              {daily.map((d, i) => {
                const maxRev14 = Math.max(...daily.map(x => x.revenue), 0.01)
                const h = Math.max(4, (d.revenue / maxRev14) * 70)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div
                      style={{ width: '100%', height: h, background: d.revenue > 0 ? 'linear-gradient(#22c55e, #059669)' : 'rgba(255,255,255,0.06)', borderRadius: '3px 3px 0 0', transition: 'height 0.4s' }}
                      title={`${d.date}: ${fmt$(d.revenue)} | ${d.posts} posts`}
                    />
                    <div style={{ fontSize: 9, color: '#475569', writingMode: 'vertical-rl' as const, textOrientation: 'mixed' as const, transform: 'rotate(180deg)', height: 28 }}>
                      {d.date.slice(5)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top 5 revenue creatives */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🏆 Top Revenue Creatives</div>
            {loadingC ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Creative</th>
                    <th style={styles.th}>Platform</th>
                    <th style={styles.th}>Hook</th>
                    <th style={styles.th}>Views</th>
                    <th style={styles.th}>CTR</th>
                    <th style={styles.th}>Revenue</th>
                    <th style={styles.th}>Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {creatives.slice(0, 8).map(c => (
                    <tr key={c.id}>
                      <td style={styles.td}>
                        <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {c.title}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(PLATFORM_COLORS[c.platform] ?? '#64748b')}>
                          {PLATFORM_ICONS[c.platform] ?? '?'} {c.platform}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: scoreColor(c.hook_score), fontWeight: 700 }}>{c.hook_score}</span>
                      </td>
                      <td style={styles.td}>{fmtN(c.views)}</td>
                      <td style={styles.td}>{(c.ctr * 100).toFixed(2)}%</td>
                      <td style={{ ...styles.td, color: '#22c55e', fontWeight: 700 }}>{fmt$(c.revenue_usd)}</td>
                      <td style={{ ...styles.td, minWidth: 80 }}>{miniBar(c.revenue_usd, maxRev, '#22c55e')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Funnel visualization */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🔽 Conversion Funnel</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              {[
                { label: 'Impressions', value: allViews,       color: '#06b6d4', pct: 100 },
                { label: 'Clicks',      value: allClicks,      color: '#3b82f6', pct: allViews > 0 ? (allClicks / allViews) * 100 : 0 },
                { label: 'Conversions', value: allConversions, color: '#a78bfa', pct: allViews > 0 ? (allConversions / allViews) * 100 : 0 },
                { label: 'Revenue',     value: allRevenue,     color: '#22c55e', pct: null },
              ].map((f, i) => (
                <div key={i} style={{ flex: 1, background: `${f.color}11`, border: `1px solid ${f.color}33`, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: f.color }}>
                    {i === 3 ? fmt$(f.value) : fmtN(f.value)}
                  </div>
                  {f.pct !== null && (
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{f.pct.toFixed(2)}% of top</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── HOOKS TAB ── */}
      {tab === 'hooks' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>🎣 Hook Performance</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['all', 'viral', 'good'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHookFilter(f)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: 'none',
                    background: hookFilter === f ? '#22c55e' : 'rgba(255,255,255,0.08)',
                    color:      hookFilter === f ? '#000' : '#94a3b8',
                    fontWeight: hookFilter === f ? 700 : 400,
                  }}
                >
                  {f === 'viral' ? '🔥 Viral (90+)' : f === 'good' ? '✅ Good (75-89)' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Hook (first 100 chars)</th>
                <th style={styles.th}>Score</th>
                <th style={styles.th}>Platform</th>
                <th style={styles.th}>Views</th>
                <th style={styles.th}>CTR</th>
                <th style={styles.th}>Revenue</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHooks.map((c, i) => {
                const hook = c.caption.slice(0, 100) + (c.caption.length > 100 ? '…' : '')
                return (
                  <tr key={c.id} style={{ opacity: c.status === 'posted' ? 1 : 0.75 }}>
                    <td style={{ ...styles.td, color: '#475569', width: 30 }}>{i + 1}</td>
                    <td style={styles.td}>
                      <div style={{ fontSize: 12, maxWidth: 320 }}>{hook}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: scoreColor(c.hook_score), fontWeight: 700, fontSize: 14 }}>{c.hook_score}</span>
                        {c.hook_score >= 90 && <span>🔥</span>}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.badge(PLATFORM_COLORS[c.platform] ?? '#64748b')}>
                        {PLATFORM_ICONS[c.platform] ?? '?'} {c.platform}
                      </span>
                    </td>
                    <td style={styles.td}>{fmtN(c.views)}</td>
                    <td style={styles.td}>{(c.ctr * 100).toFixed(2)}%</td>
                    <td style={{ ...styles.td, color: '#22c55e', fontWeight: 600 }}>{fmt$(c.revenue_usd)}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(
                        c.status === 'posted'   ? '#22c55e' :
                        c.status === 'queued'   ? '#f59e0b' :
                        c.status === 'ready'    ? '#06b6d4' : '#64748b'
                      )}>{c.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredHooks.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No hooks found for this filter
            </div>
          )}
        </div>
      )}

      {/* ── PLATFORMS TAB ── */}
      {tab === 'platforms' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {platforms.map(p => (
            <div key={p.platform} style={{ ...styles.card, borderColor: (PLATFORM_COLORS[p.platform] ?? '#64748b') + '44' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 24 }}>{PLATFORM_ICONS[p.platform] ?? '?'}</span>
                <span style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>{p.platform}</span>
                <span style={{ marginLeft: 'auto', ...styles.badge(PLATFORM_COLORS[p.platform] ?? '#64748b') }}>
                  {p.count} creatives
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { l: 'Views',       v: fmtN(p.views),              c: '#06b6d4' },
                  { l: 'Clicks',      v: fmtN(p.clicks),             c: '#3b82f6' },
                  { l: 'Avg CTR',     v: p.avg_ctr.toFixed(2) + '%', c: '#f59e0b' },
                  { l: 'Revenue',     v: fmt$(p.revenue),            c: '#22c55e' },
                  { l: 'Conversions', v: fmtN(p.conversions),        c: '#a78bfa' },
                  { l: 'Avg Hook',    v: p.avg_hook.toFixed(1),      c: scoreColor(p.avg_hook) },
                ].map(({ l, v, c }) => (
                  <div key={l}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
                ⏰ Peak hours: {(PEAK_HOURS[p.platform] ?? ['N/A']).join(' · ')}
              </div>
              {miniBar(p.revenue, Math.max(...platforms.map(x => x.revenue), 0.01), PLATFORM_COLORS[p.platform] ?? '#64748b')}
            </div>
          ))}
          {platforms.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13, padding: 20 }}>No platform data yet</div>
          )}
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab === 'products' && (
        <div style={styles.card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>💰 Revenue by Product</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>Creatives</th>
                <th style={styles.th}>Conversions</th>
                <th style={styles.th}>Revenue</th>
                <th style={styles.th}>Rev / Creative</th>
                <th style={styles.th}>Share</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const maxProd = Math.max(...products.map(x => x.revenue), 0.01)
                return (
                  <tr key={p.url_fragment}>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{p.product}</td>
                    <td style={styles.td}>{p.creatives}</td>
                    <td style={{ ...styles.td, color: '#a78bfa' }}>{p.conversions}</td>
                    <td style={{ ...styles.td, color: '#22c55e', fontWeight: 700 }}>{fmt$(p.revenue)}</td>
                    <td style={{ ...styles.td, color: '#f59e0b' }}>{fmt$(p.creatives > 0 ? p.revenue / p.creatives : 0)}</td>
                    <td style={{ ...styles.td, minWidth: 100 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {miniBar(p.revenue, maxProd, '#22c55e')}
                        <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {allRevenue > 0 ? ((p.revenue / allRevenue) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CADENCE TAB ── */}
      {tab === 'cadence' && (
        <>
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📅 Optimal Posting Schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {Object.entries(PEAK_HOURS).map(([platform, hours]) => (
                <div key={platform} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${(PLATFORM_COLORS[platform] ?? '#64748b')}33`, borderRadius: 10, padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{PLATFORM_ICONS[platform] ?? '?'}</span>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize', color: PLATFORM_COLORS[platform] ?? '#e2e8f0' }}>{platform}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                    {hours.map(h => (
                      <span key={h} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: `${PLATFORM_COLORS[platform] ?? '#64748b'}22`, color: PLATFORM_COLORS[platform] ?? '#e2e8f0', border: `1px solid ${PLATFORM_COLORS[platform] ?? '#64748b'}44` }}>
                        {h} EST
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily posting stats */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📊 Posting Activity (14 days)</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Posts</th>
                  <th style={styles.th}>Clicks</th>
                  <th style={styles.th}>Revenue</th>
                  <th style={styles.th}>Rev/Post</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map(d => (
                  <tr key={d.date}>
                    <td style={{ ...styles.td, color: '#94a3b8' }}>{d.date}</td>
                    <td style={styles.td}>{d.posts}</td>
                    <td style={{ ...styles.td, color: '#06b6d4' }}>{fmtN(d.clicks)}</td>
                    <td style={{ ...styles.td, color: '#22c55e', fontWeight: d.revenue > 0 ? 700 : 400 }}>{fmt$(d.revenue)}</td>
                    <td style={{ ...styles.td, color: '#f59e0b' }}>{d.posts > 0 ? fmt$(d.revenue / d.posts) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
