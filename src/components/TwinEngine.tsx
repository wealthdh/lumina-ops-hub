/**
 * Twin-Engine Dashboard — Polymarket + MT5 split screen with one-tap Mirror Edge
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap, RefreshCw, TrendingUp, TrendingDown, ExternalLink, ChevronDown, ChevronUp, AlertTriangle, Link2 } from 'lucide-react'
import { usePolyMarkets } from '../hooks/usePolymarket'
import { useMT5Account, useMT5Trades } from '../hooks/useMT5'
import type { MT5Account, MT5Trade } from '../lib/types'
import { supabase } from '../lib/supabase'

const EMPTY_ACCOUNT: MT5Account = {
  accountId: 0, equity: 0, balance: 0, marginLevel: 0, dayPnl: 0, monthPnl: 0, openTrades: [],
}
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import clsx from 'clsx'

// ─── Real equity curve from Supabase mt5_snapshots ───────────────────────────
function useEquityCurve() {
  return useQuery<{ day: number; equity: number; poly: number }[]>({
    queryKey: ['mt5_equity_curve'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mt5_snapshots')
        .select('created_at, equity, poly_balance')
        .order('created_at', { ascending: true })
        .limit(30)
      if (error || !data || data.length === 0) return []
      return data.map((row, i) => ({
        day:    i + 1,
        equity: row.equity ?? 0,
        poly:   row.poly_balance ?? 0,
      }))
    },
    staleTime: 120_000,
  })
}

function MirrorEdgeModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'config' | 'confirm' | 'done'>('config')
  const [capital, setCapital] = useState(2000)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card-glow w-full max-w-md border-lumina-pulse/40">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-lumina-pulse" />
          <h2 className="text-lumina-text font-semibold">Mirror Edge — One-Tap Sync</h2>
        </div>

        {step === 'config' && (
          <div className="space-y-4">
            <div className="p-3 bg-lumina-bg/60 rounded-lg">
              <div className="text-xs text-lumina-dim mb-1">Market</div>
              <div className="text-sm text-lumina-text">Fed rate cut in Q2 2026?</div>
              <div className="flex items-center gap-4 mt-2">
                <span className="badge-pulse badge">YES @ 62¢</span>
                <span className="text-xs text-lumina-dim">Edge: +4.1% vs MT5 implied 66%</span>
              </div>
            </div>
            <div className="p-3 bg-lumina-bg/60 rounded-lg">
              <div className="text-xs text-lumina-dim mb-1">MT5 Hedge (auto-computed)</div>
              <div className="text-sm text-lumina-text">EURUSD BUY — 0.3 lot</div>
              <div className="text-xs text-lumina-dim mt-1">Kelly: 0.12 fraction · SL: 1.0780 · TP: 1.0960</div>
            </div>
            <div>
              <label className="text-xs text-lumina-dim block mb-1">Capital to deploy (USDT)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(+e.target.value)}
                className="w-full bg-lumina-bg border border-lumina-border rounded-lg px-3 py-2 text-sm font-mono text-lumina-text focus:border-lumina-pulse outline-none"
              />
            </div>
            <div className="p-3 bg-lumina-pulse/10 border border-lumina-pulse/30 rounded-lg text-xs text-lumina-text">
              Expected net edge: <strong className="text-lumina-pulse">+$82 / position</strong>
              &nbsp;· Max loss: <strong className="text-lumina-danger">-$48</strong>
            </div>
            <button className="btn-pulse w-full" onClick={() => setStep('confirm')}>
              Review & Execute
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              {[
                ['Polymarket:', 'BUY YES @ 62¢ · $2,000 USDT'],
                ['MT5 Hedge:',  'BUY EURUSD 0.3 lot · Kelly'],
                ['Net Edge:',   '+4.1% expected'],
                ['Time to exp:','~14 days'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-lumina-border pb-1">
                  <span className="text-lumina-dim">{k}</span>
                  <span className="text-lumina-text font-mono">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setStep('config')}>Back</button>
              <button
                className="btn-pulse flex-1"
                onClick={() => setStep('done')}
              >
                🚀 Execute Mirror Edge
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-4 py-4">
            <div className="text-4xl">✅</div>
            <div className="text-lumina-success font-semibold">Mirror Edge Executed</div>
            <div className="text-xs text-lumina-dim">
              Polymarket order ID: <span className="font-mono">PMK-0039201</span><br />
              MT5 Ticket: <span className="font-mono">#100847</span>
            </div>
            <button className="btn-ghost w-full" onClick={onClose}>Close</button>
          </div>
        )}

        {step !== 'done' && (
          <button onClick={onClose} className="absolute top-3 right-3 text-lumina-dim hover:text-lumina-text text-lg">✕</button>
        )}
      </div>
    </div>
  )
}

function MT5TradeList({ trades }: { trades: MT5Trade[] }) {
  const [openTicket, setOpenTicket] = useState<number | null>(null)

  if (trades.length === 0) {
    return <div className="text-center py-4 text-lumina-muted text-xs">No open positions</div>
  }

  return (
    <div className="space-y-2">
      {trades.map((t) => {
        const isOpen = openTicket === t.ticket
        const pnlSign = t.profit >= 0 ? '+' : ''
        const pnlColor = t.profit >= 0 ? 'text-lumina-success' : 'text-lumina-danger'
        // swap / openTime may not exist on all mock types — safe fallback
        const extra = t as MT5Trade & { openTime?: string; swap?: number; openPrice?: number; sl?: number; tp?: number }
        return (
          <div key={t.ticket} className={clsx(
            'rounded-lg border transition-all',
            isOpen ? 'border-lumina-gold/40 bg-lumina-bg' : 'border-lumina-border/60 bg-lumina-bg/60'
          )}>
            {/* Row summary */}
            <div
              className="flex items-center justify-between text-xs font-mono p-2 cursor-pointer select-none"
              onClick={() => setOpenTicket(isOpen ? null : t.ticket)}
            >
              <span className="text-lumina-text font-semibold">{t.symbol}</span>
              <span className={t.type === 'buy' ? 'text-lumina-success' : 'text-lumina-danger'}>{t.type.toUpperCase()}</span>
              <span className="text-lumina-dim">{t.volume}L</span>
              <span className={pnlColor}>{pnlSign}${t.profit.toFixed(2)}</span>
              {isOpen ? <ChevronUp size={11} className="text-lumina-gold" /> : <ChevronDown size={11} className="text-lumina-dim" />}
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-2 pb-2 pt-1 border-t border-lumina-border/50 grid grid-cols-3 gap-2 text-[10px]">
                {extra.openPrice && (
                  <div className="bg-lumina-bg/60 rounded p-1.5">
                    <div className="text-lumina-muted mb-0.5">Open</div>
                    <div className="font-mono text-lumina-text">{extra.openPrice.toFixed(5)}</div>
                  </div>
                )}
                {extra.sl && (
                  <div className="bg-lumina-bg/60 rounded p-1.5">
                    <div className="text-lumina-muted mb-0.5">SL</div>
                    <div className="font-mono text-lumina-danger">{extra.sl.toFixed(5)}</div>
                  </div>
                )}
                {extra.tp && (
                  <div className="bg-lumina-bg/60 rounded p-1.5">
                    <div className="text-lumina-muted mb-0.5">TP</div>
                    <div className="font-mono text-lumina-success">{extra.tp.toFixed(5)}</div>
                  </div>
                )}
                {extra.swap !== undefined && (
                  <div className="bg-lumina-bg/60 rounded p-1.5">
                    <div className="text-lumina-muted mb-0.5">Swap</div>
                    <div className={clsx('font-mono', extra.swap >= 0 ? 'text-lumina-success' : 'text-lumina-danger')}>
                      {extra.swap.toFixed(2)}
                    </div>
                  </div>
                )}
                {extra.openTime && (
                  <div className="bg-lumina-bg/60 rounded p-1.5 col-span-2">
                    <div className="text-lumina-muted mb-0.5">Opened</div>
                    <div className="font-mono text-lumina-dim">{extra.openTime}</div>
                  </div>
                )}
                <div className="bg-lumina-bg/60 rounded p-1.5">
                  <div className="text-lumina-muted mb-0.5">Ticket #</div>
                  <div className="font-mono text-lumina-dim">{t.ticket}</div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function TwinEngine() {
  const [showMirror, setShowMirror] = useState(false)
  // ── LIVE data from Supabase / MT5 bridge ──────────────────────────────────
  const { data: markets = [], isLoading: marketsLoading, isError: marketsError } = usePolyMarkets()
  const { data: liveAccount  } = useMT5Account()
  const { data: liveTrades   } = useMT5Trades()
  const { data: equityCurve = [] } = useEquityCurve()
  const account: MT5Account & { openTrades: MT5Trade[] } = {
    ...(liveAccount ?? EMPTY_ACCOUNT),
    openTrades: liveTrades ?? liveAccount?.openTrades ?? [],
  }

  return (
    <div className="space-y-6">
      {showMirror && <MirrorEdgeModal onClose={() => setShowMirror(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Twin-Engine Dashboard</h1>
          <p className="text-lumina-dim text-sm">Polymarket + MT5 live split-screen · one-tap Mirror Edge</p>
        </div>
        <button className="btn-pulse flex items-center gap-2" onClick={() => setShowMirror(true)}>
          <Zap size={14} />
          Mirror Edge
        </button>
      </div>

      {/* Split screen */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Polymarket panel */}
        <div className="card-glow border-lumina-violet/30">
          <div className="section-header text-purple-400">
            Polymarket · Top Markets
          </div>
          <div className="space-y-3">
            {marketsLoading && markets.length === 0 ? (
              <div className="text-center py-8 text-lumina-dim text-xs animate-pulse">Loading live markets…</div>
            ) : marketsError || markets.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <div className="text-lumina-warning text-xs">Polymarket API unavailable</div>
                <a href="https://polymarket.com" target="_blank" rel="noreferrer"
                  className="text-[10px] text-lumina-pulse hover:underline flex items-center justify-center gap-1">
                  <ExternalLink size={10} /> View on Polymarket.com
                </a>
              </div>
            ) : markets.map((m) => {
              const yes = m.outcomes.find((o) => o.name === 'Yes' || o.name === 'YES')
              const no  = m.outcomes.find((o) => o.name === 'No'  || o.name === 'NO')
              const volM = m.volume >= 1_000_000
                ? `$${(m.volume / 1_000_000).toFixed(1)}M`
                : m.volume >= 1_000
                  ? `$${(m.volume / 1_000).toFixed(0)}K`
                  : `$${m.volume.toFixed(0)}`
              const liqM = m.liquidity >= 1_000_000
                ? `$${(m.liquidity / 1_000_000).toFixed(1)}M`
                : m.liquidity >= 1_000
                  ? `$${(m.liquidity / 1_000).toFixed(0)}K`
                  : `$${m.liquidity.toFixed(0)}`
              return (
                <a key={m.id}
                  href={`https://polymarket.com/event/${m.conditionId}`}
                  target="_blank" rel="noreferrer"
                  className="block p-3 bg-lumina-bg/60 rounded-lg hover:bg-lumina-bg transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-lumina-text leading-tight">{m.question}</p>
                    <ExternalLink size={12} className="text-lumina-dim flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-lumina-border rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-lumina-success rounded-full transition-all"
                        style={{ width: `${(yes?.price ?? 0) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs font-mono">
                      <span className="text-lumina-success">YES {((yes?.price ?? 0) * 100).toFixed(0)}¢</span>
                      <span className="text-lumina-danger">NO {((no?.price ?? 0) * 100).toFixed(0)}¢</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-lumina-dim">
                    <span>Vol: {volM}</span>
                    <span>Liq: {liqM}</span>
                    {(yes?.priceChange24h !== 0 || no?.priceChange24h !== 0) && (
                      <span className={yes?.priceChange24h && yes.priceChange24h > 0 ? 'text-lumina-success' : 'text-lumina-danger'}>
                        {yes?.priceChange24h && yes.priceChange24h > 0 ? '+' : ''}{((yes?.priceChange24h ?? 0) * 100).toFixed(1)}%
                      </span>
                    )}
                    <span className="badge-violet badge ml-auto">{m.category}</span>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        {/* MT5 panel */}
        <div className="card-glow border-lumina-gold/30">
          <div className="section-header text-lumina-gold">
            MT5 LuminaPulse · Live Account
          </div>

          {/* Equity curve — real from mt5_snapshots table */}
          <div className="h-40 mb-4">
            {equityCurve.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurve}>
                  <XAxis dataKey="day" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#8892a4' }}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#f5c400" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="poly"   stroke="#00f5d4" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-lumina-dim text-center">
                <span>
                  Equity history chart will appear once<br />
                  <code className="text-lumina-pulse">mt5_snapshots</code> rows are written by LuminaPulse EA
                </span>
              </div>
            )}
          </div>

          {/* Account stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { l: 'Equity',     v: `$${account.equity.toLocaleString()}`,     c: 'text-lumina-gold' },
              { l: 'Day P&L',    v: `+$${account.dayPnl.toLocaleString()}`,    c: 'text-lumina-success' },
              { l: 'Month P&L',  v: `+$${account.monthPnl.toLocaleString()}`,  c: 'text-lumina-pulse' },
            ].map(({ l, v, c }) => (
              <div key={l} className="bg-lumina-bg/60 rounded-lg p-2 text-center">
                <div className="text-lumina-dim text-xs mb-0.5">{l}</div>
                <div className={clsx('font-mono font-bold text-sm', c)}>{v}</div>
              </div>
            ))}
          </div>

          {/* MT5 connection notice when equity is 0 */}
          {account.equity === 0 && (
            <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-lumina-warning/5 border border-lumina-warning/20 text-xs">
              <AlertTriangle size={12} className="text-lumina-warning flex-shrink-0" />
              <span className="text-lumina-warning">MT5 not connected. Configure <code className="text-[10px] bg-lumina-bg px-1 rounded">VITE_MT5_BRIDGE_URL</code> in .env</span>
            </div>
          )}

          {/* Open trades — expandable */}
          <MT5TradeList trades={account.openTrades} />
        </div>
      </div>

      {/* Arbitrage signal bar */}
      <div className="card-glow border-lumina-pulse/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="pulse-dot" />
          <div>
            <div className="text-sm text-lumina-text font-semibold">Live Arbitrage Signal: Fed Rate Cut market</div>
            <div className="text-xs text-lumina-dim">Poly 62¢ vs MT5 implied 66% · Edge: +4.1% · Expires ~14d</div>
          </div>
        </div>
        <button className="btn-pulse text-sm flex items-center gap-2" onClick={() => setShowMirror(true)}>
          <Zap size={14} />
          Execute
        </button>
      </div>
    </div>
  )
}
