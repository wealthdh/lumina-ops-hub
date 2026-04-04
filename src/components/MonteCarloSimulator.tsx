/**
 * Predictive 30-Day Simulator + Scenario Runner (1,000 Monte-Carlo runs)
 * Uses real historical data from mt5_snapshots and income_entries
 */
import { useState, useCallback, useEffect } from 'react'
import { TrendingUp, RefreshCw, ChevronDown, AlertCircle } from 'lucide-react'
import { useMonteCarloResults } from '../hooks/useSupabaseData'
import { useJobEarningsSummary } from '../hooks/useIncomeEntries'
import { supabase } from '../lib/supabase'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import clsx from 'clsx'

// Calculate daily returns from historical income data
async function calculateHistoricalReturns(): Promise<number[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  try {
    const { data, error } = await supabase
      .from('income_entries')
      .select('entry_date, amount')
      .eq('user_id', user.id)
      .gte('entry_date', new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))
      .order('entry_date', { ascending: true })

    if (error || !data) return []

    // Group by day and sum
    const dailyMap = new Map<string, number>()
    for (const row of data as Array<{ entry_date: string; amount: number }>) {
      const day = String(row.entry_date).slice(0, 10)
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(row.amount))
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a - b)
    if (daily.length < 2) return []

    // Calculate daily returns (percent change)
    const returns = []
    for (let i = 1; i < daily.length; i++) {
      const ret = (daily[i] - daily[i - 1]) / Math.max(daily[i - 1], 1)
      returns.push(ret)
    }

    return returns
  } catch {
    return []
  }
}

// Simulate a single MC path using real return distribution
function simulatePathWithReturns(baseAmount: number, historicalReturns: number[], days: number): number[] {
  const path = [baseAmount]
  for (let i = 1; i < days; i++) {
    // Randomly sample from historical returns
    const sampledReturn = historicalReturns.length > 0
      ? historicalReturns[Math.floor(Math.random() * historicalReturns.length)]
      : (Math.random() - 0.5) * 0.05
    path.push(Math.max(0, path[i - 1] * (1 + sampledReturn)))
  }
  return path
}

// Fallback: simulate a single MC path (when no historical data)
function simulatePath(p50: number, volatility: number, days: number): number[] {
  const path = [p50]
  for (let i = 1; i < days; i++) {
    const drift = 0.003
    const shock = (Math.random() - 0.5) * volatility
    path.push(Math.max(0, path[i - 1] * (1 + drift + shock)))
  }
  return path
}

// Build chart data from multiple paths
function buildChartData(runs: number[][], days: number) {
  return Array.from({ length: days }, (_, i) => {
    const vals = runs.map((r) => r[i]).sort((a, b) => a - b)
    const len  = vals.length
    return {
      day: i + 1,
      p5:  vals[Math.floor(len * 0.05)],
      p25: vals[Math.floor(len * 0.25)],
      p50: vals[Math.floor(len * 0.50)],
      p75: vals[Math.floor(len * 0.75)],
      p95: vals[Math.floor(len * 0.95)],
    }
  })
}

const VOLATILITY_MAP = {
  'Base Case':     0.025,
  'Bull Market':   0.015,
  'Bear + Crisis': 0.055,
}

