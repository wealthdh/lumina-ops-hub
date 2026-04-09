/**
 * Create Payment Links — REAL Stripe product + price + payment link creation
 *
 * POST /api/create-payment-links
 *   Creates Stripe products, prices, and payment links for all catalog items.
 *   Each payment link includes after_completion redirect to success page.
 *   Skips products that already exist in stripe_products table.
 *
 * GET /api/create-payment-links?action=orders
 *   Returns recent orders from the orders table (for dashboard polling).
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const products = [
  {
    name: 'MT5 Gold Scalper EA',
    price: 9700,
    description: 'Professional MT5 Expert Advisor for gold scalping with Kelly criterion sizing',
  },
  {
    name: 'Polymarket Edge Scanner',
    price: 4700,
    description: 'AI-powered scanner for high-edge prediction market opportunities',
  },
  {
    name: 'AI Prompt Engineering Toolkit',
    price: 2900,
    description: '200+ tested prompts for trading, content creation, and automation',
  },
  {
    name: 'Content Swarm Templates',
    price: 1900,
    description: 'Ready-to-deploy templates for multi-platform content distribution',
  },
  {
    name: 'Kelly Calculator Pro',
    price: 1499,
    description: 'Advanced position sizing calculator with Monte Carlo simulation',
  },
];

const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[STRIPE][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ── Validate env vars at handler entry ────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || stripeKey === 'sk_live_...' || stripeKey === 'sk_test_...') {
    log('error', 'STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Supabase env vars missing');
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  const stripe = new Stripe(stripeKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ─── Site URL for redirects ──────────────────────────────────────────────────
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

  // ── GET: Fetch recent orders ──────────────────────────────────────────────
  if (req.method === 'GET' && req.query?.action === 'orders') {
    try {
      const limit = parseInt(req.query?.limit || '50', 10);
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, stripe_session_id, product_id, buyer_email, amount, currency, payment_status, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (ordersErr) {
        log('error', 'Failed to fetch orders', { error: ordersErr.message });
        return res.status(500).json({ error: ordersErr.message });
      }

      return res.status(200).json({ orders: orders || [], count: (orders || []).length });
    } catch (err) {
      log('error', 'Orders fetch error', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    log('info', 'Creating payment links — starting', { product_count: products.length });
    const results = [];

    for (const product of products) {
      // Check if product already exists in database
      const { data: existing } = await supabase
        .from('stripe_products')
        .select('*')
        .eq('product_name', product.name)
        .single();

      if (existing) {
        log('info', 'Product already exists — skipping', { name: product.name });
        results.push({
          product_name: product.name,
          payment_url: existing.payment_url,
          status: 'already_exists',
        });
        continue;
      }

      // Create Stripe product
      const stripeProduct = await stripe.products.create({
        name: product.name,
        description: product.description,
        metadata: {
          internal_product_name: product.name,
        },
      });
      log('info', 'Stripe product created', { id: stripeProduct.id, name: product.name });

      // Create price
      const price = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: product.price,
        currency: 'usd',
      });
      log('info', 'Stripe price created', { id: price.id, amount: product.price });

      // Create payment link WITH after_completion redirect
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${SITE_URL}/?checkout=success&product=${encodeURIComponent(product.name)}`,
          },
        },
        // Collect email for order matching
        phone_number_collection: { enabled: false },
      });
      log('info', 'Payment link created', { id: paymentLink.id, url: paymentLink.url });

      // Insert into Supabase
      const { error } = await supabase.from('stripe_products').insert({
        product_name: product.name,
        stripe_product_id: stripeProduct.id,
        stripe_price_id: price.id,
        stripe_payment_link_id: paymentLink.id,
        payment_url: paymentLink.url,
        price_cents: product.price,
        status: 'active',
      });

      if (error) {
        log('error', 'Supabase insert failed', { error: error.message, product: product.name });
        throw error;
      }

      results.push({
        product_name: product.name,
        payment_url: paymentLink.url,
        stripe_product_id: stripeProduct.id,
        stripe_price_id: price.id,
        status: 'created',
      });
    }

    log('info', 'Payment links creation complete', {
      total: results.length,
      created: results.filter(r => r.status === 'created').length,
      existing: results.filter(r => r.status === 'already_exists').length,
    });

    return res.status(200).json({
      success: true,
      message: 'Payment links created successfully',
      products: results,
    });
  } catch (error) {
    log('error', 'Unhandled error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      error: 'Failed to create payment links',
      details: error.message,
    });
  }
}
