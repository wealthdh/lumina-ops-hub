/**
 * LuminaAlpha — Full sidebar panel/drawer for real-time MT5 & job monitoring
 *
 * Features:
 * - Real-time MT5 account metrics (balance, equity, margin level)
 * - Open trades list with live P&L updates (10s polling)
 * - Daily/Weekly/Monthly P&L breakdown
 * - Risk indicators (drawdown warnings, winning streaks)
 * - Job monitoring with real-time earnings
 * - Activity log (last 5 trades & job updates)
 *
 * Uses existing hooks: useMT5Account(), useMT5Trades(), useJobs()
 * Supabase tables: mt5_trades, mt5_accounts, auto_tasks
 */

import { useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Zap, DollarSign, BarChart3, Clock, Activity,
  RefreshCw, Loader, Flame,
} from 'lucide-react'
import clsx from 'clsx'
import { useMT5Account, useMT5Trades } from '../hooks/useMT5'
import { useJobs, useJobStats } from '../hooks/useJobs'
import { supabase } from '../lib/supabase'
import type { MT5Trade, AutoTask } from '../lib/types'

interface ActivityLogEntry {
  id: string
  type: 'trade_open' | 'trade_close' | 'job_update'
  title: string
  amount?: number
  symbol?: string
  timestamp: string
}

