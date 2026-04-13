/**
 * TransactionHistory — full-page tab showing all cashout_transactions.
 * Real-time via Supabase subscription (useTransactionHistory hook).
 */
import { useState } from 'react'
import {
  Building2, CreditCard, Coins, ExternalLink,
  Copy, RefreshCw, Clock, CheckCircle2, AlertCircle,
  Loader, Filter, DollarSign, TrendingUp, Shield,
} from 'lucide-react'
import clsx from 'clsx'
import { useTransactionHistory, useDailyLimitInfo, useCashoutStats } from '../hooks/useCashout'
import { usePendingApprovals }                                        from '../hooks/useCashout'
import { NETWORK_EXPLORERS, DAILY_LIMIT, CRYPTO_DAILY_CAP }          from '../lib/cashout'
import type { CashoutTransaction, WithdrawMethod }                    from '../lib/cashout'
import type { CryptoNetwork }                                         from '../lib/cashout'

// ─── Config ───────────────────────────────────────────────────────────────────

const METHOD_CONFIG: Record<WithdrawMethod, { label: string; icon: React.ReactNode; color: string }> = {
  bank:   { label: 'Bank ACH',   icon: <Building2  size={13} />, color: 'text-blue-400' },
  card:   { label: 'Debit Card', icon: <CreditCard size={13} />, color: 'text-lumina-pulse' },
  crypto: { label: 'Crypto',     icon: <Coins      size={13} />, color: 'text-purple-400' },
}

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
  pending:          { label: 'Pending',     classes: 'badge bg-lumina-gold/20 text-lumina-gold',          icon: <Clock        size={10} /> },
  processing:       { label: 'Processing',  classes: 'badge bg-lumina-pulse/20 text-lumina-pulse',         icon: <Loader       size={10} className="animate-spin" /> },
  completed:        { label: 'Completed',   classes: 'badge-success',                                      icon: <CheckCircle2 size={10} /> },
  failed:           { label: 'Failed',      classes: 'badge-danger',                                       icon: <AlertCircle  size={10} /> },
  needs_approval:   { label: 'In Review',   classes: 'badge bg-lumina-warning/20 text-lumina-warning',     icon: <Shield       size={10} /> },
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent = 'text-lumina-pulse' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="card-glow flex items-center gap-3 p-4">
      <div className={clsx('flex-shrink-0', accent)}>{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className={clsx('font-bold font-mono text-lg leading-tight', accent)}>{value}</div>
        {sub && <div className="text-xs text-lumina-dim font-mono">{sub}</div>}
      </div>
    </div>
  )
}

