import { useState, useMemo } from 'react'
import { Volume2, VolumeX, Mic, AlertTriangle, TrendingUp, CheckCircle, Info, Loader } from 'lucide-react'
import { useTodayBriefing } from '../hooks/useSupabaseData'
import { useJobs } from '../hooks/useJobs'
import { useMT5Account } from '../hooks/useMT5'
import type { BriefingAlert, DailyBriefing } from '../lib/types'
import clsx from 'clsx'

const ALERT_CONFIG = {
  risk:        { icon: AlertTriangle, color: 'text-lumina-warning',  bg: 'bg-lumina-warning/10', border: 'border-lumina-warning/30' },
  opportunity: { icon: TrendingUp,   color: 'text-lumina-pulse',    bg: 'bg-lumina-pulse/10',   border: 'border-lumina-pulse/30' },
  action:      { icon: CheckCircle,  color: 'text-lumina-gold',     bg: 'bg-lumina-gold/10',    border: 'border-lumina-gold/30' },
  info:        { icon: Info,         color: 'text-lumina-dim',       bg: 'bg-lumina-card',       border: 'border-lumina-border' },
}

function AlertPill({ alert }: { alert: BriefingAlert }) {
  const cfg = ALERT_CONFIG[alert.type] ?? ALERT_CONFIG.info
  const Icon = cfg.icon
  return (
    <div className={clsx('flex items-start gap-2 p-3 rounded-lg border', cfg.bg, cfg.border)}>
      <Icon size={14} className={clsx(cfg.color, 'mt-0.5 flex-shrink-0')} />
      <span className="text-xs text-lumina-text leading-relaxed">{alert.message}</span>
      {alert.urgency === 'critical' && (
        <span className="ml-auto flex-shrink-0 badge-danger badge">URGENT</span>
      )}
    </div>
  )
}

