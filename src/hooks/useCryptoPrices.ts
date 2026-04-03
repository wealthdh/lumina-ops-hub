/**
 * useCryptoPrices — Live BTC, ETH, BNB, MATIC prices via CoinGecko free API.
 * No API key required. Refreshes every 30 seconds.
 */
import { useQuery } from '@tanstack/react-query'

export interface CryptoPrice {
  symbol: string
  usd: number
  usd_24h_change: number
}

export interface CryptoPrices {
  BNB:  CryptoPrice
  BTC:  CryptoPrice
  ETH:  CryptoPrice
  MATIC: CryptoPrice
  SOL:  CryptoPrice
}

const COINGECKO_IDS = 'binancecoin,bitcoin,ethereum,matic-network,solana'
const COINGECKO_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd&include_24hr_change=true`

const SYMBOL_MAP: Record<string, keyof CryptoPrices> = {
  'binancecoin': 'BNB',
  'bitcoin':     'BTC',
  'ethereum':    'ETH',
  'matic-network': 'MATIC',
  'solana':      'SOL',
}

// Fallback prices (only shown while first fetch is in progress)
const FALLBACK: CryptoPrices = {
  BNB:   { symbol: 'BNB',   usd: 608,    usd_24h_change: 0 },
  BTC:   { symbol: 'BTC',   usd: 68400,  usd_24h_change: 0 },
  ETH:   { symbol: 'ETH',   usd: 3820,   usd_24h_change: 0 },
  MATIC: { symbol: 'MATIC', usd: 0.71,   usd_24h_change: 0 },
  SOL:   { symbol: 'SOL',   usd: 178,    usd_24h_change: 0 },
}

async function fetchPrices(): Promise<CryptoPrices> {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 6_000)  // 6s timeout
  let res: Response
  try {
    res = await fetch(COINGECKO_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)

  const data = await res.json() as Record<string, { usd: number; usd_24h_change: number }>

  const result = { ...FALLBACK }
  for (const [id, prices] of Object.entries(data)) {
    const sym = SYMBOL_MAP[id]
    if (sym) {
      result[sym] = {
        symbol: sym,
        usd: prices.usd,
        usd_24h_change: prices.usd_24h_change ?? 0,
      }
    }
  }
  return result
}

export function useCryptoPrices() {
  return useQuery<CryptoPrices>({
    queryKey: ['crypto-prices'],
    queryFn:  fetchPrices,
    staleTime: 25_000,
    refetchInterval: 30_000,
    placeholderData: FALLBACK,
    retry: 2,
  })
}

/** Format price with appropriate decimal places */
export function formatCryptoPrice(usd: number): string {
  if (usd >= 1000) return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (usd >= 1)    return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(4)}`
}

/** Format 24h change with sign and color class */
export function priceChangeClass(change: number): string {
  return change >= 0 ? 'text-lumina-success' : 'text-lumina-danger'
}
