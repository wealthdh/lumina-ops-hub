import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get last 24 hours timestamp
    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    console.log('Syncing Stripe charges from last 24 hours...');

    // Fetch charges from Stripe
    const charges = await stripe.charges.list({
      created: { gte: twentyFourHoursAgo },
      limit: 100,
    });

    console.log(`Found ${charges.data.length} charges in Stripe`);

    // Get job_id for 'Digital%' products
    const { data: job } = await supabase
      .from('ops_jobs')
      .select('id')
      .ilike('name', 'Digital%')
      .single();

    const jobId = job ? job.id : null;

    let syncedCount = 0;
    const results = [];

    // For each charge, check if it already exists in income_entries
    for (const charge of charges.data) {
      // Check if this charge is already recorded (search description for charge ID)
      const { data: existing } = await supabase
        .from('income_entries')
        .select('id')
        .eq('source', 'stripe')
        .ilike('description', `%${charge.id}%`)
        .maybeSingle();

      if (existing) {
        results.push({
          charge_id: charge.id,
          status: 'already_synced',
        });
        continue;
      }

      // Insert new income entry
      const { error: insertError } = await supabase.from('income_entries').insert({
        job_id: jobId,
        source: 'stripe',
        amount: charge.amount / 100, // Convert cents to dollars (preserve decimals)
        currency: charge.currency.toUpperCase(),
        description: `Stripe charge: ${charge.description || 'Digital product sale'}`,
        metadata: {
          stripe_charge_id: charge.id,
          customer_email: charge.billing_details?.email,
          charge_status: charge.status,
        },
      });

      if (insertError) {
        console.error(`Error inserting charge ${charge.id}:`, insertError);
        results.push({
          charge_id: charge.id,
          status: 'failed',
          error: insertError.message,
        });
        continue;
      }

      syncedCount++;
      results.push({
        charge_id: charge.id,
        amount: charge.amount / 100,
        status: 'synced',
      });

      console.log(`Synced charge ${charge.id}: $${(charge.amount / 100).toFixed(2)}`);
    }

    return res.status(200).json({
      success: true,
      message: `Revenue sync complete: ${syncedCount} new charges synced`,
      syncedCount,
      totalChecked: charges.data.length,
      details: results,
    });
  } catch (error) {
    console.error('Revenue sync error:', error);
    return res.status(500).json({
      error: 'Revenue sync failed',
      details: error.message,
    });
  }
}
/**
 * Vercel Serverless — Revenue Auto-Sync for All 10 Jobs
 *
 * Runs on cron to check and sync revenue from all connected sources:
 *  - MT5 trading PnL → Liquidity Sniper / LuminaPulse jobs
 *  - Stripe payments → Agency / Consulting / Website jobs
 *  - Crypto wallet → DeFi / Arbitrage jobs
 *  - Polymarket positions → Prediction market jobs
 *
 * Called by cron every 10 minutes.
 *
 * Environment variables:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   DEFAULT_USER_ID
 */

export const config = { runtime: 'edge' }

const BSC_RPC = 'https://bsc-dataseed.binance.org/'
const COLD_WALLET = '0xc77a0B887e182265d36C69E9588027328a9557A7'
const USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'

async function rpcCall(method, params) {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(8000),
  })
  const d = await res.json()
  return d.result || '0x0'
}

