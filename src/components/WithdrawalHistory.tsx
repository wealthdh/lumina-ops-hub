/**
 * WithdrawalHistory — Real transaction history from Supabase + BSCScan
 *
 * Shows all cash-out transactions from cashout_transactions table,
 * with live status from on-chain BSCScan for crypto txns.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ExternalLink, CheckCircle2, Clock, XCircle, RefreshCw, DollarSign, Wallet, Building2, CreditCard, Filter, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import clsx from 'clsx'

interface TxRecord {
  id:         string
  method:     'crypto' | 'bank' | 'card'
  amount:     number
  status:     'completed' | 'processing' | 'failed' | 'needs_approval' | 'pending'
  txId:       string | null
  network:    string | null
  toAddress:  string | null
  token:      string | null
  jobId:      string | null
  createdAt:  string
}

function useWithdrawalHistory() {
  return useQuery<TxRecord[]>({
    queryKey: ['cashout-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .from('cashout_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      const dbRows: TxRecord[] = []
      if (!error && data) {
        dbRows.push(...data.map((r: Record<string, unknown>): TxRecord => ({
          id:        String(r.id ?? ''),
          method:    (r.method as TxRecord['method']) ?? 'crypto',
          amount:    Number(r.amount ?? 0),
          status:    (r.status as TxRecord['status']) ?? 'pending',
          txId:      r.tx_id      ? String(r.tx_id)      : null,
          network:   r.network    ? String(r.network)    : null,
          toAddress: r.to_address ? String(r.to_address) : null,
          token:     r.token      ? String(r.token)      : null,
          jobId:     r.job_id     ? String(r.job_id)     : null,
          createdAt: String(r.created_at ?? ''),
        })))
      }

      // All withdrawals now go directly to Supabase cashout_transactions
      // (RLS INSERT policy enabled — no localStorage fallback needed)

      return dbRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    placeholderData: [],
    staleTime: 30_000,
  })
}

const METHOD_ICON = {
  crypto: <Wallet    size={12} className="text-orange-400" />,
  bank:   <Building2 size={12} className="text-blue-400"   />,
  card:   <CreditCard size={12} className="text-purple-400"/>,
}

const STATUS_CONFIG = {
  completed:      { label: 'Sent',      color: 'text-lumina-success', icon: <CheckCircle2 size={11} className="text-lumina-success" /> },
  processing:     { label: 'Processing',color: 'text-lumina-gold',    icon: <Clock size={11} className="text-lumina-gold animate-pulse" /> },
  pending:        { label: 'Pending',   color: 'text-lumina-dim',     icon: <Clock size={11} className="text-lumina-dim" /> },
  needs_approval: { label: 'Review',    color: 'text-lumina-warning', icon: <Clock size={11} className="text-lumina-warning" /> },
  failed:         { label: 'Failed',    color: 'text-lumina-danger',  icon: <XCircle size={11} className="text-lumina-danger" /> },
}

const EXPLORER: Record<string, string> = {
  bsc:      'https://bscscan.com/tx/',
  ethereum: 'https://etherscan.io/tx/',
  polygon:  'https://polygonscan.com/tx/',
  solana:   'https://solscan.io/tx/',
}

const NETWORK_LABEL: Record<string, string> = {
  bsc:      'BNB Smart Chain',
  ethereum: 'Ethereum',
  polygon:  'Polygon',
  solana:   'Solana',
}

const STATUS_STEPS: Record<string, string[]> = {
  pending:        ['Request Submitted', 'Under Review', 'Processing', 'Completed'],
  processing:     ['Request Submitted', 'Under Review', 'Processing', 'Completed'],
  completed:      ['Request Submitted', 'Under Review', 'Processing', 'Completed'],
  needs_approval: ['Request Submitted', 'Under Review', 'Processing', 'Completed'],
  failed:         ['Request Submitted', 'Failed'],
}

const STATUS_STEP_INDEX: Record<string, number> = {
  pending:        1,
  needs_approval: 1,
  processing:     2,
  completed:      3,
  failed:         1,
}

export default function WithdrawalHistory() {
  const { data: txs = [], isLoading, refetch } = useWithdrawalHistory()
  const [filter,   setFilter]   = useState<'all' | 'crypto' | 'bank' | 'card'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = filter === 'all' ? txs : txs.filter(t => t.method === filter)
  const totalSent = txs.filter(t => t.status === 'completed').reduce((s, t) => s + t.amount, 0)

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="card-glow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-lumina-pulse/10 border border-lumina-pulse/30 flex items-center justify-center">
            <DollarSign size={14} className="text-lumina-pulse" />
          </div>
          <div>
            <div className="text-lumina-text font-semibold text-sm">Withdrawal History</div>
            <div className="text-[10px] text-lumina-dim">
              Total sent: <span className="text-lumina-success font-mono">${totalSent.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <button onClick={() => void refetch()} disabled={isLoading}
          className="text-lumina-dim hover:text-lumina-pulse transition-colors p-1">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {(['all', 'crypto', 'bank', 'card'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('text-[10px] px-2.5 py-1 rounded-full border capitalize transition-all',
              filter === f
                ? 'bg-lumina-pulse text-lumina-bg border-lumina-pulse'
                : 'border-lumina-border text-lumina-dim hover:border-lumina-pulse/40')}>
            <Filter size={8} className="inline mr-1" />
            {f}
          </button>
        ))}
      </div>

      {isLoading && txs.length === 0 ? (
        <div className="text-center py-6 text-lumina-dim text-xs">Loading transactions…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-lumina-muted text-xs">No withdrawals yet</div>
          <div className="text-[10px] text-lumina-muted mt-1">Cash out from any job card to see history here</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => {
            const sc          = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.pending
            const explorerUrl = tx.txId && tx.network ? `${EXPLORER[tx.network] ?? EXPLORER.bsc}${tx.txId}` : null
            const isOpen      = expanded === tx.id
            const steps       = STATUS_STEPS[tx.status] ?? STATUS_STEPS.pending
            const stepIdx     = STATUS_STEP_INDEX[tx.status] ?? 0

            return (
              <div key={tx.id}
                className={clsx(
                  'border rounded-xl transition-all cursor-pointer',
                  isOpen
                    ? 'bg-lumina-bg border-lumina-pulse/40'
                    : 'bg-lumina-bg/50 border-lumina-border/60 hover:border-lumina-border',
                )}
                onClick={() => setExpanded(isOpen ? null : tx.id)}
              >
                {/* ── Row summary ─────────────────────────────────────────────── */}
                <div className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-full bg-lumina-bg border border-lumina-border flex items-center justify-center flex-shrink-0">
                    {METHOD_ICON[tx.method]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lumina-text font-mono font-semibold text-sm">
                        -${tx.amount.toLocaleString()}
                      </span>
                      {tx.token && (
                        <span className="text-[10px] text-lumina-dim font-mono">via {tx.token}</span>
                      )}
                      <span className={clsx('ml-auto flex items-center gap-1 text-[10px] font-semibold', sc.color)}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-lumina-muted flex items-center gap-2 mt-0.5">
                      <span>{fmt(tx.createdAt)}</span>
                      {tx.network && <span className="capitalize">· {NETWORK_LABEL[tx.network] ?? tx.network}</span>}
                      {tx.toAddress && (
                        <span className="font-mono">· to {tx.toAddress.slice(0,6)}…{tx.toAddress.slice(-4)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {explorerUrl && !isOpen && (
                      <a href={explorerUrl} target="_blank" rel="noreferrer"
                        className="text-lumina-dim hover:text-lumina-pulse"
                        title="View on explorer"
                        onClick={e => e.stopPropagation()}>
                        <ExternalLink size={11} />
                      </a>
                    )}
                    {isOpen ? <ChevronUp size={12} className="text-lumina-pulse" /> : <ChevronDown size={12} className="text-lumina-dim" />}
                  </div>
                </div>

                {/* ── Expanded tracking panel ──────────────────────────────────── */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 border-t border-lumina-border/50 pt-3">

                    {/* Progress stepper */}
                    <div>
                      <div className="text-[10px] text-lumina-dim mb-2 font-semibold uppercase tracking-wide">Status Tracker</div>
                      <div className="flex items-center gap-1">
                        {steps.map((step, i) => (
                          <div key={step} className="flex items-center gap-1 flex-1">
                            <div className={clsx(
                              'flex-1 h-1 rounded-full transition-all',
                              i <= stepIdx
                                ? tx.status === 'failed' ? 'bg-lumina-danger' : 'bg-lumina-success'
                                : 'bg-lumina-border',
                            )} />
                            {i === steps.length - 1 && (
                              <div className={clsx(
                                'w-2 h-2 rounded-full flex-shrink-0',
                                i <= stepIdx
                                  ? tx.status === 'failed' ? 'bg-lumina-danger' : 'bg-lumina-success'
                                  : 'bg-lumina-border',
                              )} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1">
                        {steps.map((step, i) => (
                          <span key={step} className={clsx(
                            'text-[9px] text-center',
                            i === stepIdx ? (tx.status === 'failed' ? 'text-lumina-danger font-semibold' : 'text-lumina-success font-semibold')
                              : i < stepIdx ? 'text-lumina-dim' : 'text-lumina-muted',
                          )}>{step}</span>
                        ))}
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-lumina-bg rounded-lg p-2">
                        <div className="text-lumina-muted mb-0.5">Amount</div>
                        <div className="text-lumina-text font-mono font-semibold">${tx.amount.toLocaleString()}</div>
                      </div>
                      <div className="bg-lumina-bg rounded-lg p-2">
                        <div className="text-lumina-muted mb-0.5">Method</div>
                        <div className="text-lumina-text font-mono capitalize">{tx.method}</div>
                      </div>
                      {tx.network && (
                        <div className="bg-lumina-bg rounded-lg p-2">
                          <div className="text-lumina-muted mb-0.5">Network</div>
                          <div className="text-lumina-text font-mono">{NETWORK_LABEL[tx.network] ?? tx.network}</div>
                        </div>
                      )}
                      <div className="bg-lumina-bg rounded-lg p-2">
                        <div className="text-lumina-muted mb-0.5">Date</div>
                        <div className="text-lumina-text font-mono">{fmt(tx.createdAt)}</div>
                      </div>
                    </div>

                    {/* To address */}
                    {tx.toAddress && (
                      <div className="bg-lumina-bg rounded-lg p-2">
                        <div className="text-lumina-muted text-[9px] mb-1">Recipient Address</div>
                        <div className="flex items-center gap-2">
                          <span className="text-lumina-text font-mono text-[10px] flex-1 truncate">{tx.toAddress}</span>
                          <button onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(tx.toAddress ?? '') }}
                            className="text-lumina-dim hover:text-lumina-pulse flex-shrink-0" title="Copy address">
                            <Copy size={10} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TX hash */}
                    {tx.txId && (
                      <div className="bg-lumina-bg rounded-lg p-2">
                        <div className="text-lumina-muted text-[9px] mb-1">
                          {tx.txId.startsWith('req-') || tx.txId.length === 36 ? 'Request ID' : 'Transaction Hash'}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lumina-text font-mono text-[10px] flex-1 truncate">{tx.txId}</span>
                          <button onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(tx.txId ?? '') }}
                            className="text-lumina-dim hover:text-lumina-pulse flex-shrink-0" title="Copy">
                            <Copy size={10} />
                          </button>
                          {explorerUrl && (
                            <a href={explorerUrl} target="_blank" rel="noreferrer"
                              className="text-lumina-dim hover:text-lumina-pulse flex-shrink-0"
                              onClick={e => e.stopPropagation()}>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Explorer button for completed txns */}
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 text-[10px] text-lumina-pulse hover:text-lumina-text transition-colors py-1.5 border border-lumina-pulse/30 rounded-lg hover:bg-lumina-pulse/5"
                        onClick={e => e.stopPropagation()}>
                        <ExternalLink size={10} />
                        View on {NETWORK_LABEL[tx.network ?? ''] ?? 'Block Explorer'}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