export default function MonteCarloSimulator() {
  const [scenario, setScenario] = useState('Base Case')
  const [running, setRunning]   = useState(false)
  const [chartData, setChartData] = useState<ReturnType<typeof buildChartData> | null>(null)
  const [runs] = useState(1000)
  const [hasHistoricalData, setHasHistoricalData] = useState(false)
  const [historicalReturns, setHistoricalReturns] = useState<number[]>([])

  // ── LIVE from montecarlo_results Supabase table ───────────────────────────
  const { data: scenarioData = [], isLoading: mcLoading } = useMonteCarloResults()
  const { data: summaries = [] } = useJobEarningsSummary()

  // Load historical returns on mount
  useEffect(() => {
    void (async () => {
      const returns = await calculateHistoricalReturns()
      if (returns.length >= 30) {
        setHistoricalReturns(returns)
        setHasHistoricalData(true)
      } else {
        setHasHistoricalData(false)
      }
    })()
  }, [])

  const mc = scenarioData.find((m) => m.scenario === scenario) ?? scenarioData[0]

  // Calculate base amount from job earnings
  const totalMonthlyEarnings = summaries.reduce((s, e) => s + e.monthUsd, 0)
  const baseAmountFromEarnings = Math.max(totalMonthlyEarnings / 30, 100)

  // Default seed when no Supabase data exists yet
  const DEFAULT_SEED = { p10: 5000, p25: 8000, p50: 12000, p75: 17000, p90: 24000, maxDrawdown: 18, sharpe: 1.8, runs: 0, scenario: 'Base Case' }
  const activeMc = mc ?? DEFAULT_SEED

  const runSimulation = useCallback(() => {
    setRunning(true)
    setTimeout(() => {
      let paths: number[][]

      if (hasHistoricalData && historicalReturns.length >= 30) {
        // Use real historical returns
        paths = Array.from({ length: runs }, () =>
          simulatePathWithReturns(baseAmountFromEarnings, historicalReturns, 30)
        )
      } else {
        // Fallback to synthetic volatility
        const vol = VOLATILITY_MAP[scenario as keyof typeof VOLATILITY_MAP] ?? 0.025
        paths = Array.from({ length: runs }, () => simulatePath(activeMc.p50, vol, 30))
      }

      setChartData(buildChartData(paths, 30))
      setRunning(false)
    }, 400)
  }, [scenario, activeMc, runs, hasHistoricalData, historicalReturns, baseAmountFromEarnings])

  // Default chart data
  const defaultPaths = hasHistoricalData && historicalReturns.length >= 30
    ? Array.from({ length: 200 }, () => simulatePathWithReturns(baseAmountFromEarnings, historicalReturns, 30))
    : Array.from({ length: 200 }, () => simulatePath(activeMc.p50, 0.025, 30))

  const data = chartData ?? buildChartData(defaultPaths, 30)

  if (mcLoading) {
    return (
      <div className="flex items-center gap-2 text-lumina-dim py-10">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-sm">Loading scenario data…</span>
      </div>
    )
  }

  // Insufficient data notice
  if (!hasHistoricalData && !chartData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lumina-text font-bold text-xl">Predictive Scenario Runner</h1>
            <p className="text-lumina-dim text-sm">1,000 Monte-Carlo runs · 30-day revenue forecast</p>
          </div>
        </div>

        <div className="card-glow border-lumina-warning/30 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle size={16} className="text-lumina-warning flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-lumina-warning">Insufficient Historical Data</div>
              <p className="text-xs text-lumina-dim mt-1">
                Need at least 30 days of history to generate accurate forecasts.
                Currently have {historicalReturns.length} days. Please return after accumulating more data.
              </p>
            </div>
          </div>
        </div>

        <div className="card-glow text-center p-8 text-lumina-dim">
          <TrendingUp size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Come back soon! Your forecast will be available once we have 30+ days of earnings history.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Predictive Scenario Runner</h1>
          <p className="text-lumina-dim text-sm">1,000 Monte-Carlo runs · 30-day revenue forecast</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="bg-lumina-card border border-lumina-border text-lumina-text text-sm rounded-lg px-3 py-2 pr-8 appearance-none focus:border-lumina-pulse outline-none cursor-pointer"
            >
              {scenarioData.length > 0
                ? scenarioData.map((m) => (
                    <option key={m.scenario} value={m.scenario}>{m.scenario}</option>
                  ))
                : Object.keys(VOLATILITY_MAP).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))
              }
            </select>
            <ChevronDown size={13} className="absolute right-2 top-2.5 text-lumina-dim pointer-events-none" />
          </div>
          <button
            className="btn-pulse flex items-center gap-2 text-sm"
            onClick={runSimulation}
            disabled={running}
          >
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
            {running ? `Running ${runs.toLocaleString()}...` : `Run ${runs.toLocaleString()} Sims`}
          </button>
        </div>
      </div>

      {/* Data source notice */}
      <div className="card text-xs text-lumina-dim py-2 px-3">
        {hasHistoricalData
          ? `Using real historical data (${historicalReturns.length} days of returns)`
          : 'Using default volatility model (no historical data yet)'}
      </div>

      {/* Empty-state notice when no Supabase seed data */}
      {!mc && !chartData && (
        <div className="card text-center text-lumina-dim py-4 text-sm">
          No saved scenarios in <code className="font-mono text-lumina-pulse">montecarlo_results</code> table — using default seed values.{' '}
          <span className="text-xs">Hit <strong className="text-lumina-pulse">Run 1,000 Sims</strong> to generate a live forecast.</span>
        </div>
      )}

      {/* Scenario stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'P5 (Worst)',  value: data[29]?.p5 ?? activeMc.p10,   color: 'text-lumina-danger' },
          { label: 'P25',         value: activeMc.p25,   color: 'text-lumina-warning' },
          { label: 'P50 (Base)',  value: activeMc.p50,   color: 'text-lumina-pulse' },
          { label: 'P75',         value: activeMc.p75,   color: 'text-lumina-success' },
          { label: 'P95 (Best)',  value: data[29]?.p95 ?? activeMc.p90,   color: 'text-lumina-gold' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-glow text-center">
            <div className="stat-label">{label}</div>
            <div className={clsx('font-bold font-mono text-lg', color)}>
              ${(value / 1000).toFixed(0)}k
            </div>
          </div>
        ))}
      </div>

      {/* Fan chart with confidence bands */}
      <div className="card-glow">
        <div className="section-header">
          <TrendingUp size={14} />
          30-Day Revenue Forecast Fan
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="p95grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e676" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="p50grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00f5d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="p5grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff3b6b" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#ff3b6b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="confidenceBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="#00f5d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2640" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Day', position: 'insideRight', fill: '#4a5568', fontSize: 10 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
              />
              {/* Confidence band (shaded area between P5 and P95) */}
              <Area type="monotone" dataKey="p95" stroke="#00e676" fill="url(#p95grad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <Area type="monotone" dataKey="p75" stroke="#00f5d480" fill="none" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p50" stroke="#00f5d4" fill="url(#p50grad)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="p25" stroke="#ff980080" fill="none" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p5" stroke="#ff3b6b" fill="url(#p5grad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <ReferenceLine y={activeMc.p50} stroke="#00f5d440" strokeDasharray="6 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-6 mt-2 justify-center text-xs text-lumina-dim">
          <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-lumina-success" /> P95 Best Case</span>
          <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-lumina-pulse" /> P50 Median</span>
          <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-lumina-danger" /> P5 Worst Case</span>
        </div>
      </div>

      {/* Risk metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-glow">
          <div className="section-header">Risk Metrics</div>
          <div className="space-y-3">
            {[
              { label: 'Max Drawdown',    value: `${activeMc.maxDrawdown.toFixed(1)}%`,  color: activeMc.maxDrawdown > 20 ? 'text-lumina-danger' : 'text-lumina-warning' },
              { label: 'Sharpe Ratio',    value: activeMc.sharpe.toFixed(2),              color: activeMc.sharpe > 2 ? 'text-lumina-success' : 'text-lumina-warning' },
              { label: 'Monte-Carlo Runs',value: activeMc.runs > 0 ? activeMc.runs.toLocaleString() : (chartData ? runs.toLocaleString() : '—'),  color: 'text-lumina-dim' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-lumina-dim">{label}</span>
                <span className={clsx('font-mono font-semibold', color)}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-glow">
          <div className="section-header">Scenario Comparison</div>
          <div className="space-y-2">
            {scenarioData.length > 0
              ? scenarioData.map((m) => (
                  <button
                    key={m.scenario}
                    onClick={() => setScenario(m.scenario)}
                    className={clsx(
                      'w-full text-left p-2 rounded-lg text-sm transition-colors',
                      m.scenario === scenario ? 'bg-lumina-pulse/15 text-lumina-pulse border border-lumina-pulse/30' : 'text-lumina-dim hover:bg-lumina-card',
                    )}
                  >
                    <div className="flex justify-between">
                      <span>{m.scenario}</span>
                      <span className="font-mono">${(m.p50 / 1000).toFixed(0)}k median</span>
                    </div>
                  </button>
                ))
              : Object.entries(VOLATILITY_MAP).map(([name, vol]) => (
                  <button
                    key={name}
                    onClick={() => setScenario(name)}
                    className={clsx(
                      'w-full text-left p-2 rounded-lg text-sm transition-colors',
                      name === scenario ? 'bg-lumina-pulse/15 text-lumina-pulse border border-lumina-pulse/30' : 'text-lumina-dim hover:bg-lumina-card',
                    )}
                  >
                    <div className="flex justify-between">
                      <span>{name}</span>
                      <span className="font-mono text-xs">vol {(vol * 100).toFixed(1)}%</span>
                    </div>
                  </button>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
