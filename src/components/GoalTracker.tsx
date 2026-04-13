/**
 * GoalTracker — Daily revenue goals with live progress per job
 *
 * Goals are stored in Supabase job_goals table.
 * Falls back to auto-calculated targets (10% above recent avg) if no goals set.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useJobs } from '../hooks/useJobs'
import { useJobEarningsSummary } from '../hooks/useIncomeEntries'
import { Target, CheckCircle2, Flame, TrendingUp, Edit3, Save } from 'lucide-react'
import clsx from 'clsx'

interface JobGoal {
  jobId:     string
  dailyGoal: number
}

function useJobGoals() {
  const qc = useQueryClient()
  const { data: goals = [], isLoading } = useQuery<JobGoal[]>({
    queryKey: ['job_goals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('job_goals')
        .select('*')
        .eq('user_id', user.id)
      if (!data) return []
      return data.map((r: Record<string, unknown>) => ({
        jobId:     String(r.job_id    ?? ''),
        dailyGoal: Number(r.daily_goal ?? 0),
      }))
    },
    placeholderData: [],
  })

  const upsertGoal = useMutation({
    mutationFn: async (goal: JobGoal) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('job_goals').upsert({
        user_id:    user.id,
        job_id:     goal.jobId,
        daily_goal: goal.dailyGoal,
      }, { onConflict: 'user_id,job_id' })
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['job_goals'] }),
  })

  return { goals, isLoading, upsertGoal }
}

function GoalRow({ jobId, jobName, dailyEarned, dailyGoal, weeklyEarned, onSetGoal }: {
  jobId:        string
  jobName:      string
  dailyEarned:  number
  dailyGoal:    number
  weeklyEarned: number
  onSetGoal:    (goal: number) => void
}) {
  const [editing,  setEditing]  = useState(false)
  const [input,    setInput]    = useState(String(dailyGoal))

  const pct      = dailyGoal > 0 ? Math.min(100, (dailyEarned / dailyGoal) * 100) : 0
  const met      = dailyEarned >= dailyGoal && dailyGoal > 0
  const overGoal = dailyEarned > dailyGoal && dailyGoal > 0

  const barColor =
    overGoal ? 'bg-lumina-pulse' :
    pct > 75  ? 'bg-lumina-success' :
    pct > 40  ? 'bg-lumina-gold'    : 'bg-lumina-dim'

  return (
    <div className={clsx(
      'rounded-xl p-3 border transition-all',
      met ? 'border-lumina-success/30 bg-lumina-success/5' : 'border-lumina-border',
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {met
            ? <CheckCircle2 size={13} className="text-lumina-success flex-shrink-0" />
            : <Target size={13} className="text-lumina-dim flex-shrink-0" />
          }
          <span className="text-xs text-lumina-text font-semibold truncate">{jobName}</span>
        </div>
        <div className="flex items-center gap-2">
          {overGoal && <Flame size={11} className="text-lumina-pulse" />}
          {editing ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-lumina-dim">$</span>
              <input
                type="number"
                value={input}
                onChange={e => setInput(e.target.value)}
                className="w-16 bg-lumina-bg border border-lumina-pulse rounded px-1.5 py-0.5 text-[10px] font-mono text-lumina-text outline-none"
                autoFocus
              />
              <button onClick={() => { onSetGoal(Number(input)); setEditing(false) }}
                className="text-lumina-success hover:text-lumina-success/80">
                <Save size={10} />
              </button>
            </div>
          ) : (
            <button onClick={() => { setInput(String(dailyGoal)); setEditing(true) }}
              className="text-lumina-muted hover:text-lumina-dim transition-colors">
              <Edit3 size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-lumina-bg rounded-full h-2 mb-1.5 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-lumina-dim">
          ${dailyEarned.toFixed(0)} / ${dailyGoal > 0 ? dailyGoal.toFixed(0) : '—'} today
        </span>
        <span className={clsx('font-semibold', met ? 'text-lumina-success' : 'text-lumina-dim')}>
          {dailyGoal > 0 ? `${pct.toFixed(0)}%` : 'No goal set'}
        </span>
      </div>
      {weeklyEarned > 0 && (
        <div className="text-[10px] text-lumina-muted mt-0.5 flex items-center gap-1">
          <TrendingUp size={8} /> ${weeklyEarned.toFixed(0)} this week
        </div>
      )}
    </div>
  )
}

export default function GoalTracker() {
  const { data: jobs = [] }    = useJobs()
  const { data: earnings = [] } = useJobEarningsSummary()
  const { goals, upsertGoal }  = useJobGoals()

  const earningsMap = new Map(earnings.map(e => [e.jobId, e]))
  const goalsMap    = new Map(goals.map(g => [g.jobId, g]))

  // Total goal stats
  const totalDailyGoal    = Array.from(goalsMap.values()).reduce((s, g) => s + g.dailyGoal, 0)
  const totalDailyEarned  = earnings.reduce((s, e) => s + e.todayUsd, 0)
  const goalsMetToday     = jobs.filter(j => {
    const earned = earningsMap.get(j.id)?.todayUsd ?? 0
    const goal   = goalsMap.get(j.id)?.dailyGoal    ?? 0
    return goal > 0 && earned >= goal
  }).length
  const totalGoals = Array.from(goalsMap.values()).filter(g => g.dailyGoal > 0).length

  return (
    <div className="card-glow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-lumina-gold/10 border border-lumina-gold/30 flex items-center justify-center">
            <Target size={14} className="text-lumina-gold" />
          </div>
          <div>
            <div className="text-lumina-text font-semibold text-sm">Daily Revenue Goals</div>
            <div className="text-[10px] text-lumina-dim">
              {goalsMetToday}/{totalGoals} goals met today -{' '}
              ${totalDailyEarned.toFixed(0)} of ${totalDailyGoal.toFixed(0)} target
            </div>
          </div>
        </div>
        {goalsMetToday > 0 && (
          <div className="flex items-center gap-1 text-xs text-lumina-success font-semibold">
            <Flame size={12} />
            {goalsMetToday} crushed
          </div>
        )}
      </div>

      {/* Overall progress */}
      {totalDailyGoal > 0 && (
        <div className="mb-4">
          <div className="w-full bg-lumina-bg rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-lumina-pulse to-lumina-success transition-all duration-700"
              style={{ width: `${Math.min(100, (totalDailyEarned / totalDailyGoal) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-lumina-muted mt-1">
            <span>${totalDailyEarned.toFixed(0)} earned</span>
            <span>${totalDailyGoal.toFixed(0)} goal</span>
          </div>
        </div>
      )}

      {/* Per-job goals */}
      <div className="space-y-2">
        {jobs.slice(0, 8).map(job => {
          const earned = earningsMap.get(job.id)
          const goal   = goalsMap.get(job.id)
          return (
            <GoalRow
              key={job.id}
              jobId={job.id}
              jobName={job.name}
              dailyEarned={earned?.todayUsd    ?? (job.dailyProfit > 0 ? job.dailyProfit : 0)}
              dailyGoal={goal?.dailyGoal       ?? 0}
              weeklyEarned={earned?.weekUsd    ?? 0}
              onSetGoal={(g) => void upsertGoal.mutateAsync({
                jobId:     job.id,
                dailyGoal: g,
              })}
            />
          )
        })}
      </div>

      <div className="mt-3 text-[10px] text-lumina-muted text-center">
        Click the pencil icon to set a daily goal for any job
      </div>
    </div>
  )
}
