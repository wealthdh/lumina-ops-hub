/**
 * MT5 Bridge — connects to the LuminaPulse REST bridge that the EA exposes.
 *
 * The LuminaPulse EA runs a lightweight HTTP server on port 8080 (configurable).
 * All calls are proxied through Vite's /api/mt5 proxy in dev, and through a
 * Vercel edge function in production.
 *
 * Matching LuminaPulse endpoints (unchanged from existing EA config):
 *   GET  /account          → MT5Account snapshot
 *   GET  /trades           → open trades array
 *   POST /order            → place market order (symbol, type, volume, sl, tp)
 *   POST /close/:ticket    → close specific trade
 *   GET  /kelly/:symbol    → Kelly-sized position recommendation
 *   GET  /history?days=N   → closed trade history
 */

import type { MT5Account, MT5Trade } from './types'

const BASE = '/api/mt5'
const API_KEY = import.meta.env.VITE_MT5_API_KEY as string

async function mtFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-LP-Api-Key': API_KEY,
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`MT5 bridge error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// ─── Account ────────────────────────────────────────────────────────────────

export async function getMT5Account(): Promise<MT5Account> {
  return mtFetch<MT5Account>('/account')
}

// ─── Trades ─────────────────────────────────────────────────────────────────

export async function getOpenTrades(): Promise<MT5Trade[]> {
  return mtFetch<MT5Trade[]>('/trades')
}

export async function getTradeHistory(days = 30): Promise<MT5Trade[]> {
  return mtFetch<MT5Trade[]>(`/history?days=${days}`)
}

// ─── Order execution ─────────────────────────────────────────────────────────

export interface OrderParams {
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  sl?: number
  tp?: number
  comment?: string
}

export async function placeOrder(params: OrderParams): Promise<{ ticket: number }> {
  return mtFetch<{ ticket: number }>('/order', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function closeTrade(ticket: number): Promise<{ success: boolean }> {
  return mtFetch<{ success: boolean }>(`/close/${ticket}`, { method: 'POST' })
}

// ─── Kelly sizing ────────────────────────────────────────────────────────────

export interface KellyResult {
  symbol: string
  kellyFraction: number
  recommendedVolume: number
  winRate: number
  avgWin: number
  avgLoss: number
}

export async function getKellySizing(symbol: string): Promise<KellyResult> {
  return mtFetch<KellyResult>(`/kelly/${symbol}`)
}

// ─── Mirror Edge (one-tap MT5 ↔ Polymarket sync) ────────────────────────────

export interface MirrorEdgeParams {
  polymarketId: string
  outcome: string           // 'YES' | 'NO'
  mt5Symbol: string
  hedgeDirection: 'buy' | 'sell'
  capitalUSDT: number
}

export async function executeMirrorEdge(params: MirrorEdgeParams): Promise<{
  mt5Ticket: number
  polyOrderId: string
  netEdge: number
}> {
  return mtFetch('/mirror-edge', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ─── PnL helpers ─────────────────────────────────────────────────────────────

export function formatPnl(value: number): string {
  const sign  = value >= 0 ? '+' : ''
  return `${sign}$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function pnlColor(value: number): string {
  if (value > 0)  return 'text-lumina-success'
  if (value < 0)  return 'text-lumina-danger'
  return 'text-lumina-dim'
}

// All MT5 data is live — fetched from bridge or Supabase cache.
// No mock/demo data in production build.
