import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, db, subscribeJobs } from '../lib/supabase'
import type { Job, JobStatus } from '../lib/types'
// ─── Fetch real earnings summary from income_entries ─────────────────────────

async function fetchRealEarnings(userId: string): Promise<Map<string, { today: number; month: number }>> {
  const map = new Map<string, { today: number; month: number }>()
  try {
    const { data, error } = await supabase
      .rpc('get_job_earnings_summary', { p_user_id: userId })

    if (error || !data) return map

    for (const row of (data as Array<Record<string, unknown>>)) {
      map.set(row.job_id as string, {
        today: Number(row.today_total  ?? 0),
        month: Number(row.month_total  ?? 0),
      })
    }
  } catch {
    // income_schema.sql might not be run yet — silently ignore
  }
  return map
}

// ─── Fetch all jobs — merges real income data when available ──────────────────

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async (): Promise<Job[]> => {
      // Get auth user (needed for real earnings)
      const { data: { user } } = await supabase.auth.getUser()

      // Fetch real earnings in parallel
      const realEarnings = user ? await fetchRealEarnings(user.id) : new Map()

      // Merge real earnings into job: if income_entries has data, use it; otherwise keep DB value
      function mergeEarnings(job: Job): Job {
        const real = realEarnings.get(job.id)
        if (!real || (real.today === 0 && real.month === 0)) return job
        return {
          ...job,
          dailyProfit:   real.today,
          monthlyProfit: real.month,
          // Recalculate projectedMonthly as 1.2× current month pace
          projectedMonthly: Math.round(real.month * 1.2),
        }
      }

      try {
        const { data, error } = await db.jobs()
          .select(`*, auto_tasks(*)`)
          .order('monthly_profit', { ascending: false })

        if (error) {
          console.warn('[useJobs] Supabase error:', error.message)
          return []
        }

        const rows = data ?? []
        if (rows.length === 0) {
          // No jobs in DB — return empty. Run supabase/seed_COMPLETE.sql to load jobs.
          console.warn('[useJobs] No jobs in Supabase — empty state shown. Run supabase/seed_COMPLETE.sql.')
          return []
        }

        const jobs: Job[] = rows.map((row) => ({
          id:               row.id,
          name:             row.name,
          category:         row.category as Job['category'],
          status:           row.status as JobStatus,
          dailyProfit:      row.daily_profit   ?? 0,
          monthlyProfit:    row.monthly_profit ?? 0,
          projectedMonthly: row.projected_monthly ?? 0,
          synergyScore:     row.synergy_score ?? 0,
          riskScore:        row.risk_score    ?? 0,
          roi:              row.roi            ?? 0,
          cashOutUrl:       row.cash_out_url  ?? undefined,
          cloneUrl:         row.clone_url     ?? undefined,
          tasks:            (row.auto_tasks ?? []).map((t: Record<string, unknown>) => ({
            id:               t.id,
            jobId:            t.job_id,
            title:            t.title,
            priority:         t.priority,
            status:           t.status,
            assignedTo:       t.assigned_to    ?? undefined,
            dueAt:            t.due_at         ?? undefined,
            estimatedMinutes: t.estimated_minutes ?? undefined,
          })),
          createdAt:    row.created_at,
          lastActivity: row.last_activity,
        })).map(mergeEarnings)   // ← overlay real income on each job

        return jobs
      } catch (err) {
        console.warn('[useJobs] Unexpected error:', err)
        return []
      }
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
}

// ─── Update job status ────────────────────────────────────────────────────────

export function useUpdateJobStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const { error } = await db.jobs().update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

// ─── Clone job ────────────────────────────────────────────────────────────────

export function useCloneJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (job: Job) => {
      // Get current user to set user_id for cloned job
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id ?? '0ce62691-721c-4eba-bf3e-052731d9839b'

      const { data, error } = await supabase
        .from('ops_jobs')
        .insert({
          user_id: userId,
          name: `${job.name} (Clone)`,
          status: 'paused',
          daily_profit: 0,
          monthly_profit: job.monthlyProfit,
          projected_monthly: job.projectedMonthly,
          roi: 0,
          risk_score: job.riskScore,
          synergy_score: job.synergyScore,
          description: job.description,
          category: job.category,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

// ─── Realtime subscription ────────────────────────────────────────────────────

export function useJobsRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = subscribeJobs(() => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
    })
    return () => { void channel.unsubscribe() }
  }, [qc])
}

// ─── Aggregate stats ──────────────────────────────────────────────────────────

export function useJobStats(jobs: Job[]) {
  const activeJobs = jobs.filter((j) => j.status === 'active' || j.status === 'scaling')
  return {
    totalMonthly:     jobs.reduce((s, j) => s + j.monthlyProfit, 0),
    totalProjected:   jobs.reduce((s, j) => s + j.projectedMonthly, 0),
    totalDaily:       jobs.reduce((s, j) => s + j.dailyProfit, 0),
    activeDailyTotal: activeJobs.reduce((s, j) => s + j.dailyProfit, 0),
    activeCount:      activeJobs.length,
    totalTasks:       jobs.reduce((s, j) => s + j.tasks.length, 0),
    criticalTasks:    jobs.flatMap((j) => j.tasks).filter((t) => t.priority === 'critical' && t.status !== 'done').length,
    avgRiskScore:     jobs.length ? jobs.reduce((s, j) => s + j.riskScore, 0) / jobs.length : 0,
    avgSynergyScore:  jobs.length ? jobs.reduce((s, j) => s + j.synergyScore, 0) / jobs.length : 0,
  }
}
