/**
 * useIncomeEntries — Real income tracking hooks
 *
 * Reads from Supabase `income_entries` table.
 *
 * Actual DB columns (verified against live schema):
 *   id, user_id, job_id, source, amount, description, reference_id, entry_date, created_at
 *
 * The RPC get_job_earnings_summary returns:
 *   job_id, today_total, week_total, month_total, all_time_total
 */
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type IncomeSource = 'stripe' | 'mt5' | 'polymarket' | 'manual' | 'crypto' | 'affiliate' | 'consulting'

export interface IncomeEntry {
  id:          string
  jobId:       string
  amountUsd:   number
  source:      IncomeSource
  sourceRef:   string | null
  description: string | null
  earnedAt:    string   // maps to entry_date (date string e.g. "2026-04-01")
}

export interface JobEarningsSummary {
  jobId:       string
  todayUsd:    number
  weekUsd:     number
  monthUsd:    number
  allTimeUsd:  number
  lastEntryAt: string | null
}

// ─── Fetch all entries for a job ───────────────────────────────────────────────

export function useJobIncomeEntries(jobId: string, limit = 50) {
  return useQuery<IncomeEntry[]>({
    queryKey: ['income_entries', jobId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .from('income_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_id', jobId)
        .order('entry_date', { ascending: false })   // ← real column name
        .limit(limit)

      if (error) { console.warn('income_entries fetch error:', error.message); return [] }
      return (data ?? []).map((r: Record<string, unknown>): IncomeEntry => ({
        id:          String(r.id          ?? ''),
        jobId:       String(r.job_id      ?? ''),
        amountUsd:   Number(r.amount      ?? 0),        // ← real column: amount
        source:      (r.source as IncomeSource) ?? 'manual',
        sourceRef:   r.reference_id ? String(r.reference_id) : null, // ← real column: reference_id
        description: r.description ? String(r.description) : null,
        earnedAt:    String(r.entry_date  ?? ''),       // ← real column: entry_date
      }))
    },
    placeholderData: [],
    staleTime: 30_000,
  })
}

// ─── Earnings summary per job (today / week / month / all-time) ───────────────

export function useJobEarningsSummary() {
  return useQuery<JobEarningsSummary[]>({
    queryKey: ['job_earnings_summary'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      // Use the SQL function we created in income_schema.sql
      const { data, error } = await supabase
        .rpc('get_job_earnings_summary', { p_user_id: user.id })

      if (error) {
        // Fallback: compute from income_entries directly using real column names
        console.warn('get_job_earnings_summary rpc error, falling back:', error.message)
        const { data: entries } = await supabase
          .from('income_entries')
          .select('job_id, amount, entry_date')      // ← real column names
          .eq('user_id', user.id)

        if (!entries) return []

        const now = new Date()
        const todayStr  = now.toISOString().slice(0, 10)
        const weekStart  = new Date(now.getTime() -  7 * 86_400_000).toISOString().slice(0, 10)
        const monthStr   = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

        const map = new Map<string, JobEarningsSummary>()
        for (const e of entries as Array<{ job_id: string; amount: number; entry_date: string }>) {
          const s = map.get(e.job_id) ?? { jobId: e.job_id, todayUsd: 0, weekUsd: 0, monthUsd: 0, allTimeUsd: 0, lastEntryAt: null }
          const amt = Number(e.amount)
          const d   = String(e.entry_date).slice(0, 10)
          s.allTimeUsd += amt
          if (d >= monthStr)  s.monthUsd += amt
          if (d >= weekStart) s.weekUsd  += amt
          if (d === todayStr) s.todayUsd += amt
          if (!s.lastEntryAt || d > s.lastEntryAt) s.lastEntryAt = d
          map.set(e.job_id, s)
        }
        return Array.from(map.values())
      }

      // RPC returns: job_id, today_total, week_total, month_total, all_time_total
      return (data ?? []).map((r: Record<string, unknown>) => ({
        jobId:       String(r.job_id),
        todayUsd:    Number(r.today_total   ?? 0),   // ← real RPC field name
        weekUsd:     Number(r.week_total    ?? 0),   // ← real RPC field name
        monthUsd:    Number(r.month_total   ?? 0),   // ← real RPC field name
        allTimeUsd:  Number(r.all_time_total ?? 0),  // ← real RPC field name
        lastEntryAt: null,
      }))
    },
    placeholderData: [],
    staleTime: 30_000,
  })
}