// ─── Single row ───────────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: CashoutTransaction }) {
  const method = METHOD_CONFIG[tx.method]
  const status = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG['pending']
  const date   = new Date(tx.createdAt)

  return (
    <tr className="border-t border-lumina-border/40 hover:bg-lumina-bg/30 transition-colors group">
      {/* Date */}
      <td className="py-3 pr-4 text-xs font-mono text-lumina-dim whitespace-nowrap">
        <div>{date.toLocaleDateString()}</div>
        <div className="text-lumina-muted">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </td>

      {/* Method */}
      <td className="py-3 pr-4">
        <div className={clsx('flex items-center gap-1.5 text-xs font-medium', method.color)}>
          {method.icon}
          {method.label}
        </div>
        {tx.network && (
          <div className="text-lumina-muted text-xs mt-0.5 capitalize">{tx.network}</div>
        )}
      </td>

      {/* Amount */}
      <td className="py-3 pr-4 text-right">
        <div className="font-mono font-bold text-sm text-lumina-success">
          ${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </td>

      {/* Status */}
      <td className="py-3 pr-4">
        <span className={clsx('badge flex items-center gap-1 w-fit', status.classes)}>
          {status.icon}
          {status.label}
        </span>
      </td>

      {/* TX Hash */}
      <td className="py-3 text-xs font-mono">
        {tx.txId ? (
          <div className="flex items-center gap-1.5">
            <span className="text-lumina-dim truncate max-w-[120px]" title={tx.txId}>
              {tx.txId.startsWith('0x')
                ? `${tx.txId.slice(0, 8)}…${tx.txId.slice(-6)}`
                : tx.txId.slice(0, 16) + '…'}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => navigator.clipboard.writeText(tx.txId ?? '')}
                className="text-lumina-dim hover:text-lumina-pulse transition-colors" title="Copy">
                <Copy size={11} />
              </button>
              {tx.method === 'crypto' && tx.network && (
                <a href={`${NETWORK_EXPLORERS[tx.network as CryptoNetwork]}${tx.txId}`}
                  target="_blank" rel="noreferrer"
                  className="text-lumina-dim hover:text-lumina-pulse transition-colors">
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        ) : (
          <span className="text-lumina-muted">—</span>
        )}
      </td>
    </tr>
  )
}

// ─── Approval queue widget ────────────────────────────────────────────────────

function ApprovalQueue() {
  const { data: approvals = [], isLoading } = usePendingApprovals()

  if (isLoading || approvals.length === 0) return null

  return (
    <div className="card-glow border-lumina-warning/30 bg-lumina-warning/5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-lumina-warning" />
        <h3 className="text-lumina-warning font-semibold text-sm">Pending Approvals ({approvals.length})</h3>
      </div>
      <div className="space-y-2">
        {approvals.map((a) => (
          <div key={a.id} className="flex items-center justify-between bg-lumina-bg rounded-lg p-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-lumina-dim font-mono">{METHOD_CONFIG[a.method].label}</span>
              <span className="font-mono font-bold text-lumina-success">${a.amount.toLocaleString()}</span>
              <span className="text-lumina-muted">{a.reason}</span>
            </div>
            <div className="flex items-center gap-2 text-lumina-dim">
              <Clock size={11} />
              <span>
                Expires {new Date(a.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type MethodFilter = 'all' | WithdrawMethod
type StatusFilter = 'all' | 'completed' | 'pending' | 'processing' | 'failed' | 'needs_approval'

export default function TransactionHistory() {
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { data: txns = [], isLoading, refetch, isFetching } = useTransactionHistory(100)
  const { data: daily }   = useDailyLimitInfo()
  const stats             = useCashoutStats()

  const filtered = txns.filter((t) => {
    if (methodFilter !== 'all' && t.method !== methodFilter) return false
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    return true
  })

  const dailyPct = daily ? Math.min(100, (daily.usedToday / daily.dailyLimit) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Cash Out History</h1>
          <p className="text-lumina-dim text-sm mt-0.5">All withdrawals - real-time via Supabase</p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign size={20} />}
          label="Total Withdrawn"
          value={`$${stats.totalWithdrawn.toLocaleString()}`}
          accent="text-lumina-success"
        />
        <StatCard
          icon={<Shield size={20} />}
          label="Daily Remaining"
          value={daily ? `$${daily.remaining.toFixed(0)}` : '—'}
          sub={`of $${DAILY_LIMIT} limit`}
          accent={dailyPct > 80 ? 'text-lumina-warning' : 'text-lumina-pulse'}
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Pending / In-Flight"
          value={String(stats.pendingCount)}
          accent="text-lumina-gold"
        />
        <StatCard
          icon={<Coins size={20} />}
          label="Crypto Daily"
          value={daily ? `$${daily.cryptoToday?.toFixed(0) ?? '0'}` : '—'}
          sub={`of $${CRYPTO_DAILY_CAP} cap`}
          accent="text-purple-400"
        />
      </div>

      {/* Daily limit bar */}
      {daily && (
        <div className="card flex items-center gap-4">
          <div className="text-xs text-lumina-dim w-24 flex-shrink-0">Daily limit</div>
          <div className="flex-1 bg-lumina-bg rounded-full h-2 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all',
                dailyPct > 80 ? 'bg-lumina-warning' : dailyPct > 50 ? 'bg-lumina-gold' : 'bg-lumina-success')}
              style={{ width: `${dailyPct}%` }}
            />
          </div>
          <div className="text-xs font-mono text-lumina-text w-28 text-right flex-shrink-0">
            ${daily.usedToday.toFixed(0)} / ${daily.dailyLimit}
          </div>
        </div>
      )}

      {/* Pending approvals */}
      <ApprovalQueue />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-lumina-dim">
          <Filter size={13} />
          <span className="text-xs">Filter:</span>
        </div>

        {/* Method filter */}
        <div className="flex gap-1">
          {(['all', 'bank', 'card', 'crypto'] as MethodFilter[]).map((f) => (
            <button key={f} onClick={() => setMethodFilter(f)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg border transition-all',
                methodFilter === f ? 'border-lumina-pulse bg-lumina-pulse/10 text-lumina-pulse'
                                   : 'border-lumina-border text-lumina-dim hover:border-lumina-pulse/40')}>
              {f === 'all' ? 'All Methods' : METHOD_CONFIG[f as WithdrawMethod].label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-lumina-border" />

        {/* Status filter */}
        <div className="flex gap-1">
          {(['all', 'completed', 'needs_approval', 'pending', 'failed'] as StatusFilter[]).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg border transition-all',
                statusFilter === f ? 'border-lumina-pulse bg-lumina-pulse/10 text-lumina-pulse'
                                   : 'border-lumina-border text-lumina-dim hover:border-lumina-pulse/40')}>
              {f === 'all' ? 'All Status' : STATUS_CONFIG[f]?.label ?? f}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-lumina-dim font-mono">
          {filtered.length} of {txns.length} transactions
        </div>
      </div>

      {/* Table */}
      <div className="card-glow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-lumina-dim">
            <Loader size={16} className="animate-spin text-lumina-pulse" />
            <span className="text-sm">Loading transactions…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp size={32} className="mx-auto text-lumina-muted mb-3" />
            <div className="text-lumina-dim text-sm">
              {txns.length === 0
                ? 'No withdrawals yet. Cash out your first job to get started.'
                : 'No transactions match the current filters.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-lumina-dim border-b border-lumina-border">
                  <th className="text-left pb-3 pr-4 font-medium">Date</th>
                  <th className="text-left pb-3 pr-4 font-medium">Method</th>
                  <th className="text-right pb-3 pr-4 font-medium">Amount</th>
                  <th className="text-left pb-3 pr-4 font-medium">Status</th>
                  <th className="text-left pb-3 font-medium">TX / Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => <TxRow key={tx.id} tx={tx} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
