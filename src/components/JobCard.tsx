import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Copy, DollarSign, AlertTriangle,
  ChevronDown, ChevronUp, Play, Pause, X, CheckCircle, Clock, PlusCircle,
  BarChart2, Zap, ListChecks,
} from 'lucide-react'
import clsx from 'clsx'
import type { Job, AutoTask } from '../lib/types'
import IncomeEntryModal from './IncomeEntryModal'
import { useUpdateJobStatus } from '../hooks/useJobs'
import { useJobIncomeEntries } from '../hooks/useIncomeEntries'

const STATUS_CONFIG = {
  active:   { label: 'LIVE 24/7', classes: 'badge-success' },
  scaling:  { label: 'SCALING 24/7', classes: 'badge-pulse' },
  paused:   { label: 'PAUSED',  classes: 'badge-gold' },
  killed:   { label: 'KILLED',  classes: 'badge-danger' },
  pending:  { label: 'PENDING', classes: 'badge bg-lumina-muted/20 text-lumina-dim' },
}

const PRIORITY_DOT = {
  critical: 'bg-lumina-danger',
  high:     'bg-lumina-warning',
  medium:   'bg-lumina-gold',
  low:      'bg-lumina-muted',
}

function TaskRow({ task }: { task: AutoTask }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-lumina-border/50 last:border-0">
      <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_DOT[task.priority as keyof typeof PRIORITY_DOT] ?? 'bg-lumina-muted')} />
      <span className={clsx(
        'text-xs flex-1 leading-tight',
        task.status === 'done' ? 'line-through text-lumina-muted' : 'text-lumina-text',
      )}>
        {task.title}
      </span>
      <div className="flex-shrink-0">
        {task.status === 'done'        && <CheckCircle size={12} className="text-lumina-success" />}
        {task.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-lumina-pulse animate-pulse-fast" />}
        {task.status === 'pending'     && <Clock size={12} className="text-lumina-dim" />}
        {task.status === 'delegated'   && <span className="text-[10px] text-lumina-dim font-mono">AI</span>}
      </div>
    </div>
  )
}

interface JobCardProps {
  job: Job
  rank: number
  /** Called when the user clicks "Cash Out" — parent renders the modal */
  onCashOut?: (job: Job) => void
}