// ─── UGC / Creative earnings (entries with creative_id, no job_id) ────────────

export function useUGCEarnings() {
  return useQuery({
    queryKey: ['ugc_earnings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { todayUsd: 0, weekUsd: 0, monthUsd: 0, allTimeUsd: 0, count: 0 }

      const { data } = await supabase
        .from('income_entries')
        .select('amount, entry_date')
        .eq('user_id', user.id)
        .not('creative_id', 'is', null)

      const now = new Date()
      const todayStr  = now.toISOString().slice(0, 10)
      const weekStart = new Date(now.getTime() -  7 * 86_400_000).toISOString().slice(0, 10)
      const monthStr  = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

      let todayUsd = 0, weekUsd = 0, monthUsd = 0, allTimeUsd = 0
      for (const e of (data ?? []) as Array<{ amount: number; entry_date: string }>) {
        const amt = Number(e.amount)
        const d   = String(e.entry_date).slice(0, 10)
        allTimeUsd += amt
        if (d >= monthStr)  monthUsd += amt
        if (d >= weekStart) weekUsd  += amt
        if (d === todayStr) todayUsd += amt
      }

      return { todayUsd, weekUsd, monthUsd, allTimeUsd, count: (data ?? []).length }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// ─── Total portfolio summary (jobs + UGC combined) ───────────────────────────

export function usePortfolioEarnings() {
  const { data: summaries = [] } = useJobEarningsSummary()
  const { data: ugc } = useUGCEarnings()
  return {
    todayTotal:   summaries.reduce((s, e) => s + e.todayUsd,   0) + (ugc?.todayUsd   ?? 0),
    weekTotal:    summaries.reduce((s, e) => s + e.weekUsd,    0) + (ugc?.weekUsd    ?? 0),
    monthTotal:   summaries.reduce((s, e) => s + e.monthUsd,   0) + (ugc?.monthUsd   ?? 0),
    allTimeTotal: summaries.reduce((s, e) => s + e.allTimeUsd, 0) + (ugc?.allTimeUsd ?? 0),
  }
}

// ─── Log a new income entry ────────────────────────────────────────────────────

interface LogIncomeParams {
  jobId:       string
  amountUsd:   number
  source:      IncomeSource
  sourceRef?:  string
  description?: string
  earnedAt?:   string  // ISO string or date string — defaults to today
}

export function useLogIncome() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: LogIncomeParams) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // entry_date is a DATE column — extract just the date portion
      const entryDate = params.earnedAt
        ? String(params.earnedAt).slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      const { error } = await supabase.from('income_entries').insert({
        user_id:      user.id,
        job_id:       params.jobId,
        amount:       params.amountUsd,          // ← real column: amount
        source:       params.source,
        reference_id: params.sourceRef ?? null,  // ← real column: reference_id
        description:  params.description ?? null,
        entry_date:   entryDate,                 // ← real column: entry_date (DATE)
      })

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['income_entries'] })
      void qc.invalidateQueries({ queryKey: ['job_earnings_summary'] })
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// ─── Realtime subscription to income_entries ──────────────────────────────────

export function useIncomeRealtime() {
  const qc = useQueryClient()

  return {
    subscribe: () => {
      const channel = supabase
        .channel(`income_entries_changes_${Date.now()}`)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'income_entries',
        }, () => {
          void qc.invalidateQueries({ queryKey: ['income_entries'] })
          void qc.invalidateQueries({ queryKey: ['job_earnings_summary'] })
        })
        .subscribe()

      return () => { void supabase.removeChannel(channel) }
    },
  }
}

// ─── Hook version of realtime (auto-subscribes on mount) ─────────────────────

export function useIncomeRealtimeSubscription() {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`income_rt_${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'income_entries' }, () => {
        void qc.invalidateQueries({ queryKey: ['income_entries'] })
        void qc.invalidateQueries({ queryKey: ['job_earnings_summary'] })
        void qc.invalidateQueries({ queryKey: ['jobs'] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [qc])
}
