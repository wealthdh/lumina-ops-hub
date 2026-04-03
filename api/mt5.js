/**
 * Vercel Serverless Proxy for LuminaPulse MT5 Bridge
 *
 * Routes /api/mt5/* requests to the LuminaPulse EA HTTP server.
 * When MT5_BRIDGE_URL is not set, returns cached data from Supabase.
 *
 * Environment variables:
 *   MT5_BRIDGE_URL  — e.g. http://your-vps:8080  (the EA's HTTP server)
 *   MT5_API_KEY     — shared secret for X-LP-Api-Key header
 *   SUPABASE_URL    — for fallback cache reads
 *   SUPABASE_SERVICE_KEY — service role key for server-side Supabase
 */

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/mt5/, '') || '/'
  const bridgeUrl = process.env.MT5_BRIDGE_URL
  const apiKey = process.env.MT5_API_KEY || process.env.VITE_MT5_API_KEY

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LP-Api-Key',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Validate API key from client
  const clientKey = req.headers.get('x-lp-api-key')
  if (apiKey && clientKey !== apiKey) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    )
  }

  // If bridge URL is configured, proxy to real EA
  if (bridgeUrl && !bridgeUrl.includes('pending')) {
    try {
      const target = `${bridgeUrl}${path}${url.search}`
      const proxyRes = await fetch(target, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'X-LP-Api-Key': apiKey || '',
        },
        body: req.method !== 'GET' ? await req.text() : undefined,
      })
      const data = await proxyRes.json()
      return Response.json(data, {
        status: proxyRes.status,
        headers: corsHeaders,
      })
    } catch (err) {
      // Bridge unreachable — fall through to Supabase cache
      console.warn('[mt5-proxy] Bridge unreachable:', err.message)
    }
  }

  // Fallback: serve cached data from Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: 'MT5 bridge not configured and no Supabase fallback' },
      { status: 503, headers: corsHeaders }
    )
  }

  const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // Route: /account
    if (path === '/account' || path === '/') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/mt5_accounts?select=*&order=updated_at.desc&limit=1`,
        { headers: sbHeaders }
      )
      const rows = await res.json()
      if (!rows.length) {
        return Response.json(
          { error: 'No cached MT5 account data' },
          { status: 404, headers: corsHeaders }
        )
      }
      const a = rows[0]
      return Response.json(
        {
          accountId: a.account_id,
          balance: a.balance,
          equity: a.equity,
          margin: a.margin,
          freeMargin: a.free_margin,
          marginLevel: a.margin_level,
          profit: a.profit,
          dayPnl: a.day_pnl,
          weekPnl: a.week_pnl,
          monthPnl: a.month_pnl,
          openTrades: [],
          _cached: true,
          _updatedAt: a.updated_at,
        },
        { headers: corsHeaders }
      )
    }

    // Route: /trades
    if (path === '/trades') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/mt5_trades?select=*&order=open_time.desc`,
        { headers: sbHeaders }
      )
      const rows = await res.json()
      const trades = (rows || []).map((t) => ({
        ticket: t.ticket,
        symbol: t.symbol,
        type: t.type,
        volume: t.volume,
        openPrice: t.open_price,
        currentPrice: t.current_price,
        profit: t.profit,
        openTime: t.open_time,
        sl: t.sl,
        tp: t.tp,
      }))
      return Response.json(trades, { headers: corsHeaders })
    }

    // Route: /history
    if (path === '/history') {
      return Response.json([], { headers: corsHeaders })
    }

    // Route: /kelly/:symbol
    if (path.startsWith('/kelly/')) {
      const symbol = path.split('/kelly/')[1]
      return Response.json(
        {
          symbol,
          kellyFraction: 0.02,
          recommendedLots: 0.01,
          _cached: true,
        },
        { headers: corsHeaders }
      )
    }

    return Response.json(
      { error: `Unknown MT5 route: ${path}` },
      { status: 404, headers: corsHeaders }
    )
  } catch (err) {
    return Response.json(
      { error: 'Supabase fallback failed', detail: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
