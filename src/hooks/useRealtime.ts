import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeMT5Account, subscribeArbitrageSignals, subscribeTaxPot, subscribeLeads } from '../lib/supabase'

/**
 * Master realtime subscription hook — no demo mode, always live.
 * Call once at the app root (inside AuthGate so auth.uid() is available).
 */
export function useRealtimeSubscriptions(accountId?: string) {
  const qc = useQueryClient()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const channels = [
      accountId
        ? subscribeMT5Account(accountId, () => {
            qc.invalidateQueries({ queryKey: ['mt5', 'account'] })
            qc.invalidateQueries({ queryKey: ['mt5', 'trades'] })
          })
        : null,

      subscribeArbitrageSignals(() => {
        qc.invalidateQueries({ queryKey: ['arbitrage'] })
      }),

      subscribeTaxPot(() => {
        qc.invalidateQueries({ queryKey: ['tax-pot'] })
      }),

      subscribeLeads(() => {
        qc.invalidateQueries({ queryKey: ['leads'] })
      }),
    ].filter(Boolean)

    return () => {
      channels.forEach((ch) => { void ch?.unsubscribe() })
      initialized.current = false
    }
  }, [qc, accountId])
}

/**
 * Ticker-speed price feed via Supabase Realtime broadcast.
 * MT5 bridge pushes ticks to the 'ticks' broadcast channel.
 */
export function useTickerFeed(
  _symbols: string[],
  _onTick: (symbol: string, bid: number, ask: number) => void
) {
  // No-op until MT5 bridge is broadcasting to Supabase realtime channel.
  // Wire up when bridge is live:
  //   supabase.channel('ticks').on('broadcast', { event: 'tick' }, handler).subscribe()
}
