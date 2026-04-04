import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Zap, Activity, DollarSign } from 'lucide-react'
import DailyBriefing from './DailyBriefing'
import JobCard from './JobCard'
import TwinEngine from './TwinEngine'
import FunnelAgent from './FunnelAgent'
import TaxOptimizer from './TaxOptimizer'
import EdgeHarmonizer from './EdgeHarmonizer'
import SynergyBrain from './SynergyBrain'
import ContentSwarm from './ContentSwarm'
import MonteCarloSimulator from './MonteCarloSimulator'
import MoneyFlowOptimizer from './MoneyFlowOptimizer'
import TaskPrioritizer from './TaskPrioritizer'
import CashOutModal from './CashOutModal'
import TransactionHistory from './TransactionHistory'
import DigitalAssetStore from './DigitalAssetStore'
import CustomerAcquisitionEngine from './CustomerAcquisitionEngine'
import PolymarketScriptTrader from './PolymarketScriptTrader'
import AgentOrchestrator from './AgentOrchestrator'
import AIEducationHub from './AIEducationHub'
import Settings from './Settings'
import WalletPanel from './WalletPanel'
import EarningsTicker from './EarningsTicker'
import GoalTracker from './GoalTracker'
import WithdrawalHistory from './WithdrawalHistory'
// ── Real data hooks ─────────────────────────────────────────────────────────
import { useJobs, useJobStats } from '../hooks/useJobs'
import { useMT5Account, useMT5Trades } from '../hooks/useMT5'
import { useTodayBriefing, usePolyMarkets } from '../hooks/useSupabaseData'
import { useCryptoPrices, formatCryptoPrice } from '../hooks/useCryptoPrices'
import type { MT5Account, MT5Trade, Job } from '../lib/types'
import clsx from 'clsx'

interface OpsHubProps {
  activeTab: string
}

// Zero-balance account used as placeholder before MT5 bridge responds
const EMPTY_ACCOUNT: MT5Account = {
  accountId: '0',
  equity: 0,
  balance: 0,
  margin: 0,
  freeMargin: 0,
  marginLevel: 0,
  profit: 0,
  openTrades: [],
  dayPnl: 0,
  weekPnl: 0,
  monthPnl: 0,
}

