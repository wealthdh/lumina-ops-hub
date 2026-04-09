/**
 * IncomeEntryModal — Log a real income entry for a job
 *
 * This is how you manually record actual earnings:
 * client payment received, consulting fee, affiliate commission, etc.
 * Stripe + MT5 income is logged automatically via webhooks/bridge.
 */
import { useState, useEffect, useCallback } from 'react'
import { X, DollarSign, Check, Loader, PlusCircle } from 'lucide-react'
import clsx from 'clsx'
import type { Job } from '../lib/types'
import { useLogIncome, type IncomeSource } from '../hooks/useIncomeEntries'

interface IncomeEntryModalProps {
  job:     Job
  onClose: () => void
}

const SOURCE_OPTIONS: { value: IncomeSource; label: string; hint: string }[] = [
  { value: 'manual',      label: 'Manual',       hint: 'Cash / check / wire transfer'        },
  { value: 'stripe',      label: 'Stripe',        hint: 'Client payment via Stripe'           },
  { value: 'consulting',  label: 'Consulting',    hint: 'Consulting fee or retainer'          },
  { value: 'affiliate',   label: 'Affiliate',     hint: 'Referral or affiliate commission'    },
  { value: 'crypto',      label: 'Crypto',        hint: 'BNB / ETH / USDT payment received'  },
  { value: 'polymarket',  label: 'Polymarket',    hint: 'Prediction market winnings'          },
  { value: 'mt5',         label: 'MT5 Trade',     hint: 'Closed trade profit from MT5'        },
]

export default function IncomeEntryModal({ job, onClose }: IncomeEntryModalProps) {
  const [amount,      setAmount]      = useState('')
  const [source,      setSource]      = useState<IncomeSource>('manual')
  const [sourceRef,   setSourceRef]   = useState('')
  const [description, setDescription] = useState('')
  const [earnedDate,  setEarnedDate]  = useState(new Date().toISOString().split('T')[0])
  const [done,        setDone]        = useState(false)

  const { mutateAsync: logIncome, isPending } = useLogIncome()

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return

    await logIncome({
      jobId:       job.id,
      amountUsd:   amt,
      source,
      sourceRef:   sourceRef.trim() || undefined,
      description: description.trim() || `${SOURCE_OPTIONS.find(s => s.value === source)?.label} income — ${job.name}`,
      earnedAt:    earnedDate,   // plain date string "YYYY-MM-DD" — entry_date is a DATE column
    })
    setDone(true)
    setTimeout(onClose, 1500)
  }, [amount, source, sourceRef, description, earnedDate, job, logIncome, onClose])

  const amtNum = parseFloat(amount) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-lumina-card border border-lumina-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-lumina-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-lumina-success/10 border border-lumina-success/30 flex items-center justify-center">
              <PlusCircle size={15} className="text-lumina-success" />
            </div>
            <div>
              <div className="text-lumina-text font-semibold text-sm">Log Real Income</div>
              <div className="text-lumina-dim text-xs">{job.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-lumina-muted hover:text-lumina-text transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-lumina-success/10 border border-lumina-success/30 flex items-center justify-center mb-4">
              <Check size={24} className="text-lumina-success" />
            </div>
            <div className="text-lumina-text font-semibold">Income Logged!</div>
            <div className="text-lumina-dim text-sm mt-1">
              +${amtNum.toLocaleString()} added to {job.name}
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Amount */}
            <div>
              <label className="text-xs text-lumina-dim font-medium block mb-1.5">Amount Received (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lumina-success font-bold text-sm">$</span>
                <input
                  autoFocus
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-lumina-bg border border-lumina-border rounded-xl pl-7 pr-4 py-2.5 text-sm font-mono text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-success transition-colors"
                />
              </div>
            </div>

            {/* Source */}
            <div>
              <label className="text-xs text-lumina-dim font-medium block mb-1.5">Income Source</label>
              <div className="grid grid-cols-2 gap-1.5">
                {SOURCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSource(opt.value)}
                    title={opt.hint}
                    className={clsx(
                      'text-xs py-2 px-3 rounded-lg border transition-all text-left',
                      source === opt.value
                        ? 'border-lumina-success bg-lumina-success/10 text-lumina-success font-semibold'
                        : 'border-lumina-border text-lumina-dim hover:border-lumina-success/40',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference (optional) */}
            <div>
              <label className="text-xs text-lumina-dim font-medium block mb-1.5">
                Reference # <span className="text-lumina-muted">(invoice / charge ID / trade ticket — optional)</span>
              </label>
              <input
                type="text"
                value={sourceRef}
                onChange={e => setSourceRef(e.target.value)}
                placeholder="INV-001 or ch_3ABC… or #12345"
                className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs font-mono text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-lumina-dim font-medium block mb-1.5">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={`e.g. "Meridian Tech monthly retainer"`}
                className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse transition-colors"
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-lumina-dim font-medium block mb-1.5">Date Received</label>
              <input
                type="date"
                value={earnedDate}
                onChange={e => setEarnedDate(e.target.value)}
                className="w-full bg-lumina-bg border border-lumina-border rounded-xl px-3 py-2.5 text-xs text-lumina-text focus:outline-none focus:border-lumina-pulse transition-colors"
              />
            </div>

            {/* Submit */}
            <button
              onClick={() => void handleSubmit()}
              disabled={isPending || amtNum <= 0}
              className={clsx(
                'btn-pulse w-full flex items-center justify-center gap-2 py-2.5',
                (isPending || amtNum <= 0) && 'opacity-50 cursor-not-allowed',
              )}
            >
              {isPending ? <Loader size={13} className="animate-spin" /> : <DollarSign size={13} />}
              {isPending ? 'Saving…' : `Log $${amtNum > 0 ? amtNum.toLocaleString() : '0'} to ${job.name}`}
            </button>

            <p className="text-[10px] text-lumina-muted text-center">
              This updates your live dashboard immediately. Stripe payments auto-log via webhook.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