export default function DailyBriefing() {
  // ── LIVE from daily_briefings Supabase table ────────────────────────────
  const { data: briefingRow, isLoading: briefingLoading } = useTodayBriefing()
  const { data: jobs = [] }    = useJobs()
  const { data: mt5 }          = useMT5Account()
  const [playing,   setPlaying]   = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // ── Auto-generate briefing from live data when no Supabase row exists ──
  const autoBriefing = useMemo<DailyBriefing | undefined>(() => {
    if (jobs.length === 0) return undefined

    const activeJobs   = jobs.filter(j => j.status === 'active' || j.status === 'scaling')
    const totalDaily   = jobs.reduce((s, j) => s + j.dailyProfit, 0)
    const totalMonthly = jobs.reduce((s, j) => s + j.monthlyProfit, 0)
    const topJob       = [...jobs].sort((a, b) => b.dailyProfit - a.dailyProfit)[0]
    const riskJobs     = jobs.filter(j => j.riskScore > 70)
    const mt5Pnl       = mt5?.dayPnl ?? 0
    const polyPnl      = 0  // no live poly pnl without position data
    const total        = totalDaily + mt5Pnl

    const alerts: BriefingAlert[] = []

    if (riskJobs.length > 0) {
      alerts.push({
        type: 'risk',
        message: `${riskJobs.map(j => j.name).join(', ')} ${riskJobs.length === 1 ? 'has' : 'have'} elevated risk score (>70). Review position sizing.`,
        urgency: riskJobs.some(j => j.riskScore > 85) ? 'critical' : 'high',
      })
    }
    if (topJob && topJob.dailyProfit > 0) {
      alerts.push({
        type: 'opportunity',
        message: `${topJob.name} is your top earner today at $${topJob.dailyProfit.toFixed(0)}/day. Consider scaling allocation.`,
        urgency: 'low',
      })
    }
    if (mt5Pnl > 50) {
      alerts.push({
        type: 'opportunity',
        message: `MT5 LuminaPulse EA is up $${mt5Pnl.toFixed(0)} today. Kelly sizing running optimally.`,
        urgency: 'low',
      })
    } else if (mt5Pnl < -100) {
      alerts.push({
        type: 'risk',
        message: `MT5 drawdown of $${Math.abs(mt5Pnl).toFixed(0)} today. Monitor open positions and drawdown limits.`,
        urgency: 'high',
      })
    }
    alerts.push({
      type: 'action',
      message: `Run the Money Flow Optimizer tonight to rebalance your ${jobs.length} active income streams.`,
      urgency: 'low',
    })

    const topPriorities = [
      `Review ${activeJobs.length} active jobs — projected monthly: $${totalMonthly.toLocaleString()}`,
      topJob ? `Scale ${topJob.name} — highest ROI at ${topJob.roi.toFixed(0)}%` : 'Review job portfolio',
      'Execute nightly PuLP allocation rebalance',
      'Check Polymarket edge signals for MT5 correlation plays',
    ]

    const summary = `Good morning. You have ${activeJobs.length} of ${jobs.length} income streams active today, generating a combined $${totalDaily.toFixed(0)} in daily revenue. Your MT5 LuminaPulse account is ${mt5Pnl >= 0 ? 'up' : 'down'} $${Math.abs(mt5Pnl).toFixed(0)} on the session. Projected monthly income across all streams: $${totalMonthly.toLocaleString()}. ${riskJobs.length > 0 ? `Watch: ${riskJobs.map(j => j.name).join(', ')} showing elevated risk.` : 'All risk scores within normal range.'} Your highest-performing asset is ${topJob?.name ?? 'not yet determined'}.`

    return {
      id:            'auto-generated',
      date:          new Date().toISOString().slice(0, 10),
      summary,
      topPriorities,
      alerts,
      pnlSummary: {
        mt5:        mt5Pnl,
        polymarket: polyPnl,
        total,
      },
    }
  }, [jobs, mt5])

  const briefing = briefingRow ?? autoBriefing

  if (dismissed) return null

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (briefingLoading) {
    return (
      <div className="card-glow border-l-2 border-l-lumina-pulse flex items-center gap-3 py-6">
        <Loader size={16} className="text-lumina-pulse animate-spin" />
        <span className="text-lumina-dim text-sm">Loading today's briefing…</span>
      </div>
    )
  }

  if (!briefing) {
    return (
      <div className="card-glow border-l-2 border-l-lumina-border">
        <div className="flex items-center gap-2 mb-2">
          <Mic size={16} className="text-lumina-muted" />
          <span className="section-header mb-0">AI Daily Briefing</span>
          <span className="text-lumina-dim text-xs">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          <Loader size={12} className="text-lumina-pulse animate-spin" />
          <p className="text-lumina-dim text-sm">Connecting to live data streams…</p>
        </div>
      </div>
    )
  }

  const isAutoGenerated = briefing.id === 'auto-generated'
  const pnl = briefing.pnlSummary

  return (
    <div className="card-glow border-l-2 border-l-lumina-pulse relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-lumina-pulse/5 to-transparent" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-lumina-pulse animate-pulse-slow" />
            <span className="section-header mb-0">AI Daily Briefing</span>
            {isAutoGenerated && (
              <span className="text-xs bg-lumina-pulse/20 text-lumina-pulse border border-lumina-pulse/30 px-1.5 py-0.5 rounded font-mono">
                LIVE AUTO
              </span>
            )}
          </div>
          <span className="text-lumina-dim text-xs">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-lumina-dim hover:text-lumina-pulse transition-colors"
          >
            {playing ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {playing ? 'Pause' : 'Play Audio'}
          </button>
          <button onClick={() => setDismissed(true)} className="text-lumina-muted hover:text-lumina-dim text-xs px-2">✕</button>
        </div>
      </div>

      {/* PnL bar — LIVE numbers from daily_briefings.pnl_mt5 / pnl_poly / pnl_total */}
      <div className="flex gap-4 mb-4 p-3 bg-lumina-bg/60 rounded-lg">
        <div className="text-center">
          <div className="text-lumina-dim text-xs mb-0.5">MT5 Today</div>
          <div className={clsx('font-mono font-bold text-sm', pnl.mt5 >= 0 ? 'text-lumina-success' : 'text-lumina-danger')}>
            {pnl.mt5 >= 0 ? '+' : ''}${pnl.mt5.toLocaleString()}
          </div>
        </div>
        <div className="w-px bg-lumina-border" />
        <div className="text-center">
          <div className="text-lumina-dim text-xs mb-0.5">Polymarket</div>
          <div className={clsx('font-mono font-bold text-sm', pnl.polymarket >= 0 ? 'text-lumina-success' : 'text-lumina-danger')}>
            {pnl.polymarket >= 0 ? '+' : ''}${pnl.polymarket.toLocaleString()}
          </div>
        </div>
        <div className="w-px bg-lumina-border" />
        <div className="text-center">
          <div className="text-lumina-dim text-xs mb-0.5">Total PnL</div>
          <div className={clsx('font-mono font-bold text-sm', pnl.total >= 0 ? 'text-lumina-pulse' : 'text-lumina-danger')}>
            {pnl.total >= 0 ? '+' : ''}${pnl.total.toLocaleString()}
          </div>
        </div>
      </div>

      <p className="text-lumina-text text-sm leading-relaxed mb-4 border-l-2 border-lumina-border pl-3">
        {briefing.summary}
      </p>

      {briefing.topPriorities.length > 0 && (
        <div className="mb-4">
          <div className="section-header">Top Priorities</div>
          <ol className="space-y-1">
            {briefing.topPriorities.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-lumina-text">
                <span className="font-mono text-lumina-pulse flex-shrink-0">{i + 1}.</span>
                {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {briefing.alerts.length > 0 && (
        <div className="space-y-2">
          {briefing.alerts.map((alert, i) => (
            <AlertPill key={i} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}
