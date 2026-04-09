/**
 * Polymarket Data Bridge
 * Uses Polymarket's CLOB API + Gamma API for market data.
 * Jon-Becker repo indexer is used server-side (Edge Function) to pull
 * historical 86M trade dataset for model training.
 */

import type { PolymarketMarket, PolymarketOutcome, PolymarketPosition } from './types'

const CLOB_URL  = import.meta.env.VITE_POLYMARKET_API_URL  ?? 'https://clob.polymarket.com'
const GAMMA_URL = import.meta.env.VITE_POLYMARKET_GAMMA_URL ?? 'https://gamma-api.polymarket.com'

async function polyFetch<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Polymarket ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

// ─── Markets ─────────────────────────────────────────────────────────────────

export async function getTopMarkets(limit = 20): Promise<PolymarketMarket[]> {
  const raw = await polyFetch<{ markets: unknown[] }>(
    GAMMA_URL,
    `/markets?limit=${limit}&order=volume&ascending=false&active=true`,
  )
  return (raw.markets ?? []).map(normalizeMarket)
}

export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  const raw = await polyFetch<{ markets: unknown[] }>(
    GAMMA_URL,
    `/markets?search=${encodeURIComponent(query)}&active=true`,
  )
  return (raw.markets ?? []).map(normalizeMarket)
}

export async function getMarketById(id: string): Promise<PolymarketMarket> {
  const raw = await polyFetch<unknown>(GAMMA_URL, `/markets/${id}`)
  return normalizeMarket(raw)
}

// ─── Order book / price ──────────────────────────────────────────────────────

export interface OrderBook {
  bids: { price: number; size: number }[]
  asks: { price: number; size: number }[]
  spread: number
  midpoint: number
}

export async function getOrderBook(tokenId: string): Promise<OrderBook> {
  const raw = await polyFetch<{
    bids: { price: string; size: string }[]
    asks: { price: string; size: string }[]
  }>(CLOB_URL, `/book?token_id=${tokenId}`)

  const bids = (raw.bids ?? []).map((b) => ({ price: +b.price, size: +b.size }))
  const asks = (raw.asks ?? []).map((a) => ({ price: +a.price, size: +a.size }))
  const bestBid = bids[0]?.price ?? 0
  const bestAsk = asks[0]?.price ?? 0

  return {
    bids,
    asks,
    spread: bestAsk - bestBid,
    midpoint: (bestBid + bestAsk) / 2,
  }
}

// ─── Positions ───────────────────────────────────────────────────────────────

export async function getUserPositions(address: string): Promise<PolymarketPosition[]> {
  const raw = await polyFetch<unknown[]>(
    CLOB_URL,
    `/positions?user=${address}`,
  )
  return (raw ?? []).map(normalizePosition)
}

// ─── Arbitrage detection ─────────────────────────────────────────────────────

export interface ArbitrageOpportunity {
  marketId: string
  question: string
  polyPrice: number          // 0–1 probability
  mt5ImpliedProb: number     // derived from MT5 move / Kelly
  edgePct: number
  direction: 'buy-poly' | 'sell-poly'
  confidence: number
  suggestedCapital: number
}

/**
 * Compare Polymarket YES prices against MT5 Kelly-implied probabilities.
 * If poly price < MT5 implied prob by threshold → buy poly YES, hedge on MT5.
 */
export function detectArbitrage(
  markets: PolymarketMarket[],
  mt5ImpliedProbs: Record<string, number>,
  threshold = 0.04,
): ArbitrageOpportunity[] {
  const results: ArbitrageOpportunity[] = []

  for (const m of markets) {
    const yesOutcome = m.outcomes.find((o) => o.name === 'Yes' || o.name === 'YES')
    if (!yesOutcome) continue

    const polyPrice = yesOutcome.price
    const implied   = mt5ImpliedProbs[m.id]
    if (implied == null) continue

    const edge = implied - polyPrice
    if (Math.abs(edge) < threshold) continue

    results.push({
      marketId:       m.id,
      question:       m.question,
      polyPrice,
      mt5ImpliedProb: implied,
      edgePct:        edge * 100,
      direction:      edge > 0 ? 'buy-poly' : 'sell-poly',
      confidence:     Math.min(100, Math.abs(edge) * 500),
      suggestedCapital: Math.min(5000, Math.abs(edge) * 10000),
    })
  }

  return results.sort((a, b) => Math.abs(b.edgePct) - Math.abs(a.edgePct))
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeMarket(raw: unknown): PolymarketMarket {
  const r = raw as Record<string, unknown>
  const tokens = (r.tokens ?? r.outcomes ?? []) as Record<string, unknown>[]
  const outcomes: PolymarketOutcome[] = tokens.map((t) => ({
    name:         String(t.outcome ?? t.name ?? ''),
    price:        Number(t.price ?? 0),
    clobTokenId:  String(t.token_id ?? t.clobTokenId ?? ''),
  }))

  return {
    id:        String(r.id ?? r.conditionId ?? r.condition_id ?? ''),
    question:  String(r.question ?? r.title ?? ''),
    slug:      String(r.slug ?? ''),
    endDate:   String(r.endDate ?? r.end_date ?? ''),
    volume:    Number(r.volume ?? r.volumeNum ?? 0),
    liquidity: Number(r.liquidity ?? r.liquidityNum ?? 0),
    outcomes,
    category:  String(r.category ?? ''),
    active:    Boolean(r.active ?? true),
  }
}

function normalizePosition(raw: unknown): PolymarketPosition {
  const r = raw as Record<string, unknown>
  return {
    marketId:      String(r.market_id ?? r.marketId ?? ''),
    question:      String(r.question ?? ''),
    outcome:       String(r.outcome ?? ''),
    shares:        Number(r.size ?? r.shares ?? 0),
    avgPrice:      Number(r.avg_price ?? r.avgPrice ?? 0),
    currentPrice:  Number(r.current_price ?? r.currentPrice ?? 0),
    unrealizedPnl: Number(r.unrealized_pnl ?? r.unrealizedPnl ?? 0),
  }
}

// All Polymarket data is live from Gamma/CLOB APIs + Supabase poly_markets cache.
// No mock data in production build.
