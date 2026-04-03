/**
 * polymarket-trade — Automated Polymarket CLOB trading via Supabase Edge Function
 *
 * Places small bets ($0.05-$1) on high-confidence prediction markets.
 * Profits are logged to income_entries and flow into the Ops Hub dashboard.
 *
 * Required Secrets:
 *   HOT_WALLET_PRIVATE_KEY — same key used for crypto cashouts (must have USDC on Polygon)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-injected
 */
import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ethers }       from 'https://esm.sh/ethers@6.11.1'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POLYMARKET_CLOB = 'https://clob.polymarket.com'
const POLYGON_RPC     = 'https://polygon-rpc.com/'
const CHAIN_ID        = 137

// USDC on Polygon (6 decimals)
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

const USER_ID = '0ce62691-721c-4eba-bf3e-052731d9839b'
const JOB_ID  = '47e07a86-e062-4c9b-bccb-23e2d2662297' // Polymarket Edge Trader

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const pk  = Deno.env.get('HOT_WALLET_PRIVATE_KEY') ?? ''
  const admin = createClient(url, svc)

  try {
    const body = await req.json() as Record<string, unknown>
    const action = (body.action as string) ?? 'scan'

    // ─── SCAN: Find high-confidence markets ────────────────────────────
    if (action === 'scan') {
      const marketsRes = await fetch(`${POLYMARKET_CLOB}/markets?active=true&closed=false&limit=50`)
      const markets = await marketsRes.json()

      // Filter for markets with good edge: price < 0.15 or > 0.85
      // These are high-confidence bets where one side is heavily favored
      const opportunities = []
      for (const m of (Array.isArray(markets) ? markets : markets.data ?? [])) {
        if (!m.active || m.closed) continue
        for (const token of (m.tokens ?? [])) {
          const price = parseFloat(token.price ?? '0.5')
          if (price <= 0.12 && price > 0.01) {
            opportunities.push({
              question: m.question,
              outcome: token.outcome,
              price,
              token_id: token.token_id,
              side: 'YES',   // Buy cheap YES shares hoping they resolve to $1
              edge: (1 - price) / price, // e.g. 0.10 → 9x potential
              condition_id: m.condition_id,
            })
          }
          if (price >= 0.88 && price < 0.99) {
            opportunities.push({
              question: m.question,
              outcome: token.outcome,
              price,
              token_id: token.token_id,
              side: 'YES',   // Buy likely-YES at 88-99 cents, profit the spread
              edge: (1 - price),
              condition_id: m.condition_id,
            })
          }
        }
      }

      // Sort by edge
      opportunities.sort((a, b) => b.edge - a.edge)

      return new Response(JSON.stringify({
        scanned: Array.isArray(markets) ? markets.length : (markets.data?.length ?? 0),
        opportunities: opportunities.slice(0, 20),
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ─── BALANCE: Check USDC on Polygon ────────────────────────────────
    if (action === 'balance') {
      if (!pk || pk.length < 60) {
        return new Response(JSON.stringify({ error: 'HOT_WALLET_PRIVATE_KEY not configured' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      const provider = new ethers.JsonRpcProvider(POLYGON_RPC)
      const wallet   = new ethers.Wallet(pk, provider)
      const usdc     = new ethers.Contract(USDC_POLYGON, [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ], wallet)

      const [bal, dec, maticBal] = await Promise.all([
        usdc.balanceOf(wallet.address),
        usdc.decimals(),
        provider.getBalance(wallet.address),
      ])

      return new Response(JSON.stringify({
        address: wallet.address,
        usdc: Number(ethers.formatUnits(bal, dec)),
        matic: Number(ethers.formatEther(maticBal)),
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ─── BET: Place a bet on a specific market ─────────────────────────
    if (action === 'bet') {
      const { token_id, price, size, side, question } = body as {
        token_id: string; price: number; size: number; side: string; question: string
      }

      if (!token_id || !price || !size) {
        return new Response(JSON.stringify({ error: 'Missing token_id, price, or size' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      // Derive API credentials from wallet
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC)
      const wallet   = new ethers.Wallet(pk, provider)

      // Step 1: Derive API key from Polymarket
      const nonce = Date.now().toString()
      const msgToSign = `I want to derive my API key. Nonce: ${nonce}`
      const signature = await wallet.signMessage(msgToSign)

      const deriveRes = await fetch(`${POLYMARKET_CLOB}/auth/derive-api-key`, {
        method: 'GET',
        headers: {
          'POLY_ADDRESS': wallet.address,
          'POLY_SIGNATURE': signature,
          'POLY_TIMESTAMP': nonce,
          'POLY_NONCE': nonce,
        }
      })
      const apiCreds = await deriveRes.json()

      if (!apiCreds.apiKey) {
        return new Response(JSON.stringify({ error: 'Failed to derive API key', detail: apiCreds }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      // Step 2: Create and post order
      // For now, use the REST API directly
      const orderPayload = {
        tokenID: token_id,
        price: price.toString(),
        size: size.toString(),
        side: side === 'YES' ? 'BUY' : 'SELL',
        type: 'GTC', // Good til cancelled
      }

      // HMAC sign the request
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(apiCreds.secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      )
      const message = timestamp + 'POST' + '/order' + JSON.stringify(orderPayload)
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
      const hmacSig = btoa(String.fromCharCode(...new Uint8Array(sig)))

      const orderRes = await fetch(`${POLYMARKET_CLOB}/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'POLY_ADDRESS': wallet.address,
          'POLY_SIGNATURE': hmacSig,
          'POLY_TIMESTAMP': timestamp,
          'POLY_NONCE': nonce,
          'POLY_API_KEY': apiCreds.apiKey,
          'POLY_PASSPHRASE': apiCreds.passphrase,
        },
        body: JSON.stringify(orderPayload),
      })
      const orderResult = await orderRes.json()

      // Log the bet as pending income
      if (orderResult.orderID || orderResult.id) {
        await admin.from('income_entries').insert({
          user_id: USER_ID,
          job_id: JOB_ID,
          amount: 0, // Will be updated when position resolves
          source: 'polymarket',
          description: `Polymarket bet: ${question?.substring(0, 80)} @ ${price} (${side}) $${size}`,
          reference_id: `poly-${orderResult.orderID || orderResult.id}`,
          entry_date: new Date().toISOString().slice(0, 10),
        })
      }

      return new Response(JSON.stringify({
        success: true,
        order: orderResult,
        bet: { question, price, size, side, token_id },
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ─── LOG_PROFIT: Record resolved bet profit ────────────────────────
    if (action === 'log_profit') {
      const { amount, description, reference_id } = body as {
        amount: number; description: string; reference_id: string
      }

      const { data, error } = await admin.from('income_entries').insert({
        user_id: USER_ID,
        job_id: JOB_ID,
        amount,
        source: 'polymarket',
        description: description || 'Polymarket position resolved',
        reference_id: reference_id || `poly-profit-${Date.now()}`,
        entry_date: new Date().toISOString().slice(0, 10),
      }).select('id, amount').single()

      if (error) throw error

      return new Response(JSON.stringify({ success: true, entry: data }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: scan, balance, bet, log_profit' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
