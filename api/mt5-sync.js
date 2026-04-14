/**
 * MT5 P&L Sync — reads trades from mt5_trades, calculates daily/monthly P&L
 * Runs every 15 min via Vercel cron, or manually via GET /api/mt5-sync
 *
 * Schema fix (2026-04-14): mt5_trades uses open_time (not closed_at),
 * and only has a profit column (no loss/commission).
 */
import { createClient } from '@supabase/supabase-js';

const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[MT5][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Supabase env vars missing');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    log('info', 'Starting MT5 P&L sync');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startOfDay = today.toISOString();

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const endOfDay = tomorrow.toISOString();

    // Today's trades — uses open_time (the column that actually exists)
    const { data: todayTrades, error: tradesError } = await supabase
      .from('mt5_trades')
      .select('profit')
      .gte('open_time', startOfDay)
      .lt('open_time', endOfDay);

    if (tradesError) {
      log('error', 'Failed to fetch today trades', { error: tradesError.message });
      throw new Error(`Failed to fetch trades: ${tradesError.message}`);
    }

    let dailyProfit = 0;
    for (const trade of (todayTrades || [])) {
      dailyProfit += (trade.profit || 0);
    }

    log('info', `Daily P&L: $${dailyProfit.toFixed(2)}`, { trades: (todayTrades || []).length });

    // Monthly trades
    const monthStart = new Date(today);
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { data: monthTrades, error: monthTradesError } = await supabase
      .from('mt5_trades')
      .select('profit')
      .gte('open_time', monthStart.toISOString())
      .lt('open_time', endOfDay);

    if (monthTradesError) {
      log('error', 'Failed to fetch monthly trades', { error: monthTradesError.message });
      throw new Error(`Failed to fetch monthly trades: ${monthTradesError.message}`);
    }

    let monthlyProfit = 0;
    for (const trade of (monthTrades || [])) {
      monthlyProfit += (trade.profit || 0);
    }

    log('info', `Monthly P&L: $${monthlyProfit.toFixed(2)}`, { trades: (monthTrades || []).length });

    // Update LuminaPulse job row in ops_jobs
    const { data: job } = await supabase
      .from('ops_jobs')
      .select('id')
      .ilike('name', '%LuminaPulse%')
      .single();

    if (job) {
      const { error: updateError } = await supabase
        .from('ops_jobs')
        .update({
          daily_profit: dailyProfit,
          monthly_profit: monthlyProfit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (updateError) {
        log('error', 'Failed to update ops_jobs', { error: updateError.message });
      } else {
        log('info', 'Updated LuminaPulse job with P&L data');
      }
    } else {
      log('warn', 'LuminaPulse job not found in ops_jobs — skipping update');
    }

    return res.status(200).json({
      success: true,
      message: 'MT5 P&L sync complete',
      daily_profit: parseFloat(dailyProfit.toFixed(2)),
      monthly_profit: parseFloat(monthlyProfit.toFixed(2)),
      trades_today: (todayTrades || []).length,
      trades_this_month: (monthTrades || []).length,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    log('error', 'MT5 sync failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'MT5 sync failed', details: error.message });
  }
}
