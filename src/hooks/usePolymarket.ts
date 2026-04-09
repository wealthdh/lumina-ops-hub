/**
 * usePolymarket — Live Polymarket data via public CLOB API
 *
 * Polymarket's CLOB API is public — no API key needed for reads.
 * Docs: https://docs.polymarket.com
 */
import { useQuery } from '@tanstack/react-query'

const POLY_API   = 'https://clob.polymarket.com'
const GAMMA_API  = 'https://gamma-api.polymarket.com'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PolyMarket {
  id:            string      // alias for conditionId — used as React key
  conditionId:   string
  question:      string
  endDateIso:    string
  active:        boolean
  closed:        boolean
  liquidity:     number      // USD
  volume:        number      // USD total traded
  category:      string      // e.g. 'Politics', 'Sports', 'Crypto'
  outcomes:      PolyOutcome[]
}

export interface PolyOutcome {
  name:          string
  tokenId:       string
  price:         number      // 0–1 implied probability
  priceChange24h: number     // delta in 24h
}

export interface PolyPosition {
  conditionId:   string
  question:      string
  outcome:       string
  size:          number     // USD
  avgPrice:      number
  currentPrice:  number
  pnl:           number
  status:        'open' | 'won' | 'lost'
}

// ─── Fetch active markets ──────────────────────────────────────────────────────

export function usePolyMarkets(limit = 10) {
  return useQuery<PolyMarket[]>({
    queryKey: ['poly_markets', limit],
    queryFn: async () => {
      // Try Gamma API first — more reliable market discovery, correct field names
      const gammaRes = await fetch(
        `${GAMMA_API}/markets?active=true&closed=false&limit=${limit}&sort_by=volume_num&order=DESC`,
        { headers: { 'Accept': 'application/json' } }
      ).catch(() => null)

      let rows: Array<Record<string, unknown>> = []

      if (gammaRes?.ok) {
        const json = await gammaRes.json() as unknown
        const raw = Array.isArray(json) ? json : ((json as { data?: unknown }).data ?? [])
        rows = (raw as Array<Record<string, unknown>>).slice(0, limit)
      } else {
        // Fallback: CLOB API
        const clobRes = await fetch(
          `${POLY_API}/markets?active=true&closed=false&limit=${limit}&sort_by=volume&order=DESC`,
          { headers: { 'Accept': 'application/json' } }
        )
        if (!clobRes.ok) throw new Error(`Polymarket API error: ${clobRes.status}`)
        const json = await clobRes.json() as { data?: unknown[] }
        rows = ((json.data ?? json as unknown[]) as Array<Record<string, unknown>>).slice(0, limit)
      }

      return rows.map(m => {
        const cid = String(m.condition_id ?? m.conditionId ?? '')
        // Gamma uses volume_num / liquidity_num; CLOB uses volume / liquidity
        const vol = Number(m.volume_num ?? m.volume ?? 0)
        const liq = Number(m.liquidity_num ?? m.liquidity ?? 0)
        // Gamma tokens array — each token has outcome, price fields
        const tokens = Array.isArray(m.tokens)
          ? (m.tokens as Array<Record<string, unknown>>)
          : []
        return {
          id:           cid,
          conditionId:  cid,
          question:     String(m.question ?? ''),
          endDateIso:   String(m.end_date_iso ?? m.endDateIso ?? ''),
          active:       Boolean(m.active),
          closed:       Boolean(m.closed),
          liquidity:    liq,
          volume:       vol,
          category:     String(m.category ?? (Array.isArray(m.tags) ? (m.tags as string[])[0] : '') ?? 'General'),
          outcomes:     tokens.map(t => ({
            name:           String(t.outcome ?? t.name ?? ''),
            tokenId:        String(t.token_id ?? t.tokenId ?? ''),
            price:          Number(t.price ?? 0),
            priceChange24h: Number(t.price_change_24h ?? 0),
          })),
        }
      })
    },
    staleTime:    60_000,    // refresh every 60s
    retry:        2,
    // Don't crash the whole dashboard if Polymarket is down
    throwOnError: false,
  })
}

// ─── Fetch a single market by conditionId ─────────────────────────────────────

export function usePolyMarket(conditionId: string) {
  return useQuery<PolyMarket | null>({
    queryKey: ['poly_market', conditionId],
    queryFn: async () => {
      if (!conditionId) return null
      const res = await fetch(`${POLY_API}/markets/${conditionId}`, {
        headers: { 'Accept': 'application/json' }
      })
      if (!res.ok) return null
      const m = await res.json() as Record<string, unknown>
      const cid = String(m.condition_id ?? conditionId)
      return {
        id:           cid,
        conditionId:  cid,
        question:     String(m.question ?? ''),
        endDateIso:   String(m.end_date_iso ?? ''),
        active:       Boolean(m.active),
        closed:       Boolean(m.closed),
        liquidity:    Number(m.liquidity ?? 0),
        volume:       Number(m.volume     ?? 0),
        category:     String(m.category ?? 'General'),
        outcomes:     Array.isArray(m.tokens)
          ? (m.tokens as Array<Record<string, unknown>>).map(t => ({
              name:           String(t.outcome ?? t.name ?? ''),
              tokenId:        String(t.token_id ?? t.tokenId ?? ''),
              price:          Number(t.price ?? 0),
              priceChange24h: Number(t.price_change_24h ?? 0),
            }))
          : [],
      }
    },
    staleTime:    30_000,
    enabled:      !!conditionId,
    throwOnError: false,
  })
}

// ─── Market-wide stats ─────────────────────────────────────────────────────────

export function usePolyStats() {
  const { data: markets = [] } = usePolyMarkets(20)
  return {
    totalVolume:   markets.reduce((s, m) => s + m.volume,    0),
    totalLiquidity:markets.reduce((s, m) => s + m.liquidity, 0),
    activeMarkets: markets.filter(m => m.active && !m.closed).length,
    topMarket:     markets[0] ?? null,
  }
}

// ─── BNB/Crypto prices from CoinGecko (public) ────────────────────────────────

export interface CryptoPrices {
  bnb:      number
  eth:      number
  matic:    number
  btc:      number
  updatedAt: Date
}

export function useCryptoPrices() {
  return useQuery<CryptoPrices>({
    queryKey: ['crypto_prices'],
    queryFn: async () => {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin,ethereum,matic-network,bitcoin&vs_currencies=usd',
        { headers: { 'Accept': 'application/json' } }
      )
      if (!res.ok) throw new Error('CoinGecko unavailable')
      const d = await res.json() as {
        binancecoin?:     { usd: number }
        ethereum?:        { usd: number }
        'matic-network'?: { usd: number }
        bitcoin?:         { usd: number }
      }
      return {
        bnb:       d.binancecoin?.usd     ?? 600,
        eth:       d.ethereum?.usd        ?? 3200,
        matic:     d['matic-network']?.usd ?? 0.7,
        btc:       d.bitcoin?.usd         ?? 65000,
        updatedAt: new Date(),
      }
    },
    staleTime:    120_000,  // 2 min cache — CoinGecko rate limits on free tier
    retry:        2,
    throwOnError: false,
  })
}