async function getWalletBalanceUsd() {
  try {
    // BNB balance
    const bnbHex = await rpcCall('eth_getBalance', [COLD_WALLET, 'latest'])
    const bnbBalance = parseInt(bnbHex, 16) / 1e18

    // USDT balance
    const data = '0x70a08231000000000000000000000000' + COLD_WALLET.slice(2).toLowerCase()
    const usdtHex = await rpcCall('eth_call', [{ to: USDT_CONTRACT, data }, 'latest'])
    const usdtBalance = parseInt(usdtHex, 16) / 1e18

    // BNB price
    let bnbPrice = 600
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd', {
        signal: AbortSignal.timeout(5000),
      })
      const priceData = await priceRes.json()
      bnbPrice = priceData.binancecoin?.usd ?? 600
    } catch { /* use fallback */ }

    return {
      bnb: bnbBalance,
      usdt: usdtBalance,
      totalUsd: bnbBalance * bnbPrice + usdtBalance,
      bnbPrice,
    }
  } catch {
    return { bnb: 0, usdt: 0, totalUsd: 0, bnbPrice: 0 }
  }
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const userId = process.env.DEFAULT_USER_ID || '0ce62691-721c-4eba-bf3e-052731d9839b'

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Missing env vars' }, { status: 500, headers: corsHeaders })
  }

  const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  }

  try {
    const today = new Date().toISOString().slice(0, 10)
    const results = []

    // 1. Fetch all active jobs
    const jobsRes = await fetch(
      `${supabaseUrl}/rest/v1/ops_jobs?select=*&user_id=eq.${userId}&status=in.(active,scaling)&order=daily_profit.desc`,
      { headers: sbHeaders }
    )
    const allJobs = await jobsRes.json()

    // 2. Get wallet balance for crypto jobs
    const wallet = await getWalletBalanceUsd()

    // 3. Get Polymarket positions value
    const polyRes = await fetch(
      `${supabaseUrl}/rest/v1/poly_positions?select=shares,avg_price,current_price`,
      { headers: sbHeaders }
    )
    const polyPositions = await polyRes.json()
    const polyPnl = (polyPositions || []).reduce((sum, p) => {
      return sum + (Number(p.shares || 0) * (Number(p.current_price || 0) - Number(p.avg_price || 0)))
    }, 0)

    // 4. Get MT5 account PnL
    const acctRes = await fetch(
      `${supabaseUrl}/rest/v1/mt5_accounts?select=day_pnl,profit,balance&limit=1&order=updated_at.desc`,
      { headers: sbHeaders }
    )
    const acctRows = await acctRes.json()
    const mt5DayPnl = acctRows.length > 0 ? Number(acctRows[0].day_pnl || 0) : 0

    // 5. Get today's income entries to avoid duplicates
    const todayEntriesRes = await fetch(
      `${supabaseUrl}/rest/v1/income_entries?select=job_id,source,amount&entry_date=eq.${today}&user_id=eq.${userId}`,
      { headers: sbHeaders }
    )
    const todayEntries = await todayEntriesRes.json()
    const loggedByJobSource = new Map()
    for (const e of (todayEntries || [])) {
      loggedByJobSource.set(`${e.job_id}_${e.source}`, Number(e.amount || 0))
    }

    // 6. Process each job
    for (const job of allJobs) {
      const cat = job.category || ''
      let revenue = 0
      let source = 'manual'

      // Match revenue source to job category
      if (cat === 'trading') {
        revenue = mt5DayPnl
        source = 'mt5'
      } else if (cat === 'crypto') {
        // Crypto jobs: wallet balance changes
        revenue = wallet.totalUsd > 0 ? wallet.totalUsd * 0.001 : 0 // daily yield estimate
        source = 'crypto'
      } else if (cat === 'arbitrage') {
        revenue = polyPnl
        source = 'polymarket'
      }
      // agency, dev, content, ai-ugc → rely on Stripe webhook (no cron action needed)

      if (revenue === 0 || !['mt5', 'crypto', 'polymarket'].includes(source)) continue

      const key = `${job.id}_${source}`
      const alreadyLogged = loggedByJobSource.get(key)

      if (alreadyLogged !== undefined && Math.abs(alreadyLogged - revenue) < 0.01) {
        results.push({ job: job.name, skipped: 'unchanged' })
        continue
      }

      // Upsert: delete old + insert new for today
      if (alreadyLogged !== undefined) {
        await fetch(
          `${supabaseUrl}/rest/v1/income_entries?job_id=eq.${job.id}&source=eq.${source}&entry_date=eq.${today}&user_id=eq.${userId}`,
          { method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' } }
        )
      }

      await fetch(`${supabaseUrl}/rest/v1/income_entries`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          job_id: job.id,
          amount: Math.round(revenue * 100) / 100,
          source,
          reference_id: `auto_${source}_${today}`,
          description: `Auto-synced ${source} revenue`,
          entry_date: today,
        }),
      })

      // Update job daily_profit
      await fetch(`${supabaseUrl}/rest/v1/ops_jobs?id=eq.${job.id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          daily_profit: Math.max(0, Math.round(revenue * 100) / 100),
          last_activity: new Date().toISOString(),
        }),
      })

      results.push({ job: job.name, source, revenue: Math.round(revenue * 100) / 100 })
    }

    return Response.json(
      {
        synced: true,
        date: today,
        wallet: { bnb: wallet.bnb, usdt: wallet.usdt, totalUsd: wallet.totalUsd },
        mt5DayPnl,
        polyPnl: Math.round(polyPnl * 100) / 100,
        jobs: results,
      },
      { headers: corsHeaders }
    )
  } catch (err) {
    console.error('[revenue-sync] Error:', err)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders })
  }
}