function ExpandedDetail({ job }: { job: Job }) {
  const { data: entries = [] } = useJobIncomeEntries(job.id, 5)

  const doneTasks    = job.tasks.filter(t => t.status === 'done').length
  const activeTasks  = job.tasks.filter(t => t.status === 'in_progress').length
  const pendingTasks = job.tasks.filter(t => t.status === 'pending').length

  return (
    <div className="mt-3 pt-3 border-t border-lumina-border/50 space-y-3">

      {/* ROI / earnings breakdown */}
      <div>
        <div className="flex items-center gap-1.5 text-[10px] text-lumina-dim font-semibold uppercase tracking-wide mb-2">
          <BarChart2 size={10} /> Revenue Breakdown
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-lumina-bg rounded-lg p-2">
            <div className="text-lumina-muted mb-0.5">Daily Avg</div>
            <div className="font-mono font-bold text-lumina-success">+${job.dailyProfit.toLocaleString()}</div>
          </div>
          <div className="bg-lumina-bg rounded-lg p-2">
            <div className="text-lumina-muted mb-0.5">Monthly</div>
            <div className="font-mono font-bold text-lumina-text">${job.monthlyProfit.toLocaleString()}</div>
          </div>
          <div className="bg-lumina-bg rounded-lg p-2">
            <div className="text-lumina-muted mb-0.5">Projected</div>
            <div className={clsx('font-mono font-bold', job.projectedMonthly > job.monthlyProfit ? 'text-lumina-pulse' : 'text-lumina-dim')}>
              ${job.projectedMonthly.toLocaleString()}
            </div>
          </div>
          <div className="bg-lumina-bg rounded-lg p-2">
            <div className="text-lumina-muted mb-0.5">ROI</div>
            <div className="font-mono font-bold text-lumina-gold">{job.roi}%</div>
          </div>
        </div>
      </div>

      {/* Task summary */}
      <div>
        <div className="flex items-center gap-1.5 text-[10px] text-lumina-dim font-semibold uppercase tracking-wide mb-2">
          <ListChecks size={10} /> Task Progress
        </div>
        <div className="flex gap-3 text-[11px] mb-2">
          <span className="text-lumina-success">{doneTasks} done</span>
          <span className="text-lumina-pulse">{activeTasks} active</span>
          <span className="text-lumina-dim">{pendingTasks} pending</span>
        </div>
        {/* Show all tasks when expanded */}
        {job.tasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>

      {/* Recent income log */}
      {entries.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] text-lumina-dim font-semibold uppercase tracking-wide mb-2">
            <Zap size={10} /> Recent Income Entries
          </div>
          <div className="space-y-1">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between text-[11px] py-1 border-b border-lumina-border/40 last:border-0">
                <span className="text-lumina-dim">{e.earnedAt}</span>
                <span className="text-lumina-muted capitalize">{e.source}</span>
                <span className="font-mono text-lumina-success">+${e.amountUsd.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description / strategy */}
      {job.description && (
        <div className="text-[11px] text-lumina-dim bg-lumina-bg/60 rounded-lg p-2.5 leading-relaxed">
          {job.description}
        </div>
      )}
    </div>
  )
}

export default function JobCard({ job, rank, onCashOut }: JobCardProps) {
  const [expanded,        setExpanded]        = useState(false)
  const [showIncomeEntry, setShowIncomeEntry] = useState(false)
  const updateStatus = useUpdateJobStatus()
  const status = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending

  const riskColor =
    job.riskScore < 25  ? 'text-lumina-success' :
    job.riskScore < 50  ? 'text-lumina-warning'  :
    job.riskScore < 75  ? 'text-lumina-gold'     : 'text-lumina-danger'

  const synergyColor =
    job.synergyScore > 80 ? 'text-lumina-pulse' :
    job.synergyScore > 60 ? 'text-lumina-success' : 'text-lumina-dim'

  const profitTrend = job.projectedMonthly > job.monthlyProfit

  return (
    <div className={clsx(
      'card-glow transition-all duration-200 hover:border-lumina-pulse/40',
      job.status === 'active'  && 'border-lumina-border',
      job.status === 'scaling' && 'border-lumina-pulse/30',
      job.status === 'killed'  && 'opacity-60',
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lumina-muted text-xs font-mono flex-shrink-0">#{rank}</span>
          <h3 className="text-lumina-text font-semibold text-sm leading-tight truncate">
            {job.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={clsx('badge', status.classes)}>{status.label}</span>
          {(job.status === 'active' || job.status === 'scaling') && (
            <div className="w-1.5 h-1.5 rounded-full bg-lumina-success animate-pulse-fast" title="Auto-executing 24/7" />
          )}
        </div>
      </div>

      {/* Profit stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-lumina-bg/60 rounded-lg p-2">
          <div className="stat-label mb-0.5">Daily</div>
          <div className="font-mono font-bold text-lumina-success text-sm">
            +${job.dailyProfit.toLocaleString()}
          </div>
        </div>
        <div className="bg-lumina-bg/60 rounded-lg p-2">
          <div className="stat-label mb-0.5">Monthly</div>
          <div className="font-mono font-bold text-lumina-text text-sm">
            ${job.monthlyProfit.toLocaleString()}
          </div>
        </div>
        <div className="bg-lumina-bg/60 rounded-lg p-2">
          <div className="stat-label mb-0.5">Proj.</div>
          <div className={clsx('font-mono font-bold text-sm flex items-center gap-0.5', profitTrend ? 'text-lumina-pulse' : 'text-lumina-dim')}>
            {profitTrend ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            ${job.projectedMonthly.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 24/7 Execution Status */}
      {(job.status === 'active' || job.status === 'scaling') && (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-lumina-success/5 border border-lumina-success/20">
          <div className="w-2 h-2 rounded-full bg-lumina-success animate-pulse-fast" />
          <span className="text-[11px] font-semibold text-lumina-success">AUTO-EXECUTING 24/7</span>
          <span className="text-[10px] text-lumina-dim ml-auto font-mono">Hands-off</span>
        </div>
      )}

      {/* Risk / Synergy / ROI bar */}
      <div className="flex items-center gap-3 text-xs mb-3">
        <div className="flex items-center gap-1">
          <AlertTriangle size={11} className={riskColor} />
          <span className={riskColor}>{job.riskScore}</span>
          <span className="text-lumina-muted">risk</span>
        </div>
        <div className="w-px h-3 bg-lumina-border" />
        <div className="flex items-center gap-1">
          <span className={synergyColor}>{job.synergyScore}</span>
          <span className="text-lumina-muted">synergy</span>
        </div>
        <div className="w-px h-3 bg-lumina-border" />
        <div className="flex items-center gap-1">
          <span className="text-lumina-gold font-mono">{job.roi}%</span>
          <span className="text-lumina-muted">ROI</span>
        </div>
      </div>

      {/* ROI bar */}
      <div className="w-full bg-lumina-bg rounded-full h-1 mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-lumina-pulse to-lumina-violet transition-all duration-700"
          style={{ width: `${Math.min(100, job.roi / 6)}%` }}
        />
      </div>

      {/* Tasks preview — top 2 always visible */}
      <div className="mb-3">
        {job.tasks.slice(0, 2).map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {!expanded && job.tasks.length > 2 && (
          <div className="text-[10px] text-lumina-muted mt-1">+{job.tasks.length - 2} more tasks — click ↓ to expand</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Log real income */}
        <button
          className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 border-lumina-success/40 text-lumina-success hover:border-lumina-success hover:bg-lumina-success/5"
          onClick={() => setShowIncomeEntry(true)}
          title="Log real income for this job"
        >
          <PlusCircle size={11} />
          Log $
        </button>

        {/* Cash Out — opens the modal */}
        <button
          className="btn-pulse text-xs py-1.5 px-3 flex-1 flex items-center justify-center gap-1.5"
          onClick={() => {
            if (onCashOut) {
              onCashOut(job)
            } else if (job.cashOutUrl) {
              window.open(job.cashOutUrl, '_blank')
            }
          }}
        >
          <DollarSign size={12} />
          {job.dailyProfit > 0
            ? `Cash Out · $${job.dailyProfit.toLocaleString()}/day`
            : 'Cash Out'}
        </button>

        <button
          className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"
          onClick={() => { if (job.cloneUrl) window.open(job.cloneUrl, '_blank') }}
          disabled={!job.cloneUrl}
          title={job.cloneUrl ? 'Clone this job' : 'No clone URL configured'}
        >
          <Copy size={12} />
          Clone
        </button>

        <button
          className="btn-ghost text-xs py-1.5 px-2 disabled:opacity-40"
          title={job.status === 'active' || job.status === 'scaling' ? 'Pause job' : 'Resume job'}
          disabled={updateStatus.isPending}
          onClick={() => {
            const next = (job.status === 'active' || job.status === 'scaling') ? 'paused' : 'active'
            void updateStatus.mutate({ id: job.id, status: next })
          }}
        >
          {job.status === 'active' || job.status === 'scaling' ? <Pause size={12} /> : <Play size={12} />}
        </button>

        {job.status !== 'killed' && (
          <button
            className="btn-ghost text-xs py-1.5 px-2 hover:border-lumina-danger hover:text-lumina-danger disabled:opacity-40"
            title="Kill job permanently"
            disabled={updateStatus.isPending}
            onClick={() => {
              if (window.confirm(`Kill "${job.name}"? This will stop all auto-tasks.`)) {
                void updateStatus.mutate({ id: job.id, status: 'killed' })
              }
            }}
          >
            <X size={12} />
          </button>
        )}

        <button
          onClick={() => setExpanded((e) => !e)}
          className="btn-ghost text-xs py-1.5 px-2 ml-auto"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Expanded detail panel */}
      {expanded && <ExpandedDetail job={job} />}

      {/* Income Entry Modal */}
      {showIncomeEntry && (
        <IncomeEntryModal job={job} onClose={() => setShowIncomeEntry(false)} />
      )}
    </div>
  )
}

