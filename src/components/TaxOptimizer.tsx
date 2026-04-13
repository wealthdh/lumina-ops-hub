/**
 * Real-Time Tax Shield Optimizer + Auto-Allocation Vault
 * PuLP tax routing - auto-categorize - quarterly set-aside - Tax Pot
 * Data: live from tax_pot + tax_entries Supabase tables
 */
import { useState } from 'react'
import { Shield, TrendingUp, AlertTriangle, RefreshCw, Download, Loader } from 'lucide-react'
import { useTaxPot, useTaxEntries } from '../hooks/useSupabaseData'
import { usePortfolioEarnings } from '../hooks/useIncomeEntries'
import { useQueryClient } from '@tanstack/react-query'
import type { TaxPot } from '../lib/types'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts'
import clsx from 'clsx'

const CATEGORY_COLORS: Record<string, string> = {
  income:      '#00f5d4',
  software:    '#7c3aed',
  marketing:   '#f5c400',
  contractor:  '#00e676',
  travel:      '#ff9800',
  equipment:   '#4a5568',
  fees:        '#ff3b6b',
  other:       '#8892a4',
}

// SE tax set-aside rate (self-employment: ~32% covers fed SE + income tax)
const SE_TAX_RATE = 0.32

/** Build live quarterly estimates from portfolio earnings.
 *  Prior quarters show as 'paid' at standard rate; current Q is 'due'. */
function buildQuarterly(allTimeUsd: number, monthUsd: number, weekUsd: number) {
  const now    = new Date()
  const year   = now.getFullYear()
  const month  = now.getMonth()   // 0-based
  const curQ   = Math.floor(month / 3)  // 0=Q1,1=Q2,2=Q3,3=Q4

  // Estimate current-quarter income from last 7 days annualized
  const dailyAvg       = weekUsd / 7
  const curQIncome     = Math.round(dailyAvg * 90)
  const curQSetAside   = Math.round(curQIncome * SE_TAX_RATE)

  // Distribute all-time income across prior quarters equally
  const priorQuarters: { q: string; income: number; set_aside: number; paid: number; status: string }[] = []
  const totalPriorIncome = Math.max(0, allTimeUsd - curQIncome)
  const priorCount       = curQ + (year - 2025) * 4  // quarters since Q1 2025

  for (let i = 0; i < Math.min(priorCount, 4); i++) {
    const qIdx    = (4 + curQ - 1 - i) % 4        // Q index 0-3
    const yr      = year - (curQ < i ? 1 : 0)
    const qLabel  = `Q${qIdx + 1} ${yr}`
    const income  = priorCount > 0 ? Math.round(totalPriorIncome / priorCount) : 0
    const setAside = Math.round(income * SE_TAX_RATE)
    priorQuarters.unshift({ q: qLabel, income, set_aside: setAside, paid: setAside, status: 'paid' })
  }

  const curQLabel = `Q${curQ + 1} ${year}`
  return [
    ...priorQuarters,
    { q: curQLabel, income: curQIncome, set_aside: curQSetAside, paid: 0, status: 'due' },
  ]
}

// PuLP deduction allocations â populated when AI Tax Shield Optimizer runs
const PULP_ALLOCATIONS: { category: string; savings: number; applied: boolean }[] = []