export default function LuminaAlpha() {
  const { data: account, isLoading: accountLoading } = useMT5Account()
  const { data: trades = [], isLoading: tradesLoading } = useMT5Trades()
  const { data: jobs = [] } = useJobs()
  const jobStats = useJobStats(jobs)

  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(true)

  // Fetch activity log from Supabase (last 5 actions)
  useEffect(() => {
    const fetchActivityLog = async () => {
      setLogLoading(true)
      try {
        const [tradesRes, tasksRes] = await Promise.all([
          supabase
            .from('mt5_trades')
            .select('*')
            .order('open_time', { ascending: false })
            .limit(5),
          supabase
            .from('auto_tasks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        const entries: ActivityLogEntry[] = []

        // Add trade entries
        if (tradesRes.data) {
          tradesRes.data.forEach(t => {
            entries.push({
              id: `trade_${t.ticket}`,
              type: t.close_time ? 'trade_close' : 'trade_open',
              title: `${t.type.toUpperCase()} ${t.symbol}`,
              amount: t.profit,
              symbol: t.symbol,
              timestamp: t.open_time || new Date().toISOString(),
            })
          })
        }

        // Add task entries
        if (tasksRes.data) {
          tasksRes.data.forEach(t => {
            entries.push({
              id: `task_${t.id}`,
              type: 'job_update',
              title: t.title,
              timestamp: t.created_at || new Date().toISOString(),
            })
          })
        }

        // Sort by timestamp descending, take top 5
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setActivityLog(entries.slice(0, 5))
      } catch (err) {
        console.error('[LuminaAlpha] Failed to fetch activity log:', err)
      } finally {
        setLogLoading(false)
      }
    }

    fetchActivityLog()
    const interval = setInterval(fetchActivityLog, 15_000) // Update every 15s
    return () => clearInterval(interval)
  }, [])

  // Derived metrics
  const isConnected = !!account
  const balance = account?.balance ?? 0
  const equity = account?.equity ?? 0
  const marginLevel = account?.marginLevel ?? 0
  const dayPnl = account?.dayPnl ?? 0
  const weekPnl = account?.weekPnl ?? 0
  const monthPnl = account?.monthPnl ?? 0

  // Risk calculations
  const drawdownPercent = balance > 0 ? ((balance - equity) / balance) * 100 : 0
  const isHighRisk = drawdownPercent > 5
  const isMediumRisk = drawdownPercent > 2 && drawdownPercent <= 5
  const isLowRisk = drawdownPercent <= 2

  // Winning streak detection (consecutive profitable trades)
  const winningStreakCount = calculateWinningStreak(trades)
  const hasWinningStreak = winningStreakCount >= 3

  // Total daily job revenue
  const totalDailyJobRevenue = jobStats.totalDaily

  return (
    <div className="w-full h-full bg-lumina-surface text-lumina-text p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-lumina-pulse" />
          <h1 className="text-xl font-bold text-lumina-text">Lumina Alpha</h1>
        </div>
        {accountLoading && <Loader size={16} className="text-lumina-pulse animate-spin" />}
      </div>

      {!isConnected ? (
        <div className="bg-lumina-card border border-lumina-border rounded-lg p-4 text-center">
          <AlertTriangle className="mx-auto mb-2 text-lumina-warning" size={24} />
          <p className="text-lumina-dim text-sm">MT5 bridge offline</p>
          <p className="text-lumina-dim text-xs mt-1">Check connection status</p>
        </div>
      ) : (
        <>
          {/* ─── Account Overview ─────────────────────────────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-lumina-pulse uppercase tracking-wider mb-3">
              Account Status
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {/* Balance */}
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="text-xs text-lumina-dim mb-1">Balance</div>
                <div className="text-lg font-bold text-lumina-success">
                  ${balance.toFixed(2)}
                </div>
              </div>

              {/* Equity */}
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="text-xs text-lumina-dim mb-1">Equity</div>
                <div className="text-lg font-bold text-lumina-pulse">
                  ${equity.toFixed(2)}
                </div>
              </div>

              {/* Margin Level */}
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="text-xs text-lumina-dim mb-1">Margin</div>
                <div
                  className={clsx(
                    'text-lg font-bold',
                    marginLevel > 100
                      ? 'text-lumina-success'
                      : marginLevel > 50
                        ? 'text-lumina-warning'
                        : 'text-lumina-error',
                  )}
                >
                  {marginLevel.toFixed(0)}%
                </div>
              </div>
            </div>
          </section>

          {/* ─── Risk Indicators ──────────────────────────────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-lumina-pulse uppercase tracking-wider mb-3">
              Risk Profile
            </h2>
            <div className="space-y-2">
              {/* Drawdown Warning */}
              {isHighRisk && (
                <div className="bg-lumina-error/10 border border-lumina-error rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-lumina-error flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-lumina-error">High Drawdown</div>
                    <div className="text-xs text-lumina-dim">
                      Drawdown at {drawdownPercent.toFixed(1)}% (&gt;5% threshold)
                    </div>
                  </div>
                </div>
              )}

              {/* Winning Streak */}
              {hasWinningStreak && (
                <div className="bg-lumina-success/10 border border-lumina-success rounded-lg p-3 flex items-start gap-2">
                  <Flame size={16} className="text-lumina-success flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-lumina-success">
                      Winning Streak 🔥
                    </div>
                    <div className="text-xs text-lumina-dim">
                      {winningStreakCount} consecutive profitable trades
                    </div>
                  </div>
                </div>
              )}

              {/* Risk Level Badge */}
              <div
                className={clsx(
                  'rounded-lg p-3 border',
                  isLowRisk
                    ? 'bg-lumina-success/10 border-lumina-success'
                    : isMediumRisk
                      ? 'bg-lumina-warning/10 border-lumina-warning'
                      : 'bg-lumina-error/10 border-lumina-error',
                )}
              >
                <div className="text-xs font-semibold mb-1">
                  Risk Level:{' '}
                  <span
                    className={clsx(
                      isLowRisk
                        ? 'text-lumina-success'
                        : isMediumRisk
                          ? 'text-lumina-warning'
                          : 'text-lumina-error',
                    )}
                  >
                    {isLowRisk ? 'LOW' : isMediumRisk ? 'MEDIUM' : 'HIGH'}
                  </span>
                </div>
                <div className="text-xs text-lumina-dim">
                  Drawdown: {drawdownPercent.toFixed(1)}%
                </div>
              </div>
            </div>
          </section>

          {/* ─── P&L Summary ──────────────────────────────────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-lumina-pulse uppercase tracking-wider mb-3">
              P&L Breakdown
            </h2>
            <div className="space-y-2">
              {/* Daily PnL */}
              <div className="flex justify-between items-center bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-lumina-pulse" />
                  <span className="text-sm font-medium">Daily P&L</span>
                </div>
                <span
                  className={clsx(
                    'font-bold text-sm',
                    dayPnl >= 0 ? 'text-lumina-success' : 'text-lumina-error',
                  )}
                >
                  {dayPnl >= 0 ? '+' : ''}${dayPnl.toFixed(2)}
                </span>
              </div>

              {/* Weekly PnL */}
              {weekPnl !== undefined && (
                <div className="flex justify-between items-center bg-lumina-card border border-lumina-border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-lumina-pulse" />
                    <span className="text-sm font-medium">Weekly P&L</span>
                  </div>
                  <span
                    className={clsx(
                      'font-bold text-sm',
                      weekPnl >= 0 ? 'text-lumina-success' : 'text-lumina-error',
                    )}
                  >
                    {weekPnl >= 0 ? '+' : ''}${weekPnl.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Monthly PnL */}
              <div className="flex justify-between items-center bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-lumina-pulse" />
                  <span className="text-sm font-medium">Monthly P&L</span>
                </div>
                <span
                  className={clsx(
                    'font-bold text-sm',
                    monthPnl >= 0 ? 'text-lumina-success' : 'text-lumina-error',
                  )}
                >
                  {monthPnl >= 0 ? '+' : ''}${monthPnl.toFixed(2)}
                </span>
              </div>
            </div>
          </section>

          {/* ─── Open Trades ──────────────────────────────────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-lumina-pulse uppercase tracking-wider mb-3">
              Open Trades {trades.length > 0 && <span className="text-lumina-gold">({trades.length})</span>}
            </h2>
            {tradesLoading ? (
              <div className="text-center py-4">
                <Loader size={16} className="text-lumina-pulse animate-spin mx-auto" />
              </div>
            ) : trades.length === 0 ? (
              <div className="text-center py-4 text-lumina-dim text-sm">No open trades</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {trades.map(trade => (
                  <TradeRow key={trade.ticket} trade={trade} />
                ))}
              </div>
            )}
          </section>

          {/* ─── Job Monitoring ───────────────────────────────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-lumina-pulse uppercase tracking-wider mb-3">
              Job Monitoring
            </h2>
            <div className="space-y-2">
              {/* Active jobs count */}
              <div className="flex justify-between items-center bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-lumina-pulse" />
                  <span className="text-sm font-medium">Active Jobs</span>
                </div>
                <span className="font-bold text-sm text-lumina-pulse">
                  {jobStats.activeCount}
                </span>
              </div>

              {/* Total daily job revenue */}
              <div className="flex justify-between items-center bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-lumina-success" />
                  <span className="text-sm font-medium">Daily Revenue</span>
                </div>
                <span className="font-bold text-sm text-lumina-success">
                  ${totalDailyJobRevenue.toFixed(2)}
                </span>
              </div>

              {/* Monthly projected */}
              <div className="flex justify-between items-center bg-lumina-card border border-lumina-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-lumina-pulse" />
                  <span className="text-sm font-medium">Monthly Projected</span>
                </div>
                <span className="font-bold text-sm text-lumina-pulse">
                  ${jobStats.totalProjected.toFixed(2)}
                </span>
              </div>
            </div>
          </section>

          {/* ─── Activity Log ─────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-lumina-pulse uppercase tracking-wider mb-3">
              Activity Log
            </h2>
            {logLoading ? (
              <div className="text-center py-4">
                <Loader size={16} className="text-lumina-pulse animate-spin mx-auto" />
              </div>
            ) : activityLog.length === 0 ? (
              <div className="text-center py-4 text-lumina-dim text-sm">No activity yet</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activityLog.map(entry => (
                  <ActivityLogRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ─── Trade Row Component ──────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: MT5Trade }) {
  const profitPercent = trade.openPrice > 0
    ? ((trade.profit / trade.openPrice) * 100).toFixed(2)
    : '0.00'

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-3">
      {/* Top row: symbol, type, profit */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={clsx(
              'w-2 h-2 rounded-full',
              trade.type === 'buy'
                ? 'bg-lumina-success'
                : 'bg-lumina-error',
            )}
          />
          <span className="font-bold text-sm">{trade.symbol}</span>
          <span className="text-xs text-lumina-dim uppercase">{trade.type}</span>
        </div>
        <span
          className={clsx(
            'font-bold text-sm',
            trade.profit >= 0 ? 'text-lumina-success' : 'text-lumina-error',
          )}
        >
          {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
        </span>
      </div>

      {/* Bottom row: volume, current price, percent */}
      <div className="text-xs text-lumina-dim space-y-1">
        <div className="flex justify-between">
          <span>Volume: {trade.volume}</span>
          <span>Open: {trade.openPrice.toFixed(5)}</span>
        </div>
        <div className="flex justify-between">
          <span>Current: {trade.currentPrice.toFixed(5)}</span>
          <span
            className={clsx(
              trade.profit >= 0 ? 'text-lumina-success' : 'text-lumina-error',
            )}
          >
            {trade.profit >= 0 ? '+' : ''}{profitPercent}%
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Activity Log Row Component ────────────────────────────────────────────────

function ActivityLogRow({ entry }: { entry: ActivityLogEntry }) {
  const timestamp = new Date(entry.timestamp)
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - timestamp.getTime()) / 60_000)
  const timeStr = formatTimeAgo(diffMinutes)

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-3 flex items-start gap-3">
      {/* Icon */}
      <div
        className={clsx(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          entry.type === 'trade_open'
            ? 'bg-lumina-success/20'
            : entry.type === 'trade_close'
              ? 'bg-lumina-warning/20'
              : 'bg-lumina-pulse/20',
        )}
      >
        {entry.type === 'trade_open' && (
          <TrendingUp size={16} className="text-lumina-success" />
        )}
        {entry.type === 'trade_close' && (
          <TrendingDown size={16} className="text-lumina-warning" />
        )}
        {entry.type === 'job_update' && (
          <CheckCircle size={16} className="text-lumina-pulse" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-lumina-text truncate">
          {entry.title}
        </div>
        {entry.amount !== undefined && (
          <div
            className={clsx(
              'text-xs font-medium',
              entry.amount >= 0 ? 'text-lumina-success' : 'text-lumina-error',
            )}
          >
            {entry.amount >= 0 ? '+' : ''}${entry.amount.toFixed(2)}
          </div>
        )}
        <div className="text-xs text-lumina-dim mt-1">{timeStr}</div>
      </div>
    </div>
  )
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Calculate consecutive winning trades from the end of the list
 */
function calculateWinningStreak(trades: MT5Trade[]): number {
  if (!trades || trades.length === 0) return 0

  let streak = 0
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].profit > 0) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/**
 * Format minutes ago to human-readable string
 */
function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
