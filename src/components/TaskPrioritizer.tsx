/**
 * Smart Task Prioritizer + Auto-Delegate
 * Pulls tasks from auto_tasks via the useJobs hook (which joins auto_tasks).
 */
import { useState } from 'react'
import { CheckSquare, Cpu, Clock, ChevronDown, ChevronUp, Loader, X } from 'lucide-react'
import { useJobs } from '../hooks/useJobs'
import type { AutoTask, Job } from '../lib/types'
import clsx from 'clsx'

const PRIORITY_CONFIG = {
  critical: { label: 'CRITICAL', dot: 'bg-lumina-danger',  text: 'text-lumina-danger' },
  high:     { label: 'HIGH',     dot: 'bg-lumina-warning', text: 'text-lumina-warning' },
  medium:   { label: 'MED',      dot: 'bg-lumina-gold',    text: 'text-lumina-gold' },
  low:      { label: 'LOW',      dot: 'bg-lumina-muted',   text: 'text-lumina-dim' },
}

const STATUS_COLORS = {
  pending: 'text-lumina-dim',
  in_progress: 'text-lumina-pulse',
  done: 'text-lumina-success',
  delegated: 'text-lumina-gold',
}

const ESTIMATED_BENEFITS: Record<string, string> = {
  critical: 'Blocks multiple other tasks. High impact on overall system stability.',
  high: 'Enables next phase of work. Significant efficiency gain.',
  medium: 'Improves workflow but not blocking. Good to complete soon.',
  low: 'Nice-to-have improvement. Can be deferred if higher priorities emerge.',
}

const NEXT_STEPS: Record<string, string> = {
  pending: 'Once started, focus on completion. Break into smaller checkpoints if needed.',
  in_progress: 'Continue execution. Monitor for blockers. Report completion once done.',
  done: 'Task complete. Consider documenting results for future reference.',
  delegated: 'AI is handling this. Check back for updates on progress.',
}

