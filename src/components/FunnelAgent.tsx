/**
 * AI Lead-to-Cash Funnel Agent
 * Full qualification → proposal + contract + Stripe invoice in <60s
 * Data: live from `leads` Supabase table (no mock fallbacks)
 */
import { useState, useEffect } from 'react'
import {
  Users, Send, FileText, Video, CheckCircle, Clock, Star, ArrowRight,
  Loader, ChevronDown, ChevronUp, ExternalLink, Mail, Plus, X,
  AlertCircle, DollarSign, Link as LinkIcon,
} from 'lucide-react'
import { useLeads, useUpdateLeadStage } from '../hooks/useSupabaseData'
import { supabase } from '../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { Lead } from '../lib/types'
import clsx from 'clsx'

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  new:         { label: 'New',         color: 'badge bg-lumina-muted/20 text-lumina-dim' },
  qualified:   { label: 'Qualified',   color: 'badge-pulse' },
  proposal:    { label: 'Proposal',    color: 'badge-gold' },
  negotiation: { label: 'Negotiation', color: 'badge-violet' },
  won:         { label: 'Won ✓',       color: 'badge-success' },
  lost:        { label: 'Lost',        color: 'badge-danger' },
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-lumina-success' :
    score >= 60 ? 'bg-lumina-pulse'   :
    score >= 40 ? 'bg-lumina-warning'  : 'bg-lumina-danger'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-lumina-bg rounded-full h-1.5 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-lumina-dim w-6">{score}</span>
    </div>
  )
}

// ─── Real Generate Modal — calls edge function ────────────────────────────────

function GenerateModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [phase,    setPhase]    = useState<'progress' | 'done' | 'error'>('progress')
  const [progress, setProgress] = useState(0)
  const [result,   setResult]   = useState<{
    proposalUrl?: string | null
    contractUrl?: string | null
    invoiceUrl?:  string | null
    message?:     string
  } | null>(null)
  const [errorMsg, setErrorMsg]  = useState<string | null>(null)

  const steps = [
    { label: 'AI qualification analysis',  threshold: 15 },
    { label: 'Generating proposal PDF',     threshold: 40 },
    { label: 'Drafting service contract',   threshold: 62 },
    { label: 'Building Stripe invoice',     threshold: 80 },
    { label: 'Sending package to lead',     threshold: 96 },
  ]

  useEffect(() => {
    let animTimer: ReturnType<typeof setInterval>
    let stopped = false

    // Animate progress bar while edge function runs
    animTimer = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(animTimer); return 90 }
        return p + (p < 60 ? 6 : 3)
      })
    }, 200)

    // Call edge function directly with proper dual-auth:
    //  - Authorization: Bearer <anon_key>  →  satisfies Supabase gateway
    //  - x-user-jwt: <access_token>        →  function code verifies user identity
    // This sidesteps the GoTrue vs. gateway JWT-secret mismatch.
    ;(async () => {
      try {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
        const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { access_token?: string }
        const userJwt = stored.access_token ?? ''

        const httpResp = await fetch(`${supabaseUrl}/functions/v1/generate-lead-package`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
            'x-user-jwt': userJwt,
          },
          body: JSON.stringify({ leadId: lead.id }),
        })

        const data = await httpResp.json() as {
          success: boolean
          proposalUrl?: string
          contractUrl?: string
          invoiceUrl?:  string
          message?:     string
          error?:       string
          detail?:      string
        }

        if (!httpResp.ok) throw new Error(data.error ?? `HTTP ${httpResp.status}`)

        if (!data.success) throw new Error(data.error ?? 'Unknown error')

        if (!stopped) {
          clearInterval(animTimer)
          setProgress(100)
          setTimeout(() => {
            setResult({
              proposalUrl: data.proposalUrl,
              contractUrl: data.contractUrl,
              invoiceUrl:  data.invoiceUrl,
              message:     data.message,
            })
            setPhase('done')
          }, 400)
        }
      } catch (err) {
        if (!stopped) {
          clearInterval(animTimer)
          setErrorMsg(err instanceof Error ? err.message : String(err))
          setPhase('error')
        }
      }
    })()

    return () => {
      stopped = true
      clearInterval(animTimer)
    }
  }, [lead.id])

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card-glow w-full max-w-lg relative">
        {/* Close */}
        {phase !== 'progress' && (
          <button onClick={onClose} className="absolute top-3 right-3 text-lumina-dim hover:text-lumina-text">
            <X size={16} />
          </button>
        )}

        <div className="flex items-center gap-2 mb-4">
          <Send size={16} className="text-lumina-pulse" />
          <h2 className="text-lumina-text font-semibold">AI Package: {lead.name}</h2>
        </div>

        {/* Progress phase */}
        {phase === 'progress' && (
          <div className="space-y-4">
            <div className="w-full bg-lumina-bg rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-violet transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-lumina-dim font-mono text-center">{progress}% — generating…</p>
            <div className="space-y-2">
              {steps.map(({ label, threshold }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  {progress > threshold
                    ? <CheckCircle size={14} className="text-lumina-success flex-shrink-0" />
                    : progress > threshold - 15
                      ? <Loader size={14} className="text-lumina-pulse animate-spin flex-shrink-0" />
                      : <Clock size={14} className="text-lumina-border flex-shrink-0" />
                  }
                  <span className={progress > threshold ? 'text-lumina-text' : 'text-lumina-dim'}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error phase */}
        {phase === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lumina-danger">
              <AlertCircle size={16} />
              <span className="font-semibold text-sm">Generation failed</span>
            </div>
            <p className="text-lumina-dim text-sm bg-lumina-bg/60 p-3 rounded-lg font-mono text-xs break-all">
              {errorMsg}
            </p>
            <div className="text-xs text-lumina-muted space-y-1">
              <p>• Make sure the <code className="text-lumina-pulse">generate-lead-package</code> edge function is deployed</p>
              <p>• Add <code className="text-lumina-pulse">STRIPE_SECRET_KEY</code> in Supabase → Settings → Edge Functions</p>
            </div>
            <button className="btn-ghost w-full" onClick={onClose}>Close</button>
          </div>
        )}

        {/* Done phase — show real document links */}
        {phase === 'done' && result && (
          <div className="space-y-4">
            {/* Show real Stripe invoice status vs proposal-only status clearly */}
            {result.invoiceUrl && result.invoiceUrl.includes('invoice.stripe.com') ? (
              <div className="text-center text-lumina-success font-semibold text-sm mb-3">
                ✅ Stripe invoice sent to {lead.email}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-center text-lumina-success font-semibold text-sm">
                  📄 Proposal ready — no Stripe invoice yet
                </div>
                {!result.invoiceUrl?.includes('invoice.stripe.com') && result.message !== 'Stripe not configured' && (
                  <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400 text-center">
                    ⚠️ Stripe not configured — edge function not deployed. Deploy to enable payment links.
                  </div>
                )}
              </div>
            )}

            {result.message && !result.invoiceUrl?.includes('invoice.stripe.com') && (
              <div className="bg-lumina-pulse/10 border border-lumina-pulse/20 rounded-lg p-3 text-xs text-lumina-pulse text-center">
                {result.message}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {result.proposalUrl && (
                <a
                  href={result.proposalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="card hover:border-lumina-pulse/40 flex items-center gap-3 transition-colors group"
                >
                  <FileText size={16} className="text-lumina-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-lumina-text font-medium">Proposal PDF</div>
                    <div className="text-xs text-lumina-dim truncate">Personalized 12-page deck</div>
                  </div>
                  <ExternalLink size={12} className="text-lumina-dim group-hover:text-lumina-pulse flex-shrink-0" />
                </a>
              )}

              {result.contractUrl && (
                <a
                  href={result.contractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="card hover:border-lumina-gold/40 flex items-center gap-3 transition-colors group"
                >
                  <FileText size={16} className="text-lumina-gold flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-lumina-text font-medium">Service Contract</div>
                    <div className="text-xs text-lumina-dim truncate">E-sign ready draft</div>
                  </div>
                  <ExternalLink size={12} className="text-lumina-dim group-hover:text-lumina-gold flex-shrink-0" />
                </a>
              )}

              {result.invoiceUrl && (
                <a
                  href={result.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="card hover:border-lumina-success/40 flex items-center gap-3 transition-colors group"
                >
                  <DollarSign size={16} className="text-lumina-success flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-lumina-text font-medium">Stripe Invoice</div>
                    <div className="text-xs text-lumina-dim truncate">
                      ${lead.estimatedValue.toLocaleString()} - Net 14 - Click to pay
                    </div>
                  </div>
                  <ExternalLink size={12} className="text-lumina-dim group-hover:text-lumina-success flex-shrink-0" />
                </a>
              )}

              {!result.proposalUrl && !result.invoiceUrl && (
                <div className="card text-center text-lumina-dim text-sm py-4">
                  <p>Package generated but no document URLs returned.</p>
                  <p className="text-xs mt-1">Deploy the edge function and configure Stripe to see links.</p>
                </div>
              )}
            </div>

            {/* Immediate revenue — show live product payment links when no invoice yet */}
            {result.invoiceUrl && !result.invoiceUrl.includes('invoice.stripe.com') && (
              <div className="border border-lumina-gold/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-lumina-gold font-semibold mb-1">
                  <DollarSign size={12} />
                  SEND THESE NOW — Live Stripe Products
                </div>
                {[
                  { name: 'MT5 Gold Scalper EA',           price: '$97',    url: 'https://buy.stripe.com/5kQ7sNeAefk60KF0Ef1VK01' },
                  { name: 'Polymarket Edge Scanner',        price: '$47',    url: 'https://buy.stripe.com/3cI28tfEic7U0KFbiT1VK02' },
                  { name: 'AI Prompt Engineering Toolkit',  price: '$29',    url: 'https://buy.stripe.com/14AfZjajYdbY64ZcmX1VK03' },
                  { name: 'Content Swarm Templates',        price: '$19',    url: 'https://buy.stripe.com/7sY00lfEi6NAbpjfz91VK04' },
                  { name: 'Kelly Calculator Pro',           price: '$14.99', url: 'https://buy.stripe.com/14A00l9fUfk63WR4Uv1VK05' },
                ].map(product => (
                  <a
                    key={product.url}
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded bg-lumina-bg hover:bg-lumina-muted/20 transition-colors group"
                  >
                    <span className="text-lumina-text group-hover:text-lumina-gold transition-colors">{product.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-lumina-success font-mono font-semibold">{product.price}</span>
                      <ExternalLink size={10} className="text-lumina-dim group-hover:text-lumina-gold" />
                    </div>
                  </a>
                ))}
                <p className="text-xs text-lumina-muted mt-2">Copy link → paste in email to {lead.name}. Works immediately.</p>
              </div>
            )}

            <button className="btn-ghost w-full text-sm" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Lead Modal ───────────────────────────────────────────────────────────

function AddLeadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [form, setForm] = useState({
    name:            '',
    email:           '',
    company:         '',
    source:          'LinkedIn',
    score:           70,
    stage:           'qualified' as Lead['stage'],
    estimatedValue:  5000,
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    const { error: dbError } = await supabase.from('leads').insert({
      user_id:         user.id,
      name:            form.name.trim(),
      email:           form.email.trim().toLowerCase(),
      company:         form.company.trim() || null,
      source:          form.source,
      score:           form.score,
      stage:           form.stage,
      estimated_value: form.estimatedValue,
      created_at:      new Date().toISOString(),
      last_contact:    new Date().toISOString(),
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    await qc.invalidateQueries({ queryKey: ['leads'] })
    onClose()
  }

  const inp = 'w-full bg-lumina-bg border border-lumina-border rounded-lg px-3 py-2 text-sm text-lumina-text focus:outline-none focus:border-lumina-pulse'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card-glow w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-lumina-pulse" />
            <h2 className="text-lumina-text font-semibold">Add Lead</h2>
          </div>
          <button onClick={onClose} className="text-lumina-dim hover:text-lumina-text"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="stat-label mb-1 block">Full Name *</label>
              <input required className={inp} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="stat-label mb-1 block">Email *</label>
              <input required type="email" className={inp} value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="stat-label mb-1 block">Company</label>
              <input className={inp} value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div>
              <label className="stat-label mb-1 block">Source</label>
              <select className={inp} value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                <option>LinkedIn</option>
                <option>Referral</option>
                <option>Cold email</option>
                <option>Inbound</option>
                <option>Conference</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="stat-label mb-1 block">Stage</label>
              <select className={inp} value={form.stage}
                onChange={e => setForm(f => ({ ...f, stage: e.target.value as Lead['stage'] }))}>
                <option value="new">New</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="negotiation">Negotiation</option>
              </select>
            </div>
            <div>
              <label className="stat-label mb-1 block">Score (0-100)</label>
              <input type="number" min={0} max={100} className={inp} value={form.score}
                onChange={e => setForm(f => ({ ...f, score: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="stat-label mb-1 block">Est. Value ($)</label>
              <input type="number" min={0} className={inp} value={form.estimatedValue}
                onChange={e => setForm(f => ({ ...f, estimatedValue: Number(e.target.value) }))} />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-lumina-danger text-xs bg-lumina-danger/10 p-2 rounded-lg">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-pulse flex-1 text-sm flex items-center justify-center gap-2">
              {saving ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
              {saving ? 'Saving…' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
  const [showModal,  setShowModal]  = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const cfg = STAGE_CONFIG[lead.stage] ?? STAGE_CONFIG.new
  const hasLinks = lead.proposalUrl || lead.contractUrl || lead.invoiceUrl || lead.loomUrl

  return (
    <>
      {showModal && <GenerateModal lead={lead} onClose={() => setShowModal(false)} />}
      <div className="card-glow hover:border-lumina-pulse/30 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-lumina-text font-semibold text-sm">{lead.name}</div>
            <div className="text-lumina-dim text-xs flex items-center gap-1 mt-0.5">
              <Mail size={10} />{lead.email}
            </div>
            {lead.company && <div className="text-lumina-muted text-[10px] mt-0.5">{lead.company}</div>}
          </div>
          <span className={clsx('badge flex-shrink-0', cfg.color)}>{cfg.label}</span>
        </div>

        <ScoreBar score={lead.score} />

        <div className="flex items-center gap-3 mt-3 text-xs text-lumina-dim">
          <Star size={11} className="text-lumina-gold flex-shrink-0" />
          <span className="text-lumina-gold font-mono font-semibold">${lead.estimatedValue.toLocaleString()}</span>
          <span>{lead.source}</span>
          <button onClick={() => setExpanded(e => !e)} className="ml-auto text-lumina-dim hover:text-lumina-pulse transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-lumina-border/50 space-y-1.5">
            {lead.lastContact && (
              <div className="flex justify-between text-[11px]">
                <span className="text-lumina-muted">Last Contact</span>
                <span className="text-lumina-dim font-mono">{lead.lastContact.slice(0, 10)}</span>
              </div>
            )}
            {lead.createdAt && (
              <div className="flex justify-between text-[11px]">
                <span className="text-lumina-muted">Created</span>
                <span className="text-lumina-dim font-mono">{lead.createdAt.slice(0, 10)}</span>
              </div>
            )}
            {hasLinks && (
              <div className="space-y-1 pt-1">
                <div className="text-[10px] text-lumina-dim font-semibold uppercase tracking-wide">Documents</div>
                {lead.proposalUrl && (
                  <a href={lead.proposalUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-lumina-pulse hover:underline">
                    <FileText size={10} /> Proposal <ExternalLink size={9} />
                  </a>
                )}
                {lead.contractUrl && (
                  <a href={lead.contractUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-lumina-success hover:underline">
                    <CheckCircle size={10} /> Contract <ExternalLink size={9} />
                  </a>
                )}
                {lead.invoiceUrl && (
                  <a href={lead.invoiceUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-lumina-gold hover:underline">
                    <LinkIcon size={10} /> Invoice / Pay Link <ExternalLink size={9} />
                  </a>
                )}
                {lead.loomUrl && (
                  <a href={lead.loomUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-purple-400 hover:underline">
                    <Video size={10} /> Loom Video <ExternalLink size={9} />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button
            className="btn-pulse text-xs py-1.5 flex-1 flex items-center justify-center gap-1"
            onClick={() => setShowModal(true)}
          >
            <Send size={12} />
            {lead.proposalUrl ? 'Re-generate' : 'Generate Package'}
          </button>
          {lead.invoiceUrl && (
            <a href={lead.invoiceUrl} target="_blank" rel="noreferrer"
              className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1">
              <DollarSign size={12} />
              Pay
            </a>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FunnelAgent() {
  const { data: leads = [], isLoading } = useLeads()
  const [showAddLead, setShowAddLead]   = useState(false)

  const totalPipeline = leads.reduce((s, l) => s + l.estimatedValue, 0)
  const qualified     = leads.filter((l) => l.score >= 70).length
  const avgScore      = leads.length
    ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length)
    : 0
  const wonLeads      = leads.filter(l => l.stage === 'won')
  const wonValue      = wonLeads.reduce((s, l) => s + l.estimatedValue, 0)

  return (
    <div className="space-y-6">
      {showAddLead && <AddLeadModal onClose={() => setShowAddLead(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">AI Lead-to-Cash Funnel</h1>
          <p className="text-lumina-dim text-sm">
            Full qualification → proposal + contract + Stripe invoice - Live from Supabase
          </p>
        </div>
        <button
          className="btn-pulse flex items-center gap-2"
          onClick={() => setShowAddLead(true)}
        >
          <Plus size={14} />
          Add Lead
        </button>
      </div>

      {/* Live pipeline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-glow text-center">
          <div className="stat-label">Total Pipeline</div>
          <div className="stat-value text-lumina-gold">
            {isLoading ? '…' : `$${(totalPipeline / 1000).toFixed(1)}k`}
          </div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Hot Leads (≥70)</div>
          <div className="stat-value text-lumina-pulse">{isLoading ? '…' : qualified}</div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Won Value</div>
          <div className="stat-value text-lumina-success">
            {isLoading ? '…' : `$${(wonValue / 1000).toFixed(1)}k`}
          </div>
        </div>
        <div className="card-glow text-center">
          <div className="stat-label">Avg Score</div>
          <div className="stat-value text-lumina-text">{isLoading ? '…' : avgScore || '—'}</div>
        </div>
      </div>

      {/* Lead cards */}
      <div>
        <div className="section-header">Sales Pipeline ({leads.length})</div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-lumina-dim text-sm py-8">
            <Loader size={14} className="animate-spin" />
            Loading leads from Supabase…
          </div>
        ) : leads.length === 0 ? (
          <div className="card text-center py-12 space-y-3">
            <Users size={32} className="text-lumina-border mx-auto" />
            <p className="text-lumina-dim text-sm">No leads yet.</p>
            <p className="text-lumina-muted text-xs">
              Click <strong className="text-lumina-text">Add Lead</strong> to enter your first prospect,<br/>
              or run <code className="text-lumina-pulse font-mono">supabase/seed_real_data.sql</code> to seed sample data.
            </p>
            <button
              className="btn-pulse text-sm mx-auto flex items-center gap-2"
              onClick={() => setShowAddLead(true)}
            >
              <Plus size={14} />
              Add Your First Lead
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
          </div>
        )}
      </div>

      {/* AI negotiation log — based on real lead stages */}
      {leads.length > 0 && (
        <div className="card-glow">
          <div className="section-header">Activity Log</div>
          <div className="space-y-2 text-sm">
            {leads.slice(0, 5).map((l) => (
              <div key={l.id} className="flex gap-3 p-2 bg-lumina-bg/60 rounded-lg">
                <span className="text-lumina-dim text-xs font-mono flex-shrink-0 mt-0.5 w-16">
                  {l.lastContact ? l.lastContact.slice(0, 10) : '—'}
                </span>
                <div className="min-w-0">
                  <span className="text-lumina-pulse text-xs font-semibold">{l.name}</span>
                  {l.company && <span className="text-lumina-muted text-xs"> - {l.company}</span>}
                  <p className="text-lumina-dim text-xs mt-0.5">
                    {l.stage === 'won'         ? `✅ WON — $${l.estimatedValue.toLocaleString()} closed` :
                     l.stage === 'negotiation' ? '💬 Active negotiation in progress' :
                     l.stage === 'proposal'    ? l.invoiceUrl
                       ? `📄 Proposal + invoice sent → ${l.email}`
                       : '📝 Proposal sent — awaiting response'                                          :
                     l.stage === 'qualified'   ? '⚡ Qualified — package generation ready' :
                     l.stage === 'lost'        ? '❌ Lost — closed out'                    :
                     `Stage: ${l.stage}`}
                  </p>
                </div>
                <span className="ml-auto text-lumina-gold font-mono text-xs flex-shrink-0">
                  ${l.estimatedValue.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
