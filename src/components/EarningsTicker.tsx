/**
 * EarningsTicker — Live accumulating earnings counter
 *
 * Shows a running ticker of earnings since midnight,
 * animating in real-time based on daily profit rates.
 * Pulls from real income_entries via usePortfolioEarnings.
 */
import { useState, useEffect, useRef } from 'react'
import { TrendingUp, Zap } from 'lucide-react'
import { usePortfolioEarnings } from '../hooks/useIncomeEntries'
import { useJobs } from '../hooks/useJobs'

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const start = prevRef.current
    const end   = value
    const diff  = end - start
    if (Math.abs(diff) < 0.001) { setDisplay(value); return }

    const duration = 800
    const startTime = Date.now()
    const animate   = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / duration)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + diff * eased)
      if (progress < 1) requestAnimationFrame(animate)
      else { setDisplay(end); prevRef.current = end }
    }
    requestAnimationFrame(animate)
  }, [value])

  return (
    <span className="font-mono tabular-nums">
      {display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

export default function EarningsTicker() {
  const earnings   = usePortfolioEarnings()
  const { data: jobs = [] } = useJobs()

  // Compute dollars earned since midnight (from income_entries)
  const todayReal  = earnings.todayTotal

  // Compute expected earnings since midnight based on job daily rates
  // This creates the "live ticking" effect even between DB entries
  const totalDailyRate = jobs
    .filter(j => j.status === 'active' || j.status === 'scaling')
    .reduce((s, j) => s + j.dailyProfit, 0)

  const secondsPerDay  = 86_400
  const perSecondRate  = totalDailyRate / secondsPerDay

  const [liveEstimate, setLiveEstimate] = useState(0)
  const [secondsToday, setSecondsToday] = useState(0)

  // ── Initialize seconds-since-midnight ONCE on mount ────────────────────────
  useEffect(() => {
    const now        = new Date()
    const midnight   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const elapsedSec = (now.getTime() - midnight.getTime()) / 1000
    setSecondsToday(elapsedSec)
  }, [])  // runs once

  // ── Tick every second (independent of perSecondRate) ──────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsToday(s => s + 1)
    }, 1_000)
    return () => clearInterval(id)
  }, [])  // runs once

  // ── Recompute liveEstimate whenever secondsToday or rate changes ──────────
  useEffect(() => {
    setLiveEstimate(secondsToday * perSecondRate)
  }, [secondsToday, perSecondRate])

  // Use real income entries if available, otherwise show rate-based estimate
  const displayValue = todayReal > 0 ? Math.max(todayReal, liveEstimate) : liveEstimate
  const hourlyRate   = perSecondRate * 3600

  const formatTime   = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }

  return (
    <div className="card-glow border-lumina-success/20 bg-gradient-to-br from-lumina-card to-lumina-success/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-lumina-success/10 border border-lumina-success/30 flex items-center justify-center">
            <TrendingUp size={14} className="text-lumina-success" />
          </div>
          <div>
            <div className="text-lumina-text font-semibold text-sm">Today's Earnings</div>
            <div className="text-[10px] text-lumina-dim flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-lumina-success animate-pulse" />
              Live - {formatTime(secondsToday)} elapsed
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-lumina-muted">/hour</div>
          <div className="text-xs font-mono text-lumina-gold">+${hourlyRate.toFixed(2)}</div>
        </div>
      </div>

      {/* Main ticker */}
      <div className="text-center py-4">
        <div className="text-4xl font-bold text-lumina-success">
          $<AnimatedNumber value={displayValue} />
        </div>
        <div className="text-xs text-lumina-dim mt-1">
          {todayReal > 0 ? 'Real + projected earnings today' : 'Projected earnings today'}
        </div>
      </div>

      {/* Rate breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-lumina-bg/40 rounded-lg p-2 text-center">
          <div className="text-[9px] text-lumina-muted">Per Second</div>
          <div className="text-xs font-mono text-lumina-text">${perSecondRate.toFixed(4)}</div>
        </div>
        <div className="bg-lumina-bg/40 rounded-lg p-2 text-center">
          <div className="text-[9px] text-lumina-muted">Per Minute</div>
          <div className="text-xs font-mono text-lumina-text">${(perSecondRate * 60).toFixed(2)}</div>
        </div>
        <div className="bg-lumina-bg/40 rounded-lg p-2 text-center">
          <div className="text-[9px] text-lumina-muted">Per Hour</div>
          <div className="text-xs font-mono text-lumina-text">${hourlyRate.toFixed(2)}</div>
        </div>
      </div>

      {/* Week and month */}
      {(earnings.weekTotal > 0 || earnings.monthTotal > 0) && (
        <div className="mt-3 pt-3 border-t border-lumina-border grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] text-lumina-muted">Last 7 Days</div>
            <div className="text-sm font-mono font-bold text-lumina-pulse">
              ${earnings.weekTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-lumina-muted">Last 30 Days</div>
            <div className="text-sm font-mono font-bold text-lumina-text">
              ${earnings.monthTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* Active jobs count */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-lumina-dim">
        <Zap size={10} className="text-lumina-pulse" />
        {jobs.filter(j => j.status === 'active' || j.status === 'scaling').length} active jobs generating revenue
      </div>
    </div>
  )
}