// ── Ticker bar — live MT5 trades + live CoinGecko prices + live Polymarket ───
function TickerBar() {
  const { data: account } = useMT5Account()
  const { data: prices }  = useCryptoPrices()
  const { data: polyMarkets = [] } = usePolyMarkets()

  const mt5Ticks = (account?.openTrades ?? []).map((t) => ({
    s: t.symbol,
    p: t.currentPrice.toFixed(t.symbol.includes('JPY') ? 2 : t.symbol.includes('XAU') ? 1 : 4),
    c: `${t.profit >= 0 ? '+' : ''}$${t.profit.toFixed(0)}`,
    pos: t.profit >= 0,
  }))

  const cryptoTicks = prices ? [
    { s: 'BNB',  p: formatCryptoPrice(prices.BNB.usd),  c: `${prices.BNB.usd_24h_change >= 0 ? '+' : ''}${prices.BNB.usd_24h_change.toFixed(1)}%`,  pos: prices.BNB.usd_24h_change >= 0 },
    { s: 'BTC',  p: formatCryptoPrice(prices.BTC.usd),  c: `${prices.BTC.usd_24h_change >= 0 ? '+' : ''}${prices.BTC.usd_24h_change.toFixed(1)}%`,  pos: prices.BTC.usd_24h_change >= 0 },
    { s: 'ETH',  p: formatCryptoPrice(prices.ETH.usd),  c: `${prices.ETH.usd_24h_change >= 0 ? '+' : ''}${prices.ETH.usd_24h_change.toFixed(1)}%`,  pos: prices.ETH.usd_24h_change >= 0 },
    { s: 'SOL',  p: formatCryptoPrice(prices.SOL.usd),  c: `${prices.SOL.usd_24h_change >= 0 ? '+' : ''}${prices.SOL.usd_24h_change.toFixed(1)}%`,  pos: prices.SOL.usd_24h_change >= 0 },
  ] : []

  // Live Polymarket tickers from Supabase poly_markets table
  const polyTicks = polyMarkets.slice(0, 4).map((m) => {
    const yesPrice = m.outcomes?.[0]?.price ?? 0
    const tag = m.question.length > 18 ? m.question.slice(0, 16) + '…' : m.question
    return {
      s: `POLY:${tag}`,
      p: `${Math.round(yesPrice * 100)}¢`,
      c: yesPrice >= 0.5 ? 'YES' : 'NO',
      pos: yesPrice >= 0.5,
    }
  })

  const ticks = [...mt5Ticks, ...cryptoTicks, ...polyTicks]

  return (
    <div className="overflow-hidden border-b border-lumina-border bg-lumina-surface py-1.5 px-4">
      <div className="flex gap-6 animate-ticker text-xs font-mono text-lumina-dim">
        {[...ticks, ...ticks, ...ticks].map((t, i) => (
          <span key={i} className="flex gap-2 whitespace-nowrap">
            <span className="text-lumina-dim">{t.s}</span>
            <span className="text-lumina-text">{t.p}</span>
            <span className={t.pos ? 'text-lumina-success' : 'text-lumina-danger'}>{t.c}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-lumina-pulse', pulse = false }: {
  label: string; value: string; sub?: string; color?: string; pulse?: boolean
}) {
  return (
    <div className="card-glow flex flex-col gap-1">
      <div className="stat-label">{label}</div>
      <div className={clsx('stat-value', color, pulse && 'animate-pulse-slow')}>{value}</div>
      {sub && <div className="text-xs text-lumina-dim font-mono">{sub}</div>}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
function Dashboard() {
  const { data: jobs = [],   isLoading: jobsLoading } = useJobs()
  const { data: account,     isLoading: acctLoading } = useMT5Account()
  const { data: briefing,    isLoading: briefLoading } = useTodayBriefing()

  const acc   = account ?? EMPTY_ACCOUNT
  const pnl   = briefing?.pnlSummary ?? { mt5: 0, polymarket: 0, total: 0 }
  const stats = useJobStats(jobs)

  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [rotating,   setRotating]    = useState(false)

  // ── Cash Out modal state ──────────────────────────────────────────────────
  // null = closed, Job = single-job modal, 'all' = global cash-out
  const [cashOutTarget, setCashOutTarget] = useState<Job | 'all' | null>(null)

  const qc = useQueryClient()

  const refresh = useCallback(() => {
    setRotating(true)
    setLastRefresh(new Date())
    void qc.invalidateQueries()
    setTimeout(() => setRotating(false), 800)
  }, [qc])

  useEffect(() => {
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const loading = jobsLoading || acctLoading || briefLoading
  // Daily earnings from active jobs — this is what's actually available to cash out today
  const totalAvailable = stats.activeDailyTotal

  return (
    <div className="space-y-6">
      {/* Loading bar */}
      {loading && (
        <div className="w-full h-0.5 bg-lumina-border rounded overflow-hidden">
          <div className="h-full bg-lumina-pulse animate-pulse-slow w-1/2 rounded" />
        </div>
      )}

      {/* Daily Briefing */}
      <DailyBriefing />

      {/* Task Prioritizer */}
      <TaskPrioritizer />

      {/* Live earnings ticker + wallet panel — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EarningsTicker />
        <WalletPanel />
      </div>

      {/* Top stats + global Cash Out button */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Today's PnL"
          value={pnl.total !== 0 ? `${pnl.total >= 0 ? '+' : ''}$${pnl.total.toLocaleString()}` : '$0'}
          sub="MT5 + Polymarket (real)"
          color="text-lumina-success"
          pulse
        />
        <StatCard
          label="Monthly Target"
          value={stats.totalMonthly > 0 ? `$${(stats.totalMonthly / 1000).toFixed(1)}k` : '—'}
          sub={stats.totalProjected > 0 ? `Goal: $${(stats.totalProjected / 1000).toFixed(1)}k` : 'Set targets'}
          color="text-lumina-pulse"
        />
        <StatCard
          label="MT5 Equity"
          value={acc.equity > 0 ? `$${acc.equity.toLocaleString()}` : '—'}
          sub={acc.equity > 0 ? `${acc.dayPnl >= 0 ? '+' : ''}$${acc.dayPnl.toLocaleString()} today` : 'Bridge connecting…'}
          color="text-lumina-gold"
        />
        {/* Global Cash Out card */}
        <div className="card-glow flex flex-col gap-2">
          <div className="stat-label">Today's Earnings</div>
          <div className="stat-value text-lumina-success">
            {totalAvailable > 0 ? `$${totalAvailable.toLocaleString()}` : '$0'}
          </div>
          <div className="text-[10px] text-lumina-dim">
            {stats.activeCount > 0 ? `${stats.activeCount} active jobs` : 'No active jobs'}
          </div>
          {totalAvailable > 0 && (
            <button
              onClick={() => setCashOutTarget('all')}
              className="btn-pulse text-xs py-1.5 flex items-center justify-center gap-1.5 mt-auto"
            >
              <DollarSign size={12} />
              Cash Out Today
            </button>
          )}
        </div>
      </div>

      {/* Live MT5 positions */}
      <LiveTradesTable acc={acc} onRefresh={refresh} rotating={rotating} />

      {/* Job Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="section-header mb-0">
            <Zap size={14} />
            Top {jobs.length} Revenue Jobs
          </div>
          <div className="flex items-center gap-3">
            {jobs.length > 0 && totalAvailable > 0 && (
              <button
                onClick={() => setCashOutTarget('all')}
                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 border-lumina-success/40 text-lumina-success hover:border-lumina-success"
              >
                <DollarSign size={11} />
                Cash Out Today ${totalAvailable.toLocaleString()}
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-lumina-dim">
              <div className="pulse-dot" />
              Live · {lastRefresh.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {jobs.length === 0 && !jobsLoading ? (
          <div className="card text-center text-lumina-dim py-10 text-sm">
            No jobs found in <code className="font-mono text-lumina-pulse">ops_jobs</code> table.
            <br />
            <span className="text-xs mt-1 block">Run <code>supabase/seed_demo.sql</code> to populate.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map((job, i) => (
              <JobCard
                key={job.id}
                job={job}
                rank={i + 1}
                onCashOut={(j) => setCashOutTarget(j)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Goal Tracker + Withdrawal History — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GoalTracker />
        <WithdrawalHistory />
      </div>

      {/* Account footer */}
      {acc.equity > 0 && (
        <div className="card flex items-center justify-between text-xs font-mono">
          <div className="flex gap-6">
            <span className="text-lumina-dim">Balance <span className="text-lumina-text">${acc.balance.toLocaleString()}</span></span>
            <span className="text-lumina-dim">Equity <span className="text-lumina-text">${acc.equity.toLocaleString()}</span></span>
            <span className="text-lumina-dim">Margin Lvl <span className="text-lumina-success">{acc.marginLevel.toFixed(0)}%</span></span>
            <span className="text-lumina-dim">Month P&L <span className="text-lumina-pulse">+${acc.monthPnl.toLocaleString()}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="pulse-dot" />
            <span className="text-lumina-dim">MT5 Live · Acc #{acc.accountId}</span>
          </div>
        </div>
      )}

      {/* ── Cash Out Modal (portal) ── */}
      {cashOutTarget !== null && (
        <CashOutModal
          job={cashOutTarget !== 'all' ? cashOutTarget : undefined}
          jobs={cashOutTarget === 'all' ? jobs : undefined}
          onClose={() => setCashOutTarget(null)}
        />
      )}
    </div>
  )
}

// ── Live trades table ─────────────────────────────────────────────────────────
function LiveTradesTable({ acc, onRefresh, rotating }: {
  acc: MT5Account; onRefresh: () => void; rotating: boolean
}) {
  const { data: liveTrades } = useMT5Trades()
  const trades: MT5Trade[] = liveTrades ?? acc.openTrades

  return (
    <div className="card-glow">
      <div className="flex items-center justify-between mb-3">
        <div className="section-header mb-0">
          <Activity size={14} />
          Live MT5 Positions ({trades.length})
        </div>
        <button onClick={onRefresh} className="text-lumina-dim hover:text-lumina-pulse transition-colors">
          <RefreshCw size={13} className={rotating ? 'animate-spin' : ''} />
        </button>
      </div>
      {trades.length === 0 ? (
        <div className="text-center text-lumina-dim py-6 text-sm">No open positions right now</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-lumina-dim">
                <th className="text-left py-1 pr-4">Symbol</th>
                <th className="text-left py-1 pr-4">Type</th>
                <th className="text-right py-1 pr-4">Vol</th>
                <th className="text-right py-1 pr-4">Open</th>
                <th className="text-right py-1 pr-4">Current</th>
                <th className="text-right py-1 pr-4">SL / TP</th>
                <th className="text-right py-1">P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const isJpy = t.symbol.includes('JPY')
                const isXau = t.symbol.includes('XAU')
                const dp    = isJpy ? 2 : isXau ? 1 : 4
                return (
                  <tr key={t.ticket} className="border-t border-lumina-border/40 hover:bg-lumina-bg/40 transition-colors">
                    <td className="py-1.5 pr-4 text-lumina-text font-semibold">{t.symbol}</td>
                    <td className={clsx('py-1.5 pr-4 uppercase font-semibold', t.type === 'buy' ? 'text-lumina-success' : 'text-lumina-danger')}>
                      {t.type}
                    </td>
                    <td className="py-1.5 pr-4 text-right text-lumina-dim">{t.volume}</td>
                    <td className="py-1.5 pr-4 text-right text-lumina-dim">{t.openPrice.toFixed(dp)}</td>
                    <td className="py-1.5 pr-4 text-right text-lumina-text">{t.currentPrice.toFixed(dp)}</td>
                    <td className="py-1.5 pr-4 text-right text-lumina-muted text-[10px]">
                      {t.sl.toFixed(dp)} / {t.tp.toFixed(dp)}
                    </td>
                    <td className={clsx('py-1.5 text-right font-semibold', t.profit >= 0 ? 'text-lumina-success' : 'text-lumina-danger')}>
                      {t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-lumina-border">
                <td colSpan={6} className="pt-2 text-lumina-dim">Total Float P&L</td>
                <td className={clsx('pt-2 text-right font-bold', trades.reduce((s, t) => s + t.profit, 0) >= 0 ? 'text-lumina-success' : 'text-lumina-danger')}>
                  {trades.reduce((s, t) => s + t.profit, 0) >= 0 ? '+' : ''}
                  ${trades.reduce((s, t) => s + t.profit, 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab router ────────────────────────────────────────────────────────────────
export default function OpsHub({ activeTab }: OpsHubProps) {
  return (
    <div className="min-h-screen">
      <TickerBar />
      <div className="p-6">
        {activeTab === 'dashboard'        && <Dashboard />}
        {activeTab === 'twin-engine'      && <TwinEngine />}
        {activeTab === 'edge-harmonizer'  && <EdgeHarmonizer />}
        {activeTab === 'funnel'           && <FunnelAgent />}
        {activeTab === 'digital-assets'   && <DigitalAssetStore />}
        {activeTab === 'synergy'          && <SynergyBrain />}
        {activeTab === 'content'          && <ContentSwarm />}
        {activeTab === 'montecarlo'       && <MonteCarloSimulator />}
        {activeTab === 'money-flow'       && <MoneyFlowOptimizer />}
        {activeTab === 'transactions'     && <TransactionHistory />}
        {activeTab === 'customer-acquisition' && <CustomerAcquisitionEngine />}
        {activeTab === 'poly-script'     && <PolymarketScriptTrader />}
        {activeTab === 'agent-orchestrator' && <AgentOrchestrator />}
        {activeTab === 'education'       && <AIEducationHub />}
        {activeTab === 'tax-optimizer'   && <TaxOptimizer />}
        {activeTab === 'settings'        && <Settings />}
      </div>
    </div>
  )
}