// Task Detail Modal
function TaskDetailModal({
  task,
  job,
  onClose,
}: {
  task: AutoTask & { jobName: string }
  job: Job | undefined
  onClose: () => void
}) {
  const cfg = PRIORITY_CONFIG[task.priority]
  const statusConfig = task.status as keyof typeof STATUS_COLORS

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-lumina-card border border-lumina-border rounded-xl w-full max-w-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-lumina-border/50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
              <h3 className="text-lumina-text font-semibold text-sm leading-tight truncate">{task.title}</h3>
            </div>
            <p className="text-xs text-lumina-muted">from job: {task.jobName}</p>
          </div>
          <button onClick={onClose} className="text-lumina-dim hover:text-lumina-text transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Priority & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-1">Priority</div>
              <div className={clsx('text-sm font-semibold', cfg.text)}>{cfg.label}</div>
            </div>
            <div>
              <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-1">Status</div>
              <div className={clsx('text-sm font-semibold capitalize', STATUS_COLORS[statusConfig])}>{task.status.replace('_', ' ')}</div>
            </div>
          </div>

          {/* Time Estimate */}
          {task.estimatedMinutes != null && (
            <div>
              <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-1 flex items-center gap-1">
                <Clock size={10} />
                Time to Complete
              </div>
              <div className="text-sm text-lumina-text font-mono">{task.estimatedMinutes} minutes</div>
            </div>
          )}

          {/* Description / Overview */}
          <div>
            <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-2">Description</div>
            <div className="bg-lumina-bg/60 rounded-lg p-2.5 text-xs text-lumina-dim leading-relaxed">
              {job?.description ? (
                job.description
              ) : (
                <span className="italic text-lumina-muted">No description provided for this task.</span>
              )}
            </div>
          </div>

          {/* Benefits */}
          <div>
            <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-2">Benefits of Completing</div>
            <div className="bg-lumina-success/5 border border-lumina-success/20 rounded-lg p-2.5 text-xs text-lumina-text leading-relaxed">
              {ESTIMATED_BENEFITS[task.priority] || 'Contributes to overall system health.'}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-2">Timeline of Action</div>
            <div className="space-y-2">
              <div className="flex gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-lumina-pulse flex-shrink-0 mt-1" />
                <div className="text-lumina-dim">
                  <span className="text-lumina-text font-mono">Start now</span> to maintain momentum
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-lumina-gold flex-shrink-0 mt-1" />
                <div className="text-lumina-dim">
                  <span className="text-lumina-text font-mono">Target: {task.estimatedMinutes ?? 30} min</span> for completion
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-lumina-success flex-shrink-0 mt-1" />
                <div className="text-lumina-dim">
                  <span className="text-lumina-text font-mono">Mark done</span> when finished to track progress
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div>
            <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-2">Next Steps</div>
            <div className="bg-lumina-card border border-lumina-border/50 rounded-lg p-2.5 text-xs text-lumina-dim leading-relaxed italic">
              {NEXT_STEPS[statusConfig] || 'Continue with next phase of work.'}
            </div>
          </div>

          {/* Assigned To */}
          {task.assignedTo && (
            <div>
              <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-1">Assigned To</div>
              <div className="text-sm text-lumina-text font-mono">{task.assignedTo === 'ai' ? 'AI Assistant' : task.assignedTo}</div>
            </div>
          )}

          {/* Due Date */}
          {task.dueAt && (
            <div>
              <div className="text-xs text-lumina-dim uppercase font-mono tracking-wide mb-1">Due Date</div>
              <div className="text-sm text-lumina-text font-mono">{task.dueAt}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-lumina-border/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-ghost text-xs py-1.5 px-3"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TaskPrioritizer() {
  // ── LIVE from ops_jobs + auto_tasks (joined in useJobs query) ────────────
  const { data: jobs = [], isLoading } = useJobs()
  const [expanded,  setExpanded]  = useState(false)
  const [delegated, setDelegated] = useState<Set<string>>(new Set())
  const [selectedTask, setSelectedTask] = useState<(AutoTask & { jobName: string }) | null>(null)

  const allTasks: (AutoTask & { jobName: string })[] = jobs.flatMap((j) =>
    j.tasks.map((t) => ({ ...t, jobName: j.name }))
  )

  const sorted = [...allTasks].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
  })

  const visible        = expanded ? sorted : sorted.slice(0, 5)
  const criticalCount  = sorted.filter((t) => t.priority === 'critical' && t.status !== 'done').length

  function delegate(id: string) {
    setDelegated((prev) => new Set([...prev, id]))
  }

  if (isLoading) {
    return (
      <div className="card flex items-center gap-2 text-lumina-dim py-3">
        <Loader size={14} className="animate-spin" />
        <span className="text-xs">Loading tasks…</span>
      </div>
    )
  }

  if (allTasks.length === 0) {
    return (
      <div className="card text-center text-lumina-dim py-4 text-xs">
        No tasks found in <code className="font-mono text-lumina-pulse">auto_tasks</code>.
      </div>
    )
  }

  return (
    <div className="card-glow">
      <div className="flex items-center justify-between mb-3">
        <div className="section-header mb-0">
          <CheckSquare size={14} />
          Smart Task Prioritizer
          {criticalCount > 0 && (
            <span className="badge-danger badge ml-2">{criticalCount} CRITICAL</span>
          )}
        </div>
        <button
          onClick={() => {
            const ids = sorted.filter((t) => t.status !== 'done').map((t) => t.id)
            setDelegated(new Set(ids))
          }}
          className="text-xs text-lumina-dim hover:text-lumina-pulse transition-colors flex items-center gap-1"
        >
          <Cpu size={11} />
          Delegate All to AI
        </button>
      </div>

      <div className="space-y-1.5">
        {visible.map((task) => {
          const cfg    = PRIORITY_CONFIG[task.priority]
          const isDel  = delegated.has(task.id)
          const isDone = task.status === 'done'

          return (
            <div
              key={task.id}
              className={clsx(
                'flex items-center gap-2.5 p-2.5 rounded-lg transition-colors group cursor-pointer',
                isDone ? 'opacity-50' : 'hover:bg-lumina-bg/80 border border-transparent hover:border-lumina-pulse/20',
              )}
              onClick={() => setSelectedTask(task)}
            >
              <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5', cfg.dot)} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'text-xs truncate',
                    isDone ? 'line-through text-lumina-muted' : 'text-lumina-text',
                  )}>
                    {task.title}
                  </span>
                  {(isDel || task.assignedTo === 'ai') && !isDone && (
                    <span className="text-[10px] text-lumina-pulse font-mono flex-shrink-0">⟳ AI</span>
                  )}
                </div>
                <div className="text-[10px] text-lumina-muted">{task.jobName}</div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {task.estimatedMinutes != null && (
                  <span className="text-[10px] text-lumina-muted flex items-center gap-0.5">
                    <Clock size={9} />
                    {task.estimatedMinutes}m
                  </span>
                )}
                {!isDone && !isDel && task.assignedTo !== 'ai' && (
                  <button
                    onClick={() => delegate(task.id)}
                    className="text-[10px] text-lumina-dim hover:text-lumina-pulse transition-colors opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded border border-transparent hover:border-lumina-pulse/30"
                  >
                    → AI
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sorted.length > 5 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-lumina-dim hover:text-lumina-pulse transition-colors mt-2 mx-auto"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Show less' : `Show ${sorted.length - 5} more tasks`}
        </button>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          job={jobs.find((j) => j.name === selectedTask.jobName)}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}
