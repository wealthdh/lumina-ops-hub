/**
 * Create Stripe Checkout Session — REAL server-side checkout
 *
 * POST /api/create-checkout-session
 *   Body: { product_id: string }
 *   Returns: { url: string } — the Stripe Checkout URL to redirect to
 *
 * This creates a Stripe Checkout Session server-side, giving full control
 * over success/cancel URLs, metadata, and webhook matching.
 *
 * Flow:
 *   1. Look up product in stripe_products table
 *   2. Create Stripe Checkout Session with that price
 *   3. Return checkout URL → frontend redirects buyer
 *   4. On payment: Stripe fires webhook → stripe-webhook.js handles it
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[STRIPE][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Validate env ──────────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || stripeKey === 'sk_live_...' || stripeKey === 'sk_test_...') {
    log('error', 'STRIPE_SECRET_KEY not configured — set it in Vercel env vars');
    return res.status(500).json({
      error: 'Stripe not configured',
      details: 'STRIPE_SECRET_KEY is missing or placeholder. Add your real Stripe secret key to Vercel environment variables.',
      setup_url: 'https://dashboard.stripe.com/apikeys',
    });
  }

  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Supabase env vars missing');
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  const stripe = new Stripe(stripeKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: 'product_id is required' });
    }

    log('info', 'Creating checkout session', { product_id });

    // ── 1. Look up product in Supabase ──────────────────────────────────────
    const { data: product, error: prodErr } = await supabase
      .from('stripe_products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (prodErr || !product) {
      log('error', 'Product not found', { product_id, error: prodErr?.message });
      return res.status(404).json({ error: 'Product not found' });
    }

    log('info', 'Product found', {
      name: product.product_name,
      stripe_price_id: product.stripe_price_id,
      price_cents: product.price_cents,
    });

    // ── 2. Ensure we have a Stripe Price ID ─────────────────────────────────
    let priceId = product.stripe_price_id;

    if (!priceId) {
      // Product exists in DB but doesn't have Stripe objects yet — create them
      log('info', 'No stripe_price_id — creating Stripe product + price');

      const stripeProduct = await stripe.products.create({
        name: product.product_name,
        metadata: { supabase_id: product.id },
      });

      const stripePrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: product.price_cents,
        currency: 'usd',
      });

      // Update Supabase with Stripe IDs
      await supabase
        .from('stripe_products')
        .update({
          stripe_product_id: stripeProduct.id,
          stripe_price_id: stripePrice.id,
        })
        .eq('id', product.id);

      priceId = stripePrice.id;
      log('info', 'Created Stripe product + price', {
        stripe_product_id: stripeProduct.id,
        stripe_price_id: priceId,
      });
    }

    // ── 3. Determine redirect URLs ──────────────────────────────────────────
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      req.headers.origin ||
      req.headers.referer?.replace(/\/$/, '') ||
      'http://localhost:5173';

    const successUrl = `${siteUrl}/?checkout=success&product=${encodeURIComponent(product.product_name)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl}/?checkout=cancelled&product=${encodeURIComponent(product.product_name)}`;

    // ── 4. Create Stripe Checkout Session ────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Collect buyer email for order matching
      customer_email: undefined, // Let Stripe collect it
      metadata: {
        supabase_product_id: product.id,
        product_name: product.product_name,
      },
    });

    log('info', 'Checkout session created', {
      session_id: session.id,
      url: session.url,
      success_url: successUrl,
    });

    return res.status(200).json({
      url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    log('error', 'Failed to create checkout session', {
      error: error.message,
      type: error.type,
      code: error.code,
      stack: error.stack,
    });

    // Provide actionable error messages
    if (error.type === 'StripeAuthenticationError') {
      return res.status(401).json({
        error: 'Stripe authentication failed',
        details: 'Your STRIPE_SECRET_KEY is invalid. Check https://dashboard.stripe.com/apikeys',
      });
    }

    return res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message,
    });
  }
}
