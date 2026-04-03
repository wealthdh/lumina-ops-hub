import { useQuery, useMutation } from '@tanstack/react-query'
import { getMT5Account, getOpenTrades, placeOrder, closeTrade } from '../lib/mt5Bridge'
import { supabase } from '../lib/supabase'
import type { OrderParams } from '../lib/mt5Bridge'
import type { MT5Account, MT5Trade } from '../lib/types'

// ─── Supabase cache fallback for when the MT5 bridge isn't running ───────────

async function getMT5AccountWithFallback(): Promise<MT5Account> {
  try {
    return await getMT5Account()
  } catch {
    // Bridge not running — try Supabase cached snapshot
    const { data } = await supabase
      .from('mt5_accounts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      return {
        accountId:   data.account_id,
        balance:     data.balance,
        equity:      data.equity,
        margin:      data.margin,
        freeMargin:  data.free_margin,
        marginLevel: data.margin_level,
        profit:      data.profit,
        dayPnl:      data.day_pnl,
        weekPnl:     data.week_pnl,
        monthPnl:    data.month_pnl,
        openTrades:  [],
      }
    }
    throw new Error('MT5 bridge offline and no Supabase cache found')
  }
}

async function getOpenTradesWithFallback(): Promise<MT5Trade[]> {
  try {
    return await getOpenTrades()
  } catch {
    // Bridge not running — try Supabase cached trades
    const { data } = await supabase
      .from('mt5_trades')
      .select('*')
      .order('open_time', { ascending: false })
      .limit(20)

    if (data && data.length > 0) {
      return data.map(r => ({
        ticket:       r.ticket,
        symbol:       r.symbol,
        type:         r.type as 'buy' | 'sell',
        volume:       r.volume,
        openPrice:    r.open_price,
        currentPrice: r.current_price,
        profit:       r.profit,
        openTime:     r.open_time,
        sl:           Number(r.sl ?? 0),
        tp:           Number(r.tp ?? 0),
      }))
    }
    return []
  }
}

// ─── Account ─────────────────────────────────────────────────────────────────

export function useMT5Account() {
  return useQuery({
    queryKey: ['mt5', 'account'],
    queryFn: getMT5AccountWithFallback,
    refetchInterval: 10_000,
    staleTime:       5_000,
    retry: 1,
  })
}

// ─── Open trades ──────────────────────────────────────────────────────────────

export function useMT5Trades() {
  return useQuery({
    queryKey: ['mt5', 'trades'],
    queryFn: getOpenTradesWithFallback,
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 1,
  })
}

// ─── Place order ──────────────────────────────────────────────────────────────

export function usePlaceOrder() {
  return useMutation({
    mutationFn: (params: OrderParams) => placeOrder(params),
  })
}

// ─── Close trade ──────────────────────────────────────────────────────────────

export function useCloseTrade() {
  return useMutation({
    mutationFn: (ticket: number) => closeTrade(ticket),
  })
}
