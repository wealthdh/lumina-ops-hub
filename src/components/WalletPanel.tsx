/**
 * WalletPanel — Live balance display for Darrell's cold BNB wallet
 * 0xc77a0B887e182265d36C69E9588027328a9557A7
 *
 * Data sources:
 *  - BNB balance: BSCScan public API (no key needed for basic queries)
 *  - USDT balance: BSCScan token API
 *  - BNB price: CoinGecko public API
 *  - Recent transactions: BSCScan txlist
 */
import { useState, useEffect, useCallback } from 'react'
import { Wallet, RefreshCw, ExternalLink, TrendingUp, ArrowDownLeft, ArrowUpRight, Loader } from 'lucide-react'
import clsx from 'clsx'

const WALLET = '0xc77a0B887e182265d36C69E9588027328a9557A7'
const BSC_RPC = 'https://bsc-dataseed.binance.org/'
const USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'

interface WalletData {
  bnbBalance:   number
  usdtBalance:  number
  bnbPriceUsd:  number
  totalUsd:     number
  lastUpdated:  Date
}

interface RecentTx {
  hash:      string
  from:      string
  to:        string
  value:     string   // in BNB
  timeStamp: string
  isIn:      boolean
}

/** Fetch with an 8-second hard timeout — prevents BSCScan/CoinGecko hangs */
async function fetchWithTimeout(url: string, ms = 8_000): Promise<Response> {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(tid)
  }
}

async function fetchBNBPrice(): Promise<number> {
  try {
    const r = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd')
    const d = await r.json() as { binancecoin?: { usd: number } }
    return d.binancecoin?.usd ?? 600
  } catch {
    return 600   // fallback price
  }
}

/** Call BSC JSON-RPC (direct node — no API key, no deprecated BSCScan V1) */
async function rpcCall(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(8_000),
  })
  const d = await res.json() as { result?: string }
  return d.result ?? '0x0'
}

async function fetchBNBBalance(address: string): Promise<number> {
  try {
    const hex = await rpcCall('eth_getBalance', [address, 'latest'])
    return parseInt(hex, 16) / 1e18
  } catch {
    return 0
  }
}

async function fetchUSDTBalance(address: string): Promise<number> {
  try {
    // ERC-20 balanceOf(address) selector = 0x70a08231
    const data = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase()
    const hex = await rpcCall('eth_call', [{ to: USDT_CONTRACT, data }, 'latest'])
    return parseInt(hex, 16) / 1e18
  } catch {
    return 0
  }
}

// BSCScan txlist V1 is deprecated — fall back to empty (RPC can't list txs)
// We show balances accurately via RPC; txs require an indexer or paid API
async function fetchRecentTxs(_address: string, _limit = 5): Promise<RecentTx[]> {
  // TODO: integrate Moralis, Ankr, or BSCScan V2 paid plan for tx history
  return []
}

export default function WalletPanel() {
  const [data,      setData]      = useState<WalletData | null>(null)
  const [txs,       setTxs]       = useState<RecentTx[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bnbBalance, usdtBalance, bnbPrice, recentTxs] = await Promise.all([
        fetchBNBBalance(WALLET),
        fetchUSDTBalance(WALLET),
        fetchBNBPrice(),
        fetchRecentTxs(WALLET),
      ])
      setData({
        bnbBalance,
        usdtBalance,
        bnbPriceUsd:  bnbPrice,
        totalUsd:     bnbBalance * bnbPrice + usdtBalance,
        lastUpdated:  new Date(),
      })
      setTxs(recentTxs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch wallet data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Auto-refresh every 60 seconds
    const id = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(id)
  }, [refresh])

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`
  const ago   = (ts: string) => {
    const secs = Math.floor(Date.now() / 1000) - Number(ts)
    if (secs < 60)   return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs/60)}m ago`
    if (secs < 86400)return `${Math.floor(secs/3600)}h ago`
    return `${Math.floor(secs/86400)}d ago`
  }

  return (
    <div className="card-glow border-orange-500/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <Wallet size={14} className="text-orange-400" />
          </div>
          <div>
            <div className="text-lumina-text font-semibold text-sm">Cold Wallet</div>
            <a href={`https://bscscan.com/address/${WALLET}`} target="_blank" rel="noreferrer"
              className="text-[10px] text-lumina-dim hover:text-lumina-pulse font-mono flex items-center gap-1">
              {WALLET.slice(0, 10)}…{WALLET.slice(-8)}
              <ExternalLink size={9} />
            </a>
          </div>
        </div>
        <button onClick={() => void refresh()} disabled={loading}
          className="text-lumina-dim hover:text-lumina-pulse transition-colors p-1" title="Refresh">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error ? (
        <div className="text-lumina-danger text-xs bg-lumina-danger/10 rounded-lg p-3">
          {error} — BSCScan may be rate-limiting (free tier: 5 req/s)
        </div>
      ) : loading && !data ? (
        <div className="flex items-center gap-2 text-lumina-dim text-xs py-4 justify-center">
          <Loader size={14} className="animate-spin" /> Fetching live balance…
        </div>
      ) : data ? (
        <>
          {/* Balance cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-lumina-bg/60 rounded-xl p-3">
              <div className="text-[10px] text-lumina-muted mb-1">BNB Balance</div>
              <div className="text-xl font-mono font-bold text-orange-400">
                {data.bnbBalance.toFixed(4)}
              </div>
              <div className="text-xs text-lumina-dim">≈ ${(data.bnbBalance * data.bnbPriceUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-lumina-bg/60 rounded-xl p-3">
              <div className="text-[10px] text-lumina-muted mb-1">USDT Balance</div>
              <div className="text-xl font-mono font-bold text-green-400">
                ${data.usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-lumina-dim">BEP-20 Stablecoin</div>
            </div>
          </div>

          {/* Total */}
          <div className="bg-lumina-pulse/10 border border-lumina-pulse/30 rounded-xl p-3 mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-lumina-dim">Total Portfolio Value</div>
              <div className="text-2xl font-bold font-mono text-lumina-pulse">
                ${data.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-lumina-dim">BNB @ </div>
              <div className="text-sm font-mono text-lumina-dim">${data.bnbPriceUsd.toLocaleString()}</div>
              <div className="text-[9px] text-lumina-muted mt-0.5">
                Updated {data.lastUpdated.toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          {txs.length > 0 && (
            <div>
              <div className="text-[10px] text-lumina-muted font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingUp size={9} /> Recent Transactions
              </div>
              <div className="space-y-1.5">
                {txs.map(tx => (
                  <a key={tx.hash}
                    href={`https://bscscan.com/tx/${tx.hash}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg bg-lumina-bg/40 hover:bg-lumina-bg/80 transition-colors group">
                    <div className={clsx(
                      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                      tx.isIn ? 'bg-lumina-success/20 border border-lumina-success/30' : 'bg-lumina-danger/20 border border-lumina-danger/30'
                    )}>
                      {tx.isIn
                        ? <ArrowDownLeft size={10} className="text-lumina-success" />
                        : <ArrowUpRight  size={10} className="text-lumina-danger"  />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-lumina-text font-mono">
                        {tx.isIn ? `+ ${tx.value} BNB from ${short(tx.from)}` : `- ${tx.value} BNB to ${short(tx.to)}`}
                      </div>
                      <div className="text-[10px] text-lumina-muted">{ago(tx.timeStamp)}</div>
                    </div>
                    <ExternalLink size={9} className="text-lumina-muted group-hover:text-lumina-pulse flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
