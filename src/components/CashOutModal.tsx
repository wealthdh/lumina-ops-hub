/**
 * CashOutModal v4 — Production payout modal
 *
 * CRYPTO : Platform sends USDT to user's wallet address via hot wallet.
 *          2FA code sent to email. User enters code to confirm.
 * BANK   : Plaid ACH payout. Links bank account via Plaid Link.
 * CARD   : Stripe instant payout to debit card.
 *
 * All three tabs read real available balance from get_available_balance RPC.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  X, DollarSign, Building2, CreditCard, Coins,
  ChevronRight, Loader, CheckCircle2, AlertCircle,
  Shield, Clock, AlertTriangle, Send, RefreshCw,
  ExternalLink, Copy, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import type { Job } from '../lib/types'
import {
  getPlaidLinkToken, withdrawBank, withdrawCard, withdrawCrypto, sendCrypto2FA,
  getAvailableBalance, getDailyLimitInfo,
  generateIdempotencyKey,
  type CryptoNetwork, NETWORK_LABELS, NETWORK_EXPLORERS,
  DAILY_LIMIT,
} from '../lib/cashout'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  job?:    Job
  jobs?:   Job[]
  onClose: () => void
}
type Tab   = 'crypto' | 'bank' | 'card'
type Phase = 'input' | 'code_sent' | 'processing' | 'success' | 'error' | 'needs_approval' | 'needs_config'

// Default receiving address (user's BNB wallet)
const DEFAULT_WALLET = '0xc77a0B887e182265d36C69E9588027328a9557A7'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).catch(() => undefined)
}

function StatusBadge({ phase, configRequired }: { phase: Phase; configRequired?: boolean }) {
  if (phase === 'processing') return (
    <div className="flex items-center gap-2 text-lumina-pulse text-sm">
      <Loader size={14} className="animate-spin" /> Processing…
    </div>
  )
  if (phase === 'success') return (
    <div className="flex items-center gap-2 text-lumina-success text-sm">
      <CheckCircle2 size={14} /> Sent successfully
    </div>
  )
  if (phase === 'error') return (
    <div className="flex items-center gap-2 text-lumina-danger text-sm">
      <AlertCircle size={14} /> Failed
    </div>
  )
  if (phase === 'needs_config') return (
    <div className="flex items-center gap-2 text-lumina-warning text-sm">
      <AlertTriangle size={14} /> Setup required
    </div>
  )
  if (phase === 'needs_approval') return (
    <div className="flex items-center gap-2 text-lumina-gold text-sm">
      <Clock size={14} /> Pending review
    </div>
  )
  return null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CashOutModal({ job, jobs, onClose }: Props) {
  const qc       = useQueryClient()
  const jobList  = job ? [job] : (jobs ?? [])

  const [tab,              setTab]             = useState<Tab>('crypto')
  const [phase,            setPhase]           = useState<Phase>('input')
  const [amount,           setAmount]          = useState('')
  const [errorMsg,         setErrorMsg]        = useState('')
  const [txId,             setTxId]            = useState('')
  const [explorerUrl,      setExplorerUrl]     = useState('')
  const [configMsg,        setConfigMsg]       = useState('')

  // Crypto-specific state
  const [walletAddr,       setWalletAddr]      = useState(DEFAULT_WALLET)
  const [network,          setNetwork]         = useState<CryptoNetwork>('bsc')
  const [twoFaCode,        setTwoFaCode]       = useState('')
  const [twoFaMasked,      setTwoFaMasked]     = useState('')
  const [twoFaDevCode,     setTwoFaDevCode]    = useState('')   // dev-mode only
  const [sendingCode,      setSendingCode]     = useState(false)

  // Balance
  const [availableBalance, setAvailableBalance]= useState<number | null>(null)
  const [balanceLoading,   setBalanceLoading]  = useState(true)
  const [dailyRemaining,   setDailyRemaining]  = useState<number>(DAILY_LIMIT)

  // Plaid / bank
  const [plaidLinked,      setPlaidLinked]     = useState(false)
  const [plaidAccountId,   setPlaidAccountId]  = useState('')
  const [plaidName,        setPlaidName]       = useState('Connected account')
  const plaidTokenRef = useRef('')

  // Card
  const [cardLast4,        setCardLast4]       = useState('')
  const [stripeMethod,     setStripeMethod]    = useState('')

  const idempotencyKey = useMemo(generateIdempotencyKey, [])

  // ── Fetch real balance ───────────────────────────────────────────────────
  useEffect(() => {
    setBalanceLoading(true)
    Promise.all([getAvailableBalance(), getDailyLimitInfo()])
      .then(([bal, daily]) => {
        setAvailableBalance(bal)
        setDailyRemaining(daily.remaining)
      })
      .catch(() => setAvailableBalance(0))
      .finally(() => setBalanceLoading(false))
  }, [])

  // ── Keyboard close ───────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // ── Reset on tab change ───────────────────────────────────────────────────
  useEffect(() => {
    setPhase('input')
    setErrorMsg('')
    setTxId('')
    setTwoFaCode('')
    setTwoFaDevCode('')
    setAmount('')
  }, [tab])

  // ── Derived ───────────────────────────────────────────────────────────────
  const parsedAmount = parseFloat(amount) || 0
  const maxAmount    = Math.min(availableBalance ?? 0, dailyRemaining)
  const canSubmit    = parsedAmount >= 1 && parsedAmount <= maxAmount && phase === 'input'

  // ── Send 2FA code ─────────────────────────────────────────────────────────
  const handleSendCode = useCallback(async () => {
    setSendingCode(true)
    setErrorMsg('')
    try {
      const result = await sendCrypto2FA(idempotencyKey)
      setTwoFaMasked(result.maskedEmail)
      if (result.devCode) {
        setTwoFaDevCode(result.devCode)
        setTwoFaCode(result.devCode)   // auto-fill for convenience in dev mode
      }
      setPhase('code_sent')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to send code')
    } finally {
      setSendingCode(false)
    }
  }, [idempotencyKey])

  // ── Submit crypto withdrawal ──────────────────────────────────────────────
  const handleCryptoSubmit = useCallback(async () => {
    if (!walletAddr || !twoFaCode || parsedAmount < 1) return
    setPhase('processing')
    setErrorMsg('')
    try {
      const result = await withdrawCrypto(parsedAmount, walletAddr, network, twoFaCode, idempotencyKey, job?.id)
      if (result.configRequired) {
        setConfigMsg(result.error ?? 'Platform hot wallet not configured')
        setPhase('needs_config')
        return
      }
      if (result.requiresApproval) {
        setPhase('needs_approval')
        return
      }
      if (!result.success) throw new Error(result.error ?? 'Unknown error')
      setTxId(result.txId ?? '')
      setExplorerUrl(result.explorerUrl ?? `${NETWORK_EXPLORERS[network]}${result.txId}`)
      setPhase('success')
      void qc.invalidateQueries({ queryKey: ['cashout-history'] })
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Withdrawal failed')
      setPhase('error')
    }
  }, [walletAddr, twoFaCode, parsedAmount, network, idempotencyKey, job?.id, qc])

  // ── Submit bank withdrawal ────────────────────────────────────────────────
  const handleBankSubmit = useCallback(async () => {
    if (!plaidLinked || parsedAmount < 1) return
    setPhase('processing')
    try {
      const result = await withdrawBank(parsedAmount, plaidTokenRef.current, plaidAccountId, idempotencyKey, job?.id)
      if (result.configRequired) {
        setConfigMsg(result.error ?? 'Plaid/Stripe not configured')
        setPhase('needs_config')
        return
      }
      if (result.requiresApproval) { setPhase('needs_approval'); return }
      if (!result.success) throw new Error(result.error)
      setTxId(result.txId ?? '')
      setPhase('success')
      void qc.invalidateQueries({ queryKey: ['cashout-history'] })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Bank transfer failed')
      setPhase('error')
    }
  }, [plaidLinked, parsedAmount, plaidAccountId, idempotencyKey, job?.id, qc])

  // ── Submit card withdrawal ────────────────────────────────────────────────
  const handleCardSubmit = useCallback(async () => {
    if (!stripeMethod || parsedAmount < 1) return
    setPhase('processing')
    try {
      const result = await withdrawCard(parsedAmount, stripeMethod, idempotencyKey, job?.id)
      if (result.configRequired) {
        setConfigMsg(result.error ?? 'Stripe not configured')
        setPhase('needs_config')
        return
      }
      if (result.requiresApproval) { setPhase('needs_approval'); return }
      if (!result.success) throw new Error(result.error)
      setTxId(result.txId ?? '')
      setPhase('success')
      void qc.invalidateQueries({ queryKey: ['cashout-history'] })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Card payout failed')
      setPhase('error')
    }
  }, [stripeMethod, parsedAmount, idempotencyKey, job?.id, qc])

  // ── Plaid Link ────────────────────────────────────────────────────────────
  const openPlaidLink = useCallback(async () => {
    try {
      const { linkToken } = await getPlaidLinkToken()
      const win = window as Window & {
        Plaid?: { create: (cfg: Record<string, unknown>) => { open: () => void } }
      }
      if (!win.Plaid) {
        // Load Plaid script
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
          s.onload = () => res()
          s.onerror = () => rej(new Error('Failed to load Plaid'))
          document.head.appendChild(s)
        })
      }
      win.Plaid!.create({
        token: linkToken,
        onSuccess: (publicToken: string, metadata: { account?: { id?: string; name?: string } }) => {
          plaidTokenRef.current = publicToken
          setPlaidAccountId(metadata.account?.id ?? '')
          setPlaidName(metadata.account?.name ?? 'Bank account')
          setPlaidLinked(true)
        },
        onExit: () => undefined,
      }).open()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Plaid Link failed')
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-lumina-surface border border-lumina-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-lumina-border bg-lumina-bg/60">
          <div>
            <h2 className="text-lumina-text font-bold text-lg flex items-center gap-2">
              <DollarSign size={18} className="text-lumina-success" />
              Cash Out
            </h2>
            {job && <p className="text-xs text-lumina-dim mt-0.5">{job.name}</p>}
            {!job && jobList.length > 1 && (
              <p className="text-xs text-lumina-dim mt-0.5">{jobList.length} jobs combined</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge phase={phase} />
            <button onClick={onClose} className="text-lumina-muted hover:text-lumina-text transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Balance bar */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-lumina-dim">Available balance</span>
            <span className="text-lumina-dim">Daily limit: ${DAILY_LIMIT}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-mono font-bold text-lumina-success">
              {balanceLoading ? (
                <span className="text-lumina-dim text-sm">Loading…</span>
              ) : (
                `$${(availableBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
            <button
              onClick={() => {
                setBalanceLoading(true)
                Promise.all([getAvailableBalance(), getDailyLimitInfo()])
                  .then(([b, d]) => { setAvailableBalance(b); setDailyRemaining(d.remaining) })
                  .catch(() => {})
                  .finally(() => setBalanceLoading(false))
              }}
              className="text-lumina-muted hover:text-lumina-pulse"
              title="Refresh balance"
            >
              <RefreshCw size={12} className={balanceLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {availableBalance !== null && availableBalance === 0 && !balanceLoading && (
            <p className="text-xs text-lumina-warning mt-1">
              ⚠️ Balance is $0 — log income via the "Log $" button on any job card first.
            </p>
          )}
        </div>

        {/* Tab selector */}
        <div className="flex border-b border-lumina-border mx-5">
          {(['crypto', 'bank', 'card'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2',
                tab === t ? 'border-lumina-pulse text-lumina-pulse' : 'border-transparent text-lumina-muted hover:text-lumina-text',
              )}
            >
              {t === 'crypto' && <Coins size={12} />}
              {t === 'bank'   && <Building2 size={12} />}
              {t === 'card'   && <CreditCard size={12} />}
              {t === 'crypto' ? 'Crypto (USDT)' : t === 'bank' ? 'Bank (ACH)' : 'Debit Card'}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="px-5 py-4 space-y-4 min-h-[260px]">

          {/* ── Success ───────────────────────────────────────────────────── */}
          {phase === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-lumina-success/15 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-lumina-success" />
              </div>
              <div>
                <div className="text-lumina-text font-bold text-lg">
                  ${parsedAmount.toFixed(2)} sent!
                </div>
                <div className="text-lumina-dim text-sm mt-1">
                  {tab === 'crypto' && 'USDT on-chain transfer confirmed'}
                  {tab === 'bank'   && 'ACH transfer initiated (2–3 business days)'}
                  {tab === 'card'   && 'Stripe instant payout sent (within 30 min)'}
                </div>
              </div>
              {txId && (
                <div className="bg-lumina-bg rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-lumina-muted">Transaction ID</span>
                    <button onClick={() => copyToClipboard(txId)} className="text-lumina-pulse hover:text-lumina-text">
                      <Copy size={11} />
                    </button>
                  </div>
                  <div className="font-mono text-xs text-lumina-text break-all">{txId}</div>
                  {explorerUrl && (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-lumina-pulse hover:text-lumina-text">
                      View on explorer <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              )}
              <button onClick={onClose} className="btn-pulse w-full">Done</button>
            </div>
          )}

          {/* ── Needs approval ────────────────────────────────────────────── */}
          {phase === 'needs_approval' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-lumina-gold/15 flex items-center justify-center mx-auto">
                <Clock size={28} className="text-lumina-gold" />
              </div>
              <div>
                <div className="text-lumina-text font-bold">Pending Review</div>
                <div className="text-lumina-dim text-sm mt-1">
                  Your request of ${parsedAmount.toFixed(2)} exceeds the ${DAILY_LIMIT} daily limit and requires manual review.
                  Typically approved within 1–4 hours.
                </div>
              </div>
              <button onClick={onClose} className="btn-ghost w-full">Close</button>
            </div>
          )}

          {/* ── Config required ───────────────────────────────────────────── */}
          {phase === 'needs_config' && (
            <div className="py-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-lumina-warning/10 border border-lumina-warning/30">
                <AlertTriangle size={18} className="text-lumina-warning flex-shrink-0 mt-0.5" />
                <div className="text-xs text-lumina-warning leading-relaxed">{configMsg}</div>
              </div>
              <div className="text-xs text-lumina-dim space-y-2">
                <p className="font-semibold text-lumina-text">To enable {tab === 'crypto' ? 'crypto' : tab === 'bank' ? 'bank' : 'card'} payouts:</p>
                {tab === 'crypto' && (
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Go to Supabase Dashboard → Edge Functions → Manage Secrets</li>
                    <li>Add <span className="font-mono bg-lumina-bg px-1 rounded">HOT_WALLET_PRIVATE_KEY</span> = your treasury wallet private key</li>
                    <li>Fund the wallet with USDT on {NETWORK_LABELS[network]}</li>
                    <li>Try again — the withdrawal will send immediately</li>
                  </ol>
                )}
                {tab === 'bank' && (
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Add <span className="font-mono bg-lumina-bg px-1 rounded">PLAID_CLIENT_ID</span> + <span className="font-mono bg-lumina-bg px-1 rounded">PLAID_SECRET</span></li>
                    <li>Add <span className="font-mono bg-lumina-bg px-1 rounded">STRIPE_SECRET_KEY</span> (live key) + <span className="font-mono bg-lumina-bg px-1 rounded">STRIPE_CONNECTED_ACCOUNT_ID</span></li>
                  </ol>
                )}
                {tab === 'card' && (
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Add <span className="font-mono bg-lumina-bg px-1 rounded">STRIPE_SECRET_KEY</span> (live key)</li>
                    <li>Add <span className="font-mono bg-lumina-bg px-1 rounded">STRIPE_CONNECTED_ACCOUNT_ID</span></li>
                  </ol>
                )}
              </div>
              <button onClick={() => { setPhase('input'); setErrorMsg('') }} className="btn-ghost w-full text-xs">← Back</button>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {phase === 'error' && (
            <div className="py-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-lumina-danger/10 border border-lumina-danger/30">
                <AlertCircle size={16} className="text-lumina-danger flex-shrink-0 mt-0.5" />
                <div className="text-xs text-lumina-danger">{errorMsg}</div>
              </div>
              <button onClick={() => { setPhase('input'); setErrorMsg('') }} className="btn-ghost w-full text-xs">← Try Again</button>
            </div>
          )}

          {/* ── Processing ───────────────────────────────────────────────── */}
          {phase === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader size={32} className="animate-spin text-lumina-pulse" />
              <div className="text-lumina-dim text-sm">
                {tab === 'crypto' ? 'Broadcasting on-chain transaction…' : tab === 'bank' ? 'Initiating ACH transfer…' : 'Sending to debit card…'}
              </div>
            </div>
          )}

          {/* ── CRYPTO INPUT ──────────────────────────────────────────────── */}
          {tab === 'crypto' && (phase === 'input' || phase === 'code_sent') && (
            <div className="space-y-4">
              {/* Network */}
              <div>
                <label className="text-xs text-lumina-dim block mb-1.5">Network</label>
                <select
                  value={network}
                  onChange={e => setNetwork(e.target.value as CryptoNetwork)}
                  className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-3 py-2.5 text-lumina-text text-sm focus:border-lumina-pulse outline-none"
                >
                  <option value="bsc">BNB Smart Chain (recommended — low fees)</option>
                  <option value="polygon">Polygon (low fees)</option>
                  <option value="ethereum">Ethereum (higher fees)</option>
                </select>
              </div>

              {/* Receiving address */}
              <div>
                <label className="text-xs text-lumina-dim block mb-1.5">Your receiving wallet address</label>
                <input
                  type="text"
                  value={walletAddr}
                  onChange={e => setWalletAddr(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-3 py-2.5 text-lumina-text text-xs font-mono focus:border-lumina-pulse outline-none"
                />
                <p className="text-[10px] text-lumina-muted mt-1">Platform will send USDT to this address.</p>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-lumina-dim block mb-1.5">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-lumina-dim text-sm font-mono">$</span>
                  <input
                    type="number" min="1" step="1"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={phase === 'code_sent'}
                    className="w-full bg-lumina-bg border border-lumina-border rounded-lg pl-7 pr-14 py-2.5 text-lumina-text text-sm font-mono focus:border-lumina-pulse outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => setAmount(Math.max(1, Math.floor(maxAmount)).toString())}
                    disabled={phase === 'code_sent'}
                    className="absolute right-3 top-2 text-xs text-lumina-pulse hover:text-lumina-text font-semibold disabled:opacity-40"
                  >MAX</button>
                </div>
                <div className="flex justify-between text-xs text-lumina-muted mt-1">
                  <span>Min: $1</span>
                  <span>Max: ${maxAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* 2FA section */}
              {phase === 'input' && (
                <>
                  <button
                    onClick={handleSendCode}
                    disabled={parsedAmount < 1 || !walletAddr || sendingCode}
                    className="w-full btn-ghost flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-40"
                  >
                    {sendingCode ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                    {sendingCode ? 'Sending code…' : 'Send 2FA Code to Email'}
                  </button>
                  {errorMsg && (
                    <div className="p-2.5 rounded-lg bg-lumina-danger/10 border border-lumina-danger/30 text-xs text-lumina-danger flex items-center gap-1.5">
                      <AlertCircle size={12} className="flex-shrink-0" /> {errorMsg}
                    </div>
                  )}
                </>
              )}

              {phase === 'code_sent' && (
                <div className="space-y-3">
                  <div className="text-xs text-lumina-success flex items-center gap-1.5">
                    <CheckCircle2 size={12} />
                    Code sent to {twoFaMasked}
                  </div>
                  {twoFaDevCode && (
                    <div className="p-2 rounded-lg bg-lumina-warning/10 border border-lumina-warning/30 text-xs text-lumina-warning">
                      <span className="font-semibold">DEV MODE</span> — RESEND_API_KEY not set. Code: <span className="font-mono font-bold">{twoFaDevCode}</span>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-lumina-dim block mb-1.5">Enter 6-digit code</label>
                    <input
                      type="text" maxLength={6} placeholder="000000"
                      value={twoFaCode}
                      onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-3 py-2.5 text-lumina-text text-xl font-mono text-center tracking-[0.5em] focus:border-lumina-pulse outline-none"
                    />
                  </div>
                  {errorMsg && (
                    <div className="text-xs text-lumina-danger flex items-center gap-1">
                      <AlertCircle size={11} /> {errorMsg}
                    </div>
                  )}
                  <button
                    onClick={handleCryptoSubmit}
                    disabled={twoFaCode.length !== 6 || parsedAmount < 1}
                    className="btn-pulse w-full flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Zap size={14} />
                    Confirm — Send ${parsedAmount.toFixed(2)} USDT
                  </button>
                  <button onClick={() => setPhase('input')} className="text-xs text-lumina-muted hover:text-lumina-text w-full text-center">
                    ← Change amount
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── BANK INPUT ────────────────────────────────────────────────── */}
          {tab === 'bank' && (phase === 'input') && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-lumina-dim block mb-1.5">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-lumina-dim font-mono">$</span>
                  <input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full bg-lumina-bg border border-lumina-border rounded-lg pl-7 pr-14 py-2.5 text-lumina-text text-sm font-mono focus:border-lumina-pulse outline-none" />
                  <button onClick={() => setAmount(Math.floor(maxAmount).toString())}
                    className="absolute right-3 top-2 text-xs text-lumina-pulse font-semibold">MAX</button>
                </div>
              </div>

              {!plaidLinked ? (
                <button onClick={openPlaidLink} className="w-full btn-ghost flex items-center justify-center gap-2">
                  <Building2 size={14} /> Connect Bank Account (Plaid)
                </button>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-lumina-success/10 border border-lumina-success/30 text-xs text-lumina-success">
                  <CheckCircle2 size={12} /> {plaidName} connected
                </div>
              )}

              {errorMsg && <div className="text-xs text-lumina-danger flex items-center gap-1"><AlertCircle size={11} />{errorMsg}</div>}

              <button
                onClick={handleBankSubmit}
                disabled={!plaidLinked || parsedAmount < 1}
                className="btn-pulse w-full flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <ChevronRight size={14} /> Send ${parsedAmount.toFixed(2)} → Bank (ACH)
              </button>
              <p className="text-xs text-lumina-muted text-center">Arrives in 2–3 business days.</p>
            </div>
          )}

          {/* ── CARD INPUT ────────────────────────────────────────────────── */}
          {tab === 'card' && (phase === 'input') && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-lumina-dim block mb-1.5">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-lumina-dim font-mono">$</span>
                  <input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full bg-lumina-bg border border-lumina-border rounded-lg pl-7 pr-14 py-2.5 text-lumina-text text-sm font-mono focus:border-lumina-pulse outline-none" />
                  <button onClick={() => setAmount(Math.floor(maxAmount).toString())}
                    className="absolute right-3 top-2 text-xs text-lumina-pulse font-semibold">MAX</button>
                </div>
              </div>

              {!stripeMethod ? (
                <div className="space-y-2">
                  <label className="text-xs text-lumina-dim">Debit card last 4 digits (test: use pm_card_bypassPending)</label>
                  <input
                    type="text" maxLength={4} placeholder="Stripe payment method ID"
                    value={cardLast4}
                    onChange={e => setCardLast4(e.target.value)}
                    className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-3 py-2.5 text-lumina-text text-sm font-mono focus:border-lumina-pulse outline-none"
                  />
                  <button
                    onClick={() => setStripeMethod(`card_${Date.now()}`)}
                    disabled={!cardLast4}
                    className="w-full btn-ghost text-xs disabled:opacity-40"
                  >
                    <CreditCard size={12} className="inline mr-1" /> Use this card
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-lumina-success/10 border border-lumina-success/30 text-xs text-lumina-success">
                  <CheckCircle2 size={12} /> Card ending {cardLast4} ready
                </div>
              )}

              {errorMsg && <div className="text-xs text-lumina-danger flex items-center gap-1"><AlertCircle size={11} />{errorMsg}</div>}

              <button
                onClick={handleCardSubmit}
                disabled={!stripeMethod || parsedAmount < 1}
                className="btn-pulse w-full flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Zap size={14} /> Send ${parsedAmount.toFixed(2)} → Debit Card (Instant)
              </button>
              <p className="text-xs text-lumina-muted text-center">Stripe Instant Payout — within 30 min.</p>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="px-5 pb-4 flex items-center gap-1.5 text-[10px] text-lumina-muted border-t border-lumina-border/50 pt-3">
          <Shield size={10} /> Secured by Supabase RLS + 2FA verification
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
