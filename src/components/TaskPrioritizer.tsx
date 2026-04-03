/**
 * Smart Task Prioritizer + Auto-Delegate
 * Pulls tasks from auto_tasks via the useJobs hook (which joins auto_tasks).
 */
import { useState } from 'react'
import { CheckSquare, Cpu, Clock, ChevronDown, ChevronUp, Loader } from 'lucide-react'
import { useJobs } from '../hooks/useJobs'
import type { AutoTask } from '../lib/types'
import clsx from 'clsx'

const PRIORITY_CONFIG = {
  critical: { label: 'CRITICAL', dot: 'bg-lumina-danger',  text: 'text-lumina-danger' },
  high:     { label: 'HIGH',     dot: 'bg-lumina-warning', text: 'text-lumina-warning' },
  medium:   { label: 'MED',      dot: 'bg-lumina-gold',    text: 'text-lumina-gold' },
  low:      { label: 'LOW',      dot: 'bg-lumina-muted',   text: 'text-lumina-dim' },
}

export default function TaskPrioritizer() {
  // ── LIVE from ops_jobs + auto_tasks (joined in useJobs query) ────────────
  const { data: jobs = [], isLoading } = useJobs()
  const [expanded,  setExpanded]  = useState(false)
  const [delegated, setDelegated] = useState<Set<string>>(new Set())

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
                'flex items-center gap-2.5 p-2.5 rounded-lg transition-colors group',
                isDone ? 'opacity-50' : 'hover:bg-lumina-bg',
              )}
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
    </div>
  )
}