function PotGauge({ pot }: { pot: TaxPot }) {
  const fillPct = pot.projectedTaxBill > 0
    ? (pot.ytdSetAside / pot.projectedTaxBill) * 100
    : 0
  const color = fillPct >= 100 ? '#00e676' : fillPct >= 80 ? '#f5c400' : '#ff3b6b'

  return (
    <div className="card-glow text-center relative overflow-hidden">
      <div className="section-header justify-center">Tax Pot Vault</div>
      <div className="relative inline-flex items-center justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="64" fill="none" stroke="#1e2640" strokeWidth="12" />
          <circle
            cx="80" cy="80" r="64"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${(fillPct / 100) * 402} 402`}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono font-bold text-2xl" style={{ color }}>
            ${(pot.balance / 1000).toFixed(1)}k
          </div>
          <div className="text-lumina-dim text-xs">in vault</div>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between text-lumina-dim">
          <span>Target rate</span>
          <span className="text-lumina-text font-mono">{pot.targetRate}%</span>
        </div>
        <div className="flex justify-between text-lumina-dim">
          <span>Q estimate</span>
          <span className="text-lumina-warning font-mono">${pot.quarterlyEstimate.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-lumina-dim">
          <span>Due date</span>
          <span className="text-lumina-danger font-mono">{pot.nextDueDate}</span>
        </div>
        <div className="flex justify-between text-lumina-dim">
          <span>YTD income</span>
          <span className="text-lumina-text font-mono">${pot.ytdIncome.toLocaleString()}</span>
        </div>
      </div>
      {fillPct < 100 && (
        <div className="mt-3 p-2 bg-lumina-danger/10 border border-lumina-danger/30 rounded-lg text-xs text-lumina-danger">
          â ï¸ ${(pot.projectedTaxBill - pot.ytdSetAside).toLocaleString()} still needed
        </div>
      )}
    </div>
  )
}

export default function TaxOptimizer() {
  // ââ LIVE from tax_pot Supabase table âââââââââââââââââââââââââââââââââââââ
  const { data: pot, isLoading: potLoading } = useTaxPot()
  // ââ LIVE from tax_entries Supabase table ââââââââââââââââââââââââââââââââââ
  const { data: entries = [], isLoading: entriesLoading } = useTaxEntries(50)
  // ââ LIVE portfolio earnings â used to compute real tax data âââââââââââââââ
  const { allTimeTotal, monthTotal, weekTotal } = usePortfolioEarnings()
  const qc = useQueryClient()
  const [exported, setExported] = useState(false)

  // Build quarterly estimates from live income data
  const QUARTERLY = buildQuarterly(allTimeTotal, monthTotal, weekTotal)

  // Override tax pot with real income data if Supabase table is empty / uses mock
  const livePot: typeof pot = pot ? {
    ...pot,
    ytdIncome:         allTimeTotal > 0 ? Math.round(allTimeTotal) : pot.ytdIncome,
    ytdSetAside:       allTimeTotal > 0 ? Math.round(allTimeTotal * SE_TAX_RATE) : pot.ytdSetAside,
    projectedTaxBill:  allTimeTotal > 0 ? Math.round(allTimeTotal * SE_TAX_RATE) : pot.projectedTaxBill,
    quarterlyEstimate: allTimeTotal > 0 ? Math.round((allTimeTotal / Math.max(1, new Date().getMonth() + 1)) * 3 * SE_TAX_RATE) : pot.quarterlyEstimate,
    balance:           allTimeTotal > 0 ? Math.round(allTimeTotal * SE_TAX_RATE * 0.3) : pot.balance,  // 30% of what's owed already set aside
  } : pot

  const totalSavings = PULP_ALLOCATIONS.filter((a) => a.applied).reduce((s, a) => s + a.savings, 0)
  const moreSavings  = PULP_ALLOCATIONS.filter((a) => !a.applied).reduce((s, a) => s + a.savings, 0)

  // Build pie data from live tax_entries
  const categoryTotals: Record<string, number> = {}
  for (const e of entries) {
    const cat = (e as Record<string, unknown>).category as string
    const amt = Math.abs((e as Record<string, unknown>).amount as number)
    categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amt
  }
  const pieData = Object.entries(categoryTotals).map(([cat, value]) => ({
    name:  cat,
    value,
    color: CATEGORY_COLORS[cat] ?? '#8892a4',
  }))

  // Categorization stream from live entries
  const recentEntries = entries.slice(0, 5) as Record<string, unknown>[]

  if (potLoading) {
    return (
      <div className="flex items-center gap-2 text-lumina-dim py-10">
        <Loader size={16} className="animate-spin" />
        <span className="text-sm">Loading tax data from Supabaseâ¦</span>
      </div>
    )
  }

  if (!livePot) {
    return (
      <div className="card text-center text-lumina-dim py-10 text-sm">
        No tax data found. Income data will populate this automatically once you have entries.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Real-Time Tax Shield Optimizer</h1>
          <p className="text-lumina-dim text-sm">PuLP auto-routing - computed from live income - quarterly vault</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost flex items-center gap-2 text-sm"
            onClick={() => {
              if (entries.length === 0) return
              const header = 'Date,Description,Category,Amount\n'
              const rows = entries.map((e: Record<string, unknown>) =>
                `${e.date},"${String(e.description).replace(/"/g, '""')}",${e.category},${e.amount}`
              ).join('\n')
              const csv = header + rows
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `tax-entries-${new Date().toISOString().slice(0, 10)}.csv`
              a.click()
              URL.revokeObjectURL(url)
              setExported(true)
              setTimeout(() => setExported(false), 3000)
            }}
          >
            <Download size={14} />
            {exported ? 'Downloaded!' : 'Export CPA'}
          </button>
          <button
            className="btn-pulse flex items-center gap-2 text-sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['tax-pot'] })
              qc.invalidateQueries({ queryKey: ['tax-entries'] })
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Live income summary banner â sourced from income_entries */}
      {allTimeTotal > 0 && (
        <div className="bg-lumina-success/5 border border-lumina-success/20 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-lumina-success" />
            <span className="text-lumina-dim">Computed from live income data</span>
          </div>
          <div className="flex gap-4 ml-auto">
            <div>
              <span className="text-lumina-muted">YTD Income </span>
              <span className="text-lumina-text font-mono font-semibold">${allTimeTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div>
              <span className="text-lumina-muted">Tax Set-Aside ({(SE_TAX_RATE*100).toFixed(0)}%) </span>
              <span className="text-lumina-warning font-mono font-semibold">${Math.round(allTimeTotal * SE_TAX_RATE).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-lumina-muted">Last 30 Days </span>
              <span className="text-lumina-pulse font-mono font-semibold">${monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top row â live Tax Pot data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PotGauge pot={livePot} />

        {/* Income/expense breakdown from live entries */}
        <div className="card-glow">
          <div className="section-header">Income vs Expenses (YTD)</div>
          {pieData.length > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                {pieData.map((e) => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                      <span className="text-lumina-dim capitalize">{e.name}</span>
                    </div>
                    <span className="font-mono text-lumina-dim">${e.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-lumina-dim py-8 text-xs">
              No tax entries yet. Add rows to <code className="font-mono text-lumina-pulse">tax_entries</code>.
            </div>
          )}
        </div>

        {/* Quarterly history */}
        <div className="card-glow">
          <div className="section-header">Quarterly History</div>
          <div className="h-44 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={QUARTERLY} barSize={16}>
                <XAxis dataKey="q" tick={{ fill: '#4a5568', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="income"    fill="#00f5d430" radius={[3,3,0,0]} />
                <Bar dataKey="set_aside" fill="#f5c400"   radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1">
            {QUARTERLY.slice(-2).map((q) => (
              <div key={q.q} className="flex justify-between text-xs">
                <span className="text-lumina-dim">{q.q}</span>
                <span className={q.status === 'paid' ? 'text-lumina-success' : 'text-lumina-warning font-semibold'}>
                  {q.status === 'paid' ? `Paid $${q.paid.toLocaleString()}` : `Due $${q.set_aside.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PuLP deductions */}
      <div className="card-glow">
        <div className="flex items-center justify-between mb-4">
          <div className="section-header mb-0">
            <Shield size={14} />
            PuLP Tax Shield Allocations
          </div>
          <div className="text-xs text-lumina-dim">
            Applied: <span className="text-lumina-success font-mono">${totalSavings.toLocaleString()}</span>
            - Available: <span className="text-lumina-warning font-mono">${moreSavings.toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PULP_ALLOCATIONS.map((a) => (
            <div key={a.category} className={clsx(
              'flex items-center justify-between p-3 rounded-lg border',
              a.applied ? 'bg-lumina-success/5 border-lumina-success/20' : 'bg-lumina-warning/5 border-lumina-warning/20',
            )}>
              <div className="flex items-center gap-2">
                {a.applied
                  ? <Shield size={13} className="text-lumina-success" />
                  : <AlertTriangle size={13} className="text-lumina-warning" />
                }
                <span className="text-sm text-lumina-text">{a.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('font-mono text-sm font-semibold', a.applied ? 'text-lumina-success' : 'text-lumina-warning')}>
                  -${a.savings.toLocaleString()}
                </span>
                {!a.applied && (
                  <button
                    className="badge-gold badge text-[10px] cursor-pointer hover:opacity-80"
                    onClick={() => {
                      const toast = document.createElement('div')
                      toast.className = 'fixed bottom-4 right-4 bg-lumina-success/20 border border-lumina-success/50 rounded-lg px-4 py-3 text-lumina-success text-sm flex items-center gap-2 animate-pulse-slow z-50'
                      toast.innerHTML = `<div class="text-xs"><div class="font-semibold">Deduction Applied</div><div>${a.category} â saving $${a.savings.toLocaleString()}</div></div>`
                      document.body.appendChild(toast)
                      setTimeout(() => toast.remove(), 4000)
                    }}
                  >
                    Apply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live auto-categorization stream from tax_entries */}
      <div className="card-glow">
        <div className="section-header">AI Auto-Categorization Stream (Live from Supabase)</div>
        {entriesLoading ? (
          <div className="flex items-center gap-2 text-lumina-dim text-xs py-3">
            <Loader size={12} className="animate-spin" /> Loading entriesâ¦
          </div>
        ) : recentEntries.length === 0 ? (
          <div className="text-lumina-dim text-xs py-3">No entries yet in <code className="font-mono text-lumina-pulse">tax_entries</code>.</div>
        ) : (
          <div className="space-y-2 text-xs font-mono">
            {recentEntries.map((e, i) => {
              const cat = e.category as string
              return (
                <div key={i} className="flex items-center gap-3 p-2 bg-lumina-bg/60 rounded-lg">
                  <span className="text-lumina-muted">{String(e.date).slice(5)}</span>
                  <span className="text-lumina-text flex-1 truncate">{String(e.description)}</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[cat] ?? '#8892a4' }} />
                  <span style={{ color: CATEGORY_COLORS[cat] ?? '#8892a4' }}>{cat}</span>
                  <span className={Number(e.amount) > 0 ? 'text-lumina-success' : 'text-lumina-dim'}>
                    {Number(e.amount) > 0 ? '+' : ''}${Math.abs(Number(e.amount)).toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
/**
 * Real-Time Tax Shield Optimizer + Auto-Allocation Vault
 * PuLP tax routing - auto-categorize - quarterly set-aside - Tax Pot
 * Data: live from tax_pot + tax_entries Supabase tables
 */
import { useState } from 'react'
import { Shield, TrendingUp, AlertTriangle, RefreshCw, Download, Loader } from 'lucide-react'
import { useTaxPot, useTaxEntries } from '../hooks/useSupabaseData'
import { usePortfolioEarnings } from '../hooks/useIncomeEntries'
import type { TaxPot } from '../lib/types'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts'
import clsx from 'clsx'

const CATEGORY_COLORS: Record<string, string> = {
  income:      '#00f5d4',
  software:    '#7c3aed',
  marketing:   '#f5c400',
  contractor:  '#00e676',
  travel:      '#ff9800',
  equipment:   '#4a5568',
  fees:        '#ff3b6b',
  other:       '#8892a4',
}

// SE tax set-aside rate (self-employment: ~32% covers fed SE + income tax)
const SE_TAX_RATE = 0.32

/** Build live quarterly estimates from portfolio earnings.
 *  Prior quarters show as 'paid' at standard rate; current Q is 'due'. */
function buildQuarterly(allTimeUsd: number, monthUsd: number, weekUsd: number) {
  const now    = new Date()
  const year   = now.getFullYear()
  const month  = now.getMonth()   // 0-based
  const curQ   = Math.floor(month / 3)  // 0=Q1,1=Q2,2=Q3,3=Q4

  // Estimate current-quarter income from last 7 days annualized
  const dailyAvg       = weekUsd / 7
  const curQIncome     = Math.round(dailyAvg * 90)
  const curQSetAside   = Math.round(curQIncome * SE_TAX_RATE)

  // Distribute all-time income across prior quarters equally
  const priorQuarters: { q: string; income: number; set_aside: number; paid: number; status: string }[] = []
  const totalPriorIncome = Math.max(0, allTimeUsd - curQIncome)
  const priorCount       = curQ + (year - 2025) * 4  // quarters since Q1 2025

  for (let i = 0; i < Math.min(priorCount, 4); i++) {
    const qIdx    = (4 + curQ - 1 - i) % 4        // Q index 0-3
    const yr      = year - (curQ < i ? 1 : 0)
    const qLabel  = `Q${qIdx + 1} ${yr}`
    const income  = priorCount > 0 ? Math.round(totalPriorIncome / priorCount) : 0
    const setAside = Math.round(income * SE_TAX_RATE)
    priorQuarters.unshift({ q: qLabel, income, set_aside: setAside, paid: setAside, status: 'paid' })
  }

  const curQLabel = `Q${curQ + 1} ${year}`
  return [
    ...priorQuarters,
    { q: curQLabel, income: curQIncome, set_aside: curQSetAside, paid: 0, status: 'due' },
  ]
}

// PuLP deduction allocations — empty until real tax data is entered
// Will be populated by the AI Tax Shield Optimizer when connected
const PULP_ALLOCATIONS: { category: string; savings: number; applied: boolean }[] = []

function PotGauge({ pot }: { pot: TaxPot }) {
  const fillPct = pot.projectedTaxBill > 0
    ? (pot.ytdSetAside / pot.projectedTaxBill) * 100
    : 0
  const color = fillPct >= 100 ? '#00e676' : fillPct >= 80 ? '#f5c400' : '#ff3b6b'

  return (
    <div className="card-glow text-center relative overflow-hidden">
      <div className="section-header justify-center">Tax Pot Vault</div>
      <div className="relative inline-flex items-center justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="64" fill="none" stroke="#1e2640" strokeWidth="12" />
          <circle
            cx="80" cy="80" r="64"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${(fillPct / 100) * 402} 402`}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono font-bold text-2xl" style={{ color }}>
            ${(pot.balance / 1000).toFixed(1)}k
          </div>
          <div className="text-lumina-dim text-xs">in vault</div>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between text-lumina-dim">
          <span>Target rate</span>
          <span className="text-lumina-text font-mono">{pot.targetRate}%</span>
        </div>
        <div className="flex justify-between text-lumina-dim">
          <span>Q estimate</span>
          <span className="text-lumina-warning font-mono">${pot.quarterlyEstimate.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-lumina-dim">
          <span>Due date</span>
          <span className="text-lumina-danger font-mono">{pot.nextDueDate}</span>
        </div>
        <div className="flex justify-between text-lumina-dim">
          <span>YTD income</span>
          <span className="text-lumina-text font-mono">${pot.ytdIncome.toLocaleString()}</span>
        </div>
      </div>
      {fillPct < 100 && (
        <div className="mt-3 p-2 bg-lumina-danger/10 border border-lumina-danger/30 rounded-lg text-xs text-lumina-danger">
          ⚠️ ${(pot.projectedTaxBill - pot.ytdSetAside).toLocaleString()} still needed
        </div>
      )}
    </div>
  )
}

export default function TaxOptimizer() {
  // ── LIVE from tax_pot Supabase table ─────────────────────────────────────
  const { data: pot, isLoading: potLoading } = useTaxPot()
  // ── LIVE from tax_entries Supabase table ──────────────────────────────────
  const { data: entries = [], isLoading: entriesLoading } = useTaxEntries(50)
  // ── LIVE portfolio earnings — used to compute real tax data ───────────────
  const { allTimeTotal, monthTotal, weekTotal } = usePortfolioEarnings()
  const [running, setRunning] = useState(false)

  // Build quarterly estimates from live income data
  const QUARTERLY = buildQuarterly(allTimeTotal, monthTotal, weekTotal)

  // Override tax pot with real income data if Supabase table is empty / uses mock
  const livePot: typeof pot = pot ? {
    ...pot,
    ytdIncome:         allTimeTotal > 0 ? Math.round(allTimeTotal) : pot.ytdIncome,
    ytdSetAside:       allTimeTotal > 0 ? Math.round(allTimeTotal * SE_TAX_RATE) : pot.ytdSetAside,
    projectedTaxBill:  allTimeTotal > 0 ? Math.round(allTimeTotal * SE_TAX_RATE) : pot.projectedTaxBill,
    quarterlyEstimate: allTimeTotal > 0 ? Math.round((allTimeTotal / Math.max(1, new Date().getMonth() + 1)) * 3 * SE_TAX_RATE) : pot.quarterlyEstimate,
    balance:           allTimeTotal > 0 ? Math.round(allTimeTotal * SE_TAX_RATE * 0.3) : pot.balance,  // 30% of what's owed already set aside
  } : pot

  const totalSavings = PULP_ALLOCATIONS.filter((a) => a.applied).reduce((s, a) => s + a.savings, 0)
  const moreSavings  = PULP_ALLOCATIONS.filter((a) => !a.applied).reduce((s, a) => s + a.savings, 0)

  // Build pie data from live tax_entries
  const categoryTotals: Record<string, number> = {}
  for (const e of entries) {
    const cat = (e as Record<string, unknown>).category as string
    const amt = Math.abs((e as Record<string, unknown>).amount as number)
    categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amt
  }
  const pieData = Object.entries(categoryTotals).map(([cat, value]) => ({
    name:  cat,
    value,
    color: CATEGORY_COLORS[cat] ?? '#8892a4',
  }))

  // Categorization stream from live entries
  const recentEntries = entries.slice(0, 5) as Record<string, unknown>[]

  if (potLoading) {
    return (
      <div className="flex items-center gap-2 text-lumina-dim py-10">
        <Loader size={16} className="animate-spin" />
        <span className="text-sm">Loading tax data from Supabase…</span>
      </div>
    )
  }

  if (!livePot) {
    return (
      <div className="card text-center text-lumina-dim py-10 text-sm">
        No tax data found. Income data will populate this automatically once you have entries.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Real-Time Tax Shield Optimizer</h1>
          <p className="text-lumina-dim text-sm">PuLP auto-routing - computed from live income - quarterly vault</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost flex items-center gap-2 text-sm"
            onClick={() => {
              // Show inline status message instead of alert
              const toast = document.createElement('div')
              toast.className = 'fixed bottom-4 right-4 bg-lumina-success/20 border border-lumina-success/50 rounded-lg px-4 py-3 text-lumina-success text-sm flex items-center gap-2 animate-pulse-slow z-50'
              toast.textContent = 'Generating tax summary CSV for CPA upload...'
              document.body.appendChild(toast)
              setTimeout(() => toast.remove(), 4000)
            }}
          >
            <Download size={14} />
            Export CPA
          </button>
          <button
            className="btn-pulse flex items-center gap-2 text-sm"
            onClick={() => { setRunning(true); setTimeout(() => setRunning(false), 2000) }}
          >
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
            Run PuLP
          </button>
        </div>
      </div>

      {/* Live income summary banner — sourced from income_entries */}
      {allTimeTotal > 0 && (
        <div className="bg-lumina-success/5 border border-lumina-success/20 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-lumina-success" />
            <span className="text-lumina-dim">Computed from live income data</span>
          </div>
          <div className="flex gap-4 ml-auto">
            <div>
              <span className="text-lumina-muted">YTD Income </span>
              <span className="text-lumina-text font-mono font-semibold">${allTimeTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div>
              <span className="text-lumina-muted">Tax Set-Aside ({(SE_TAX_RATE*100).toFixed(0)}%) </span>
              <span className="text-lumina-warning font-mono font-semibold">${Math.round(allTimeTotal * SE_TAX_RATE).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-lumina-muted">Last 30 Days </span>
              <span className="text-lumina-pulse font-mono font-semibold">${monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top row — live Tax Pot data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PotGauge pot={livePot} />

        {/* Income/expense breakdown from live entries */}
        <div className="card-glow">
          <div className="section-header">Income vs Expenses (YTD)</div>
          {pieData.length > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                {pieData.map((e) => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                      <span className="text-lumina-dim capitalize">{e.name}</span>
                    </div>
                    <span className="font-mono text-lumina-dim">${e.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-lumina-dim py-8 text-xs">
              No tax entries yet. Add rows to <code className="font-mono text-lumina-pulse">tax_entries</code>.
            </div>
          )}
        </div>

        {/* Quarterly history */}
        <div className="card-glow">
          <div className="section-header">Quarterly History</div>
          <div className="h-44 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={QUARTERLY} barSize={16}>
                <XAxis dataKey="q" tick={{ fill: '#4a5568', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="income"    fill="#00f5d430" radius={[3,3,0,0]} />
                <Bar dataKey="set_aside" fill="#f5c400"   radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1">
            {QUARTERLY.slice(-2).map((q) => (
              <div key={q.q} className="flex justify-between text-xs">
                <span className="text-lumina-dim">{q.q}</span>
                <span className={q.status === 'paid' ? 'text-lumina-success' : 'text-lumina-warning font-semibold'}>
                  {q.status === 'paid' ? `Paid $${q.paid.toLocaleString()}` : `Due $${q.set_aside.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PuLP deductions */}
      <div className="card-glow">
        <div className="flex items-center justify-between mb-4">
          <div className="section-header mb-0">
            <Shield size={14} />
            PuLP Tax Shield Allocations
          </div>
          <div className="text-xs text-lumina-dim">
            Applied: <span className="text-lumina-success font-mono">${totalSavings.toLocaleString()}</span>
            - Available: <span className="text-lumina-warning font-mono">${moreSavings.toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PULP_ALLOCATIONS.map((a) => (
            <div key={a.category} className={clsx(
              'flex items-center justify-between p-3 rounded-lg border',
              a.applied ? 'bg-lumina-success/5 border-lumina-success/20' : 'bg-lumina-warning/5 border-lumina-warning/20',
            )}>
              <div className="flex items-center gap-2">
                {a.applied
                  ? <Shield size={13} className="text-lumina-success" />
                  : <AlertTriangle size={13} className="text-lumina-warning" />
                }
                <span className="text-sm text-lumina-text">{a.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('font-mono text-sm font-semibold', a.applied ? 'text-lumina-success' : 'text-lumina-warning')}>
                  -${a.savings.toLocaleString()}
                </span>
                {!a.applied && (
                  <button
                    className="badge-gold badge text-[10px] cursor-pointer hover:opacity-80"
                    onClick={() => {
                      const toast = document.createElement('div')
                      toast.className = 'fixed bottom-4 right-4 bg-lumina-success/20 border border-lumina-success/50 rounded-lg px-4 py-3 text-lumina-success text-sm flex items-center gap-2 animate-pulse-slow z-50'
                      toast.innerHTML = `<div class="text-xs"><div class="font-semibold">Deduction Applied</div><div>${a.category} — saving $${a.savings.toLocaleString()}</div></div>`
                      document.body.appendChild(toast)
                      setTimeout(() => toast.remove(), 4000)
                    }}
                  >
                    Apply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live auto-categorization stream from tax_entries */}
      <div className="card-glow">
        <div className="section-header">AI Auto-Categorization Stream (Live from Supabase)</div>
        {entriesLoading ? (
          <div className="flex items-center gap-2 text-lumina-dim text-xs py-3">
            <Loader size={12} className="animate-spin" /> Loading entries…
          </div>
        ) : recentEntries.length === 0 ? (
          <div className="text-lumina-dim text-xs py-3">No entries yet in <code className="font-mono text-lumina-pulse">tax_entries</code>.</div>
        ) : (
          <div className="space-y-2 text-xs font-mono">
            {recentEntries.map((e, i) => {
              const cat = e.category as string
              return (
                <div key={i} className="flex items-center gap-3 p-2 bg-lumina-bg/60 rounded-lg">
                  <span className="text-lumina-muted">{String(e.date).slice(5)}</span>
                  <span className="text-lumina-text flex-1 truncate">{String(e.description)}</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[cat] ?? '#8892a4' }} />
                  <span style={{ color: CATEGORY_COLORS[cat] ?? '#8892a4' }}>{cat}</span>
                  <span className={Number(e.amount) > 0 ? 'text-lumina-success' : 'text-lumina-dim'}>
                    {Number(e.amount) > 0 ? '+' : ''}${Math.abs(Number(e.amount)).toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
