/**
 * Vercel Serverless — MT5 PnL Auto-Sync
 *
 * Called by a cron job (Vercel Cron) or manually to sync MT5 trading PnL
 * into the income_entries table automatically.
 *
 * Logic:
 *  1. Read current MT5 account PnL from Supabase cache (day_pnl)
 *  2. Check if we already logged today's PnL
 *  3. If day_pnl changed, upsert today's income_entry for the trading job
 *
 * Also syncs closed trade profits from mt5_trades table.
 *
 * Environment variables:
 *   SUPABASE_URL          — or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY  — service role key for writes
 *   DEFAULT_USER_ID       — fallback user ID
 *   MT5_ACCOUNT_ID        — e.g. "937685"
 */

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const userId = process.env.DEFAULT_USER_ID || '0ce62691-721c-4eba-bf3e-052731d9839b'
  const accountId = process.env.MT5_ACCOUNT_ID || '937685'

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY' },
      { status: 500, headers: corsHeaders }
    )
  }

  const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  }

  try {
    const today = new Date().toISOString().slice(0, 10)

    // 1. Get MT5 account data
    const acctRes = await fetch(
      `${supabaseUrl}/rest/v1/mt5_accounts?select=*&account_id=eq.${accountId}&limit=1`,
      { headers: sbHeaders }
    )
    const acctRows = await acctRes.json()
    if (!acctRows || acctRows.length === 0) {
      return Response.json(
        { error: 'No MT5 account found', accountId },
        { status: 404, headers: corsHeaders }
      )
    }

    const account = acctRows[0]
    const dayPnl = Number(account.day_pnl || 0)
    const profit = Number(account.profit || 0)

    // 2. Find the trading job (LuminaPulse / Liquidity Sniper)
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/ops_jobs?select=id,name,daily_profit&category=eq.trading&status=eq.active&limit=1`,
      { headers: sbHeaders }
    )
    const jobs = await jobRes.json()
    let tradingJobId = jobs.length > 0 ? jobs[0].id : null

    // Fallback: try crypto category
    if (!tradingJobId) {
      const cryptoRes = await fetch(
        `${supabaseUrl}/rest/v1/ops_jobs?select=id,name&category=eq.crypto&status=eq.active&limit=1`,
        { headers: sbHeaders }
      )
      const cryptoJobs = await cryptoRes.json()
      if (cryptoJobs.length > 0) tradingJobId = cryptoJobs[0].id
    }

    if (!tradingJobId) {
      return Response.json(
        { warning: 'No active trading job found to log PnL' },
        { status: 200, headers: corsHeaders }
      )
    }

    // 3. Check existing entry for today
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/income_entries?select=id,amount&job_id=eq.${tradingJobId}&source=eq.mt5&entry_date=eq.${today}&user_id=eq.${userId}&limit=1`,
      { headers: sbHeaders }
    )
    const existing = await existingRes.json()

    const pnlToLog = dayPnl !== 0 ? dayPnl : profit

    // Only log if there's actual PnL
    if (pnlToLog === 0 && existing.length === 0) {
      return Response.json(
        { synced: false, reason: 'No PnL to log', dayPnl, profit },
        { headers: corsHeaders }
      )
    }

    if (existing.length > 0) {
      // Update existing entry if PnL changed
      const existingAmt = Number(existing[0].amount || 0)
      if (Math.abs(existingAmt - pnlToLog) < 0.01) {
        return Response.json(
          { synced: false, reason: 'PnL unchanged', current: pnlToLog },
          { headers: corsHeaders }
        )
      }

      // Update
      await fetch(`${supabaseUrl}/rest/v1/income_entries?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          amount: Math.round(pnlToLog * 100) / 100,
          description: `MT5 #${accountId} daily PnL (auto-synced)`,
        }),
      })
    } else {
      // Insert new entry
      await fetch(`${supabaseUrl}/rest/v1/income_entries`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          job_id: tradingJobId,
          amount: Math.round(pnlToLog * 100) / 100,
          source: 'mt5',
          reference_id: `mt5_${accountId}_${today}`,
          description: `MT5 #${accountId} daily PnL (auto-synced)`,
          entry_date: today,
        }),
      })
    }

    // 4. Update the trading job's daily_profit
    await fetch(`${supabaseUrl}/rest/v1/ops_jobs?id=eq.${tradingJobId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        daily_profit: Math.max(0, Math.round(pnlToLog * 100) / 100),
        last_activity: new Date().toISOString(),
      }),
    })

    // 5. Also sync individual closed trades that haven't been logged
    const tradesRes = await fetch(
      `${supabaseUrl}/rest/v1/mt5_trades?select=ticket,symbol,profit,type,volume,open_time&order=open_time.desc&limit=20`,
      { headers: sbHeaders }
    )
    const trades = await tradesRes.json()
    let tradesSynced = 0

    for (const trade of (trades || [])) {
      if (Number(trade.profit) === 0) continue

      // Check if this trade ticket was already logged
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/income_entries?select=id&reference_id=eq.mt5_trade_${trade.ticket}&limit=1`,
        { headers: sbHeaders }
      )
      const checkData = await checkRes.json()
      if (checkData.length > 0) continue

      // Log trade profit
      await fetch(`${supabaseUrl}/rest/v1/income_entries`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          job_id: tradingJobId,
          amount: Math.round(Number(trade.profit) * 100) / 100,
          source: 'mt5',
          reference_id: `mt5_trade_${trade.ticket}`,
          description: `${trade.type.toUpperCase()} ${trade.volume} ${trade.symbol} (ticket #${trade.ticket})`,
          entry_date: trade.open_time ? trade.open_time.slice(0, 10) : today,
        }),
      })
      tradesSynced++
    }

    return Response.json(
      {
        synced: true,
        accountId,
        dayPnl: pnlToLog,
        jobId: tradingJobId,
        tradesSynced,
        date: today,
      },
      { headers: corsHeaders }
    )
  } catch (err) {
    console.error('[mt5-sync] Error:', err)
    return Response.json(
      { error: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
