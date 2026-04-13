/**
 * Predictive 30-Day Simulator + Scenario Runner (1,000 Monte-Carlo runs)
 */
import { useState, useCallback } from 'react'
import { TrendingUp, RefreshCw, ChevronDown } from 'lucide-react'
import { useMonteCarloResults } from '../hooks/useSupabaseData'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import clsx from 'clsx'

// Simulate a single MC path
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
      p10: vals[Math.floor(len * 0.10)],
      p25: vals[Math.floor(len * 0.25)],
      p50: vals[Math.floor(len * 0.50)],
      p75: vals[Math.floor(len * 0.75)],
      p90: vals[Math.floor(len * 0.90)],
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

  // ── LIVE from montecarlo_results Supabase table ───────────────────────────
  const { data: scenarioData = [], isLoading: mcLoading } = useMonteCarloResults()

  const mc = scenarioData.find((m) => m.scenario === scenario) ?? scenarioData[0]

  // Default seed when no Supabase data exists yet — zeros until real data loads
  const DEFAULT_SEED = { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, maxDrawdown: 0, sharpe: 0, runs: 0, scenario: 'Base Case' }
  const activeMc = mc ?? DEFAULT_SEED
  const hasRealData = !!mc

  const runSimulation = useCallback(() => {
    setRunning(true)
    setTimeout(() => {
      const vol   = VOLATILITY_MAP[scenario as keyof typeof VOLATILITY_MAP] ?? 0.025
      const paths = Array.from({ length: runs }, () => simulatePath(activeMc.p50, vol, 30))
      setChartData(buildChartData(paths, 30))
      setRunning(false)
    }, 400)
  }, [scenario, activeMc, runs])

  const data = chartData ?? buildChartData(
    Array.from({ length: 200 }, () => simulatePath(activeMc.p50, 0.025, 30)),
    30
  )

  if (mcLoading) {
    return (
      <div className="flex items-center gap-2 text-lumina-dim py-10">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-sm">Loading scenario data…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Predictive Scenario Runner</h1>
          <p className="text-lumina-dim text-sm">1,000 Monte-Carlo runs - 30-day revenue forecast</p>
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
          { label: 'P10 (Bear)',  value: activeMc.p10,   color: 'text-lumina-danger' },
          { label: 'P25',         value: activeMc.p25,   color: 'text-lumina-warning' },
          { label: 'P50 (Base)',  value: activeMc.p50,   color: 'text-lumina-pulse' },
          { label: 'P75',         value: activeMc.p75,   color: 'text-lumina-success' },
          { label: 'P90 (Bull)',  value: activeMc.p90,   color: 'text-lumina-gold' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-glow text-center">
            <div className="stat-label">{label}</div>
            <div className={clsx('font-bold font-mono text-lg', color)}>
              ${(value / 1000).toFixed(0)}k
            </div>
          </div>
        ))}
      </div>

      {/* Fan chart */}
      <div className="card-glow">
        <div className="section-header">
          <TrendingUp size={14} />
          30-Day Revenue Forecast Fan
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="p90grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e676" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="p50grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00f5d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="p10grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff3b6b" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#ff3b6b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2640" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Day', position: 'insideRight', fill: '#4a5568', fontSize: 10 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
              />
              <Area type="monotone" dataKey="p90" stroke="#00e676" fill="url(#p90grad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <Area type="monotone" dataKey="p75" stroke="#00f5d480" fill="none" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p50" stroke="#00f5d4" fill="url(#p50grad)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="p25" stroke="#ff980080" fill="none" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p10" stroke="#ff3b6b" fill="url(#p10grad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <ReferenceLine y={activeMc.p50} stroke="#00f5d440" strokeDasharray="6 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-6 mt-2 justify-center text-xs text-lumina-dim">
          <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-lumina-success" /> P90 Bull</span>
          <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-lumina-pulse" /> P50 Base</span>
          <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-lumina-danger" /> P10 Bear</span>
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
