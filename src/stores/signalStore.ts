/**
 * Signal Store — Cross-component state for Edge Harmonizer signals
 *
 * When the Edge Harmonizer autonomous engine detects arbitrage opportunities,
 * it writes them here AND to Supabase. Both TwinEngine and PolymarketScriptTrader
 * can consume signals from this store for real-time cross-component coordination.
 *
 * Data flow:
 *   EdgeHarmonizer scan → signalStore.pushSignals() → Twin Engine / Poly Script Trader
 *                        → Supabase arbitrage_signals INSERT → Poly Script Trader (via query)
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { ArbitrageOpportunity } from '../lib/polymarket'

export interface ActiveSignal extends ArbitrageOpportunity {
  id: string
  timestamp: string
  source: 'edge-harmonizer' | 'manual' | 'external'
  status: 'active' | 'sent-to-twin' | 'sent-to-poly' | 'executed' | 'expired'
}

interface SignalState {
  // Active signals from latest Edge Harmonizer scan
  activeSignals: ActiveSignal[]
  // Last push timestamp
  lastPushAt: string | null
  // Total signals pushed in session
  totalPushed: number
  // Actions
  pushSignals: (signals: ArbitrageOpportunity[], source?: ActiveSignal['source']) => void
  markSentToTwin: (marketId: string) => void
  markSentToPoly: (marketId: string) => void
  markExecuted: (marketId: string) => void
  clearExpired: () => void
  // Persist top signals to Supabase arbitrage_signals table
  persistToSupabase: (signals: ArbitrageOpportunity[]) => Promise<void>
}

export const useSignalStore = create<SignalState>((set, get) => ({
  activeSignals: [],
  lastPushAt: null,
  totalPushed: 0,

  pushSignals: (signals, source = 'edge-harmonizer') => {
    const now = new Date().toISOString()
    const activeSignals: ActiveSignal[] = signals.map((s) => ({
      ...s,
      id: `sig-${s.marketId}-${Date.now()}`,
      timestamp: now,
      source,
      status: 'active' as const,
    }))

    set((state) => ({
      activeSignals,
      lastPushAt: now,
      totalPushed: state.totalPushed + signals.length,
    }))

    // Also persist to Supabase for Poly Script Trader
    if (signals.length > 0) {
      get().persistToSupabase(signals)
    }

    console.log(`[SignalStore] Pushed ${signals.length} signals from ${source}`)
  },

  markSentToTwin: (marketId) => {
    set((state) => ({
      activeSignals: state.activeSignals.map((s) =>
        s.marketId === marketId ? { ...s, status: 'sent-to-twin' as const } : s
      ),
    }))
  },

  markSentToPoly: (marketId) => {
    set((state) => ({
      activeSignals: state.activeSignals.map((s) =>
        s.marketId === marketId ? { ...s, status: 'sent-to-poly' as const } : s
      ),
    }))
  },

  markExecuted: (marketId) => {
    set((state) => ({
      activeSignals: state.activeSignals.map((s) =>
        s.marketId === marketId ? { ...s, status: 'executed' as const } : s
      ),
    }))
  },

  clearExpired: () => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    set((state) => ({
      activeSignals: state.activeSignals.filter(
        (s) => new Date(s.timestamp).getTime() > fiveMinAgo
      ),
    }))
  },

  persistToSupabase: async (signals) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const rows = signals.slice(0, 5).map((s) => ({
        type: 'polymarket-mt5' as const,
        description: `${s.question.slice(0, 100)} | ${s.direction} | edge ${s.edgePct.toFixed(1)}%`,
        expected_edge: s.edgePct / 100,
        confidence: s.confidence,
        required_capital: s.suggestedCapital,
        time_to_expiry: 3600,
        status: 'live' as const,
        polymarket_id: s.marketId,
        user_id: user?.id ?? null,
      }))

      const { error } = await supabase.from('arbitrage_signals').insert(rows)
      if (error) {
        console.warn('[SignalStore] Supabase persist error:', error.message)
      } else {
        console.log(`[SignalStore] Persisted ${rows.length} signals to arbitrage_signals`)
      }
    } catch (e) {
      console.warn('[SignalStore] Persist exception:', e)
    }
  },
}))
