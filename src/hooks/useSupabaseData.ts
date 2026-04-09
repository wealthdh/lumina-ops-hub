/**
 * All Supabase data hooks — single source of truth.
 * NO demo mode. NO mock fallbacks. Every hook queries Supabase directly.
 * AuthGate ensures auth.uid() is populated before any of these fire.
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, db, subscribeLeads, subscribeTaxPot } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type SynergyRow    = Database['public']['Tables']['synergy_links']['Row']
type AllocationRow = Database['public']['Tables']['allocation_rules']['Row']
type MCRow         = Database['public']['Tables']['montecarlo_results']['Row']
type PolyMarketRow = Database['public']['Tables']['poly_markets']['Row']
import type {
  DailyBriefing, Lead, TaxPot, SynergyLink,
  AllocationRule, MonteCarloResult, BriefingAlert,
} from '../lib/types'

// ─── Auth / current user ──────────────────────────────────────────────────────

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })
}

// ─── Daily Briefing ───────────────────────────────────────────────────────────

export function useTodayBriefing(): { data: DailyBriefing | null | undefined; isLoading: boolean } {
  const today = new Date().toISOString().slice(0, 10)   // YYYY-MM-DD

  const { data, isLoading } = useQuery({
    queryKey: ['briefings', today],
    queryFn: async (): Promise<DailyBriefing | null> => {
      const { data, error } = await db.briefings()
        .select('*')
        .eq('date', today)
        .maybeSingle()

      if (error) throw error
      if (!data) return null  // React Query v5 disallows undefined — must return null

      const briefing: DailyBriefing = {
        id:            data.id,
        date:          data.date,
        summary:       data.summary,
        audioUrl:      data.audio_url ?? undefined,
        topPriorities: data.top_priorities,
        alerts:        (data.alerts as BriefingAlert[]) ?? [],
        pnlSummary: {
          mt5:        data.pnl_mt5,
          polymarket: data.pnl_poly,
          total:      data.pnl_total,
        },
      }

      console.log('REAL DATA LOADED FROM SUPABASE: briefing', briefing.date)
      return briefing
    },
    refetchInterval: 60_000,
  })

  return { data, isLoading }
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export function useLeads() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['leads'],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await db.leads()
        .select('*')
        .order('score', { ascending: false })

      if (error) { console.warn('[useLeads] Supabase error:', error.message); return [] }
      if (!data) return []
      return data.map((r) => ({
        id:             r.id,
        name:           r.name,
        email:          r.email,
        company:        r.company ?? undefined,
        source:         r.source,
        score:          r.score,
        stage:          r.stage as Lead['stage'],
        estimatedValue: r.estimated_value,
        proposalUrl:    r.proposal_url ?? undefined,
        contractUrl:    r.contract_url ?? undefined,
        invoiceUrl:     r.invoice_url ?? undefined,
        loomUrl:        r.loom_url ?? undefined,
        createdAt:      r.created_at,
        lastContact:    r.last_contact,
      }))
    },
    refetchInterval: 30_000,
  })

  // Realtime subscription
  useEffect(() => {
    const ch = subscribeLeads(() => qc.invalidateQueries({ queryKey: ['leads'] }))
    return () => { void ch.unsubscribe() }
  }, [qc])

  return query
}

export function useUpdateLeadStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Lead['stage'] }) => {
      const { error } = await db.leads()
        .update({ stage, last_contact: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

// ─── Tax Pot ──────────────────────────────────────────────────────────────────

export function useTaxPot() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['tax-pot'],
    queryFn: async (): Promise<TaxPot | null> => {
      const { data, error } = await db.taxPot()
        .select('*')
        .maybeSingle()

      if (error) { console.warn('[useTaxPot] Supabase error:', error.message); return null }
      if (!data) return null

      return {
        balance:           data.balance,
        targetRate:        data.target_rate,
        quarterlyEstimate: data.quarterly_estimate,
        nextDueDate:       data.next_due_date,
        ytdIncome:         data.ytd_income,
        ytdSetAside:       data.ytd_set_aside,
        projectedTaxBill:  data.projected_tax_bill,
      }
    },
    refetchInterval: 60_000,
  })

  useEffect(() => {
    const ch = subscribeTaxPot(() => qc.invalidateQueries({ queryKey: ['tax-pot'] }))
    return () => { void ch.unsubscribe() }
  }, [qc])

  return query
}

// ─── Tax Entries ──────────────────────────────────────────────────────────────

export function useTaxEntries(limit = 20) {
  return useQuery({
    queryKey: ['tax-entries', limit],
    queryFn: async () => {
      const { data, error } = await db.taxEntries()
        .select('*')
        .order('date', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Synergy Links ────────────────────────────────────────────────────────────

export function useSynergies() {
  return useQuery({
    queryKey: ['synergies'],
    queryFn: async (): Promise<SynergyLink[]> => {
      const { data, error } = await supabase
        .from('synergy_links')
        .select('*')
        .order('value', { ascending: false })

      if (error) { console.warn('[useSynergies] Supabase error:', error.message); return [] }
      if (!data) return []
      return ((data) as SynergyRow[]).map((r) => ({
        id:          r.id,
        jobA:        r.job_a,
        jobB:        r.job_b,
        synergyType: r.synergy_type,
        value:       r.value,
        description: r.description,
        active:      r.active,
      }))
    },
    refetchInterval: 60_000,
  })
}

export function useToggleSynergy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('synergy_links').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['synergies'] }),
  })
}

// ─── Allocation Rules (PuLP output) ──────────────────────────────────────────

export function useAllocations() {
  return useQuery({
    queryKey: ['allocations'],
    queryFn: async (): Promise<AllocationRule[]> => {
      const { data, error } = await supabase
        .from('allocation_rules')
        .select('*')
        .order('recommended_allocation', { ascending: false })

      if (error) { console.warn('[useAllocations] Supabase error:', error.message); return [] }
      if (!data) return []
      return ((data) as AllocationRow[]).map((r) => ({
        jobId:                 r.job_id,
        jobName:               r.job_name,
        currentAllocation:     r.current_allocation,
        recommendedAllocation: r.recommended_allocation,
        expectedReturn:        r.expected_return,
        constraint:            r.constraint,
      }))
    },
  })
}

// ─── Monte Carlo Results ──────────────────────────────────────────────────────

export function useMonteCarloResults() {
  return useQuery({
    queryKey: ['montecarlo'],
    queryFn: async (): Promise<MonteCarloResult[]> => {
      const { data, error } = await supabase
        .from('montecarlo_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) { console.warn('[useMonteCarloResults] Supabase error:', error.message); return [] }
      if (!data) return []
      return ((data) as MCRow[]).map((r) => ({
        scenario:    r.scenario,
        p10:         r.p10,
        p25:         r.p25,
        p50:         r.p50,
        p75:         r.p75,
        p90:         r.p90,
        maxDrawdown: r.max_drawdown,
        sharpe:      r.sharpe,
        runs:        r.runs,
      }))
    },
  })
}

// ─── Arbitrage Signals ────────────────────────────────────────────────────────

export function useArbitrageSignals() {
  return useQuery({
    queryKey: ['arbitrage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arbitrage_signals')
        .select('*')
        .eq('status', 'live')
        .order('expected_edge', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    refetchInterval: 30_000,
  })
}

// ─── Polymarket Markets (cached in Supabase) ──────────────────────────────────

export function usePolyMarkets() {
  return useQuery({
    queryKey: ['poly-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('poly_markets')
        .select('*')
        .eq('active', true)
        .order('volume', { ascending: false })
        .limit(20)

      if (error) throw error

      return ((data ?? []) as PolyMarketRow[]).map((r) => ({
        id:        r.id,
        question:  r.question,
        slug:      r.slug,
        endDate:   r.end_date,
        volume:    r.volume,
        liquidity: r.liquidity,
        outcomes:  (r.outcomes ?? []) as { name: string; price: number; clobTokenId: string }[],
        category:  r.category,
        active:    r.active,
      }))
    },
    refetchInterval: 120_000,
  })
}

// ─── Polymarket Positions ─────────────────────────────────────────────────────

export function usePolyPositions() {
  return useQuery({
    queryKey: ['poly-positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('poly_positions')
        .select('*')
        .order('unrealized_pnl', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    refetchInterval: 30_000,
  })
}

// ─── Jobs (re-export from useJobs for convenience) ────────────────────────────
export { useJobs, useJobStats, useUpdateJobStatus, useJobsRealtime } from './useJobs'
