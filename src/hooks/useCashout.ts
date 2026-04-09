/**
 * useCashout.ts — React Query hooks for cashout data.
 * All hooks require AuthGate to be satisfied (auth.uid() populated).
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getTransactionHistory,
  getDailyLimitInfo,
  getPendingApprovals,
  subscribeCashoutTransactions,
  type CashoutTransaction,
  type DailyLimitInfo,
  type ApprovalRecord,
} from '../lib/cashout'

// ─── Transaction history ──────────────────────────────────────────────────────

export function useTransactionHistory(limit = 50) {
  const qc = useQueryClient()

  const query = useQuery<CashoutTransaction[], Error>({
    queryKey:     ['cashout-history', limit],
    queryFn:      () => getTransactionHistory(limit),
    staleTime:    30_000,
    refetchInterval: 60_000,
  })

  // Realtime: re-fetch whenever a row changes
  useEffect(() => {
    const ch = subscribeCashoutTransactions(() => {
      void qc.invalidateQueries({ queryKey: ['cashout-history'] })
      void qc.invalidateQueries({ queryKey: ['cashout-daily'] })
    })
    return () => { void ch.unsubscribe() }
  }, [qc])

  return query
}

// ─── Daily limit / balance remaining ─────────────────────────────────────────

export function useDailyLimitInfo() {
  return useQuery<DailyLimitInfo, Error>({
    queryKey:        ['cashout-daily'],
    queryFn:         getDailyLimitInfo,
    staleTime:       10_000,
    refetchInterval: 30_000,
  })
}

// ─── Pending approvals (user's own) ──────────────────────────────────────────

export function usePendingApprovals() {
  return useQuery<ApprovalRecord[], Error>({
    queryKey:        ['cashout-approvals'],
    queryFn:         getPendingApprovals,
    staleTime:       15_000,
    refetchInterval: 30_000,
  })
}

// ─── Aggregated stats (for dashboard badges) ─────────────────────────────────

export function useCashoutStats() {
  const { data: history = [] } = useTransactionHistory(100)
  const { data: daily }        = useDailyLimitInfo()

  const totalWithdrawn   = history.filter(t => t.status === 'completed').reduce((s, t) => s + t.amount, 0)
  const pendingCount     = history.filter(t => t.status === 'pending' || t.status === 'processing').length
  const needsApproval    = history.filter(t => t.status === 'needs_approval').length
  const lastCompleted    = history.find(t => t.status === 'completed')

  return {
    totalWithdrawn,
    pendingCount,
    needsApproval,
    lastCompleted,
    dailyRemaining: daily?.remaining ?? null,
    dailyUsed:      daily?.usedToday ?? null,
  }
}
