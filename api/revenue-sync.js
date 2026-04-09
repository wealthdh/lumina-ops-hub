/**
 * Revenue Sync — pulls recent Stripe charges into income_entries
 * Runs hourly via Vercel cron, or manually via GET /api/revenue-sync
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[STRIPE][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || stripeKey.startsWith('sk_live_...') || stripeKey.startsWith('sk_test_...')) {
    log('error', 'STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Supabase env vars missing');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const stripe = new Stripe(stripeKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    log('info', 'Starting revenue sync', { since: new Date(twentyFourHoursAgo * 1000).toISOString() });

    const charges = await stripe.charges.list({
      created: { gte: twentyFourHoursAgo },
      limit: 100,
    });

    log('info', `Found ${charges.data.length} charges in Stripe`);

    const { data: job } = await supabase
      .from('ops_jobs')
      .select('id')
      .ilike('name', 'Digital%')
      .single();

    const jobId = job ? job.id : null;
    let syncedCount = 0;
    const results = [];

    for (const charge of charges.data) {
      const { data: existing } = await supabase
        .from('income_entries')
        .select('id')
        .eq('source', 'stripe')
        .ilike('description', `%${charge.id}%`)
        .maybeSingle();

      if (existing) {
        results.push({ charge_id: charge.id, status: 'already_synced' });
        continue;
      }

      const { error: insertError } = await supabase.from('income_entries').insert({
        job_id: jobId,
        source: 'stripe',
        amount: charge.amount / 100,
        currency: charge.currency.toUpperCase(),
        description: `Stripe charge: ${charge.description || 'Digital product sale'} [${charge.id}]`,
        metadata: {
          stripe_charge_id: charge.id,
          customer_email: charge.billing_details?.email,
          charge_status: charge.status,
        },
      });

      if (insertError) {
        log('error', `Failed to insert charge ${charge.id}`, { error: insertError.message });
        results.push({ charge_id: charge.id, status: 'failed', error: insertError.message });
        continue;
      }

      syncedCount++;
      log('info', `Synced charge ${charge.id}: $${(charge.amount / 100).toFixed(2)}`);
      results.push({ charge_id: charge.id, amount: charge.amount / 100, status: 'synced' });
    }

    log('info', 'Revenue sync complete', { synced: syncedCount, total: charges.data.length });

    return res.status(200).json({
      success: true,
      message: `Revenue sync complete: ${syncedCount} new charges synced`,
      syncedCount,
      totalChecked: charges.data.length,
      details: results,
    });
  } catch (error) {
    log('error', 'Revenue sync failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Revenue sync failed', details: error.message });
  }
}
