/**
 * Stripe Webhook Handler — REAL payment processing with UGC attribution
 *
 * Handles:
 *   checkout.session.completed
 *   payment_intent.succeeded (fallback for direct PI flows)
 *   payment_intent.payment_failed (logging)
 *
 * Attribution chain (in priority order):
 *   1. session.metadata.creative_id  — set by our checkout flow
 *   2. session.metadata.utm_content  — UTM content param = creative_id
 *   3. client_reference_id           — Stripe field we set to creative_id
 *   4. utm_source/campaign from metadata for product-level attribution
 *   5. product key lookup → most-recent matching creative (fallback)
 *
 * Idempotency: conversion_events.stripe_event_id is UNIQUE — duplicate
 * events from Stripe are silently ignored.
 *
 * On success:
 *   1. Verify Stripe signature
 *   2. Check for duplicate (idempotency)
 *   3. Resolve creative_id via attribution chain
 *   4. Insert into `conversion_events`
 *   5. Call update_creative_conversion RPC → conversions++, revenue_usd+=, cvr, roas
 *   6. Insert into `income_entries` (with creative_id set)
 *   7. Insert into `orders` (existing behavior preserved)
 *   8. Log all steps
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Service role client — bypasses RLS for webhook writes
const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''
)

export const config = {
  api: { bodyParser: false },
}

// ─── Product key map ───────────────────────────────────────────────────────────
// Maps Stripe product name fragments → our internal product keys
// Must match the keys used in monetization_url UTM links
const PRODUCT_KEY_MAP = [
  { keys: ['mt5', 'gold', 'scalper', 'ea'],        product: 'mt5-gold',   name: 'MT5 Gold Scalper EA',        price: 97   },
  { keys: ['polymarket', 'edge', 'scanner'],        product: 'polymarket', name: 'Polymarket Edge Scanner',    price: 47   },
  { keys: ['ai', 'prompt', 'toolkit'],              product: 'ai-prompt',  name: 'AI Prompt Toolkit',          price: 29   },
  { keys: ['ugc', 'swarm', 'template'],             product: 'ugc-swarm',  name: 'UGC Swarm Templates',        price: 19   },
  { keys: ['kelly', 'calculator', 'pro'],           product: 'kelly-pro',  name: 'Kelly Pro Calculator',       price: 14.99},
]

function resolveProductKey(nameOrDesc) {
  if (!nameOrDesc) return null
  const lower = nameOrDesc.toLowerCase()
  for (const p of PRODUCT_KEY_MAP) {
    if (p.keys.some(k => lower.includes(k))) return p
  }
  return null
}

// ─── Raw body reader ───────────────────────────────────────────────────────────
async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(level, msg, data) {
  const ts = new Date().toISOString()
  console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](
    `[STRIPE][${ts}] ${msg}`,
    data ? JSON.stringify(data, null, 0) : ''
  )
}

// ─── Idempotency check ────────────────────────────────────────────────────────
async function alreadyProcessed(stripeEventId) {
  const { data } = await supabase
    .from('conversion_events')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .single()
  return !!data
}

// ─── Attribution resolver ─────────────────────────────────────────────────────
// Returns { creativeId, method } — creativeId may be null if unresolvable
async function resolveCreative(session, lineItemDesc) {
  const meta = session.metadata ?? {}

  // 1. Explicit creative_id in metadata (highest confidence)
  if (meta.creative_id && isUUID(meta.creative_id)) {
    const exists = await creativeExists(meta.creative_id)
    if (exists) return { creativeId: meta.creative_id, method: 'metadata' }
    log('warn', 'metadata.creative_id not found in DB', { creative_id: meta.creative_id })
  }

  // 2. utm_content (we embed creative_id there in UTM links)
  const utmContent = meta.utm_content ?? session.client_reference_id
  if (utmContent && isUUID(utmContent)) {
    const exists = await creativeExists(utmContent)
    if (exists) return { creativeId: utmContent, method: 'utm_content' }
  }

  // 3. client_reference_id as creative UUID
  if (session.client_reference_id && isUUID(session.client_reference_id)) {
    const exists = await creativeExists(session.client_reference_id)
    if (exists) return { creativeId: session.client_reference_id, method: 'client_reference_id' }
  }

  // 4. Product-level fallback: find most-recently-posted matching creative
  const productEntry = resolveProductKey(lineItemDesc ?? meta.product_name ?? '')
  if (productEntry) {
    const { data } = await supabase
      .from('ugc_creatives')
      .select('id')
      .ilike('monetization_url', `%${productEntry.product}%`)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(1)
      .single()
    if (data?.id) return { creativeId: data.id, method: `product_map:${productEntry.product}` }
  }

  // 5. Truly unknown — record conversion against no creative
  return { creativeId: null, method: 'fallback' }
}

async function creativeExists(uuid) {
  const { data } = await supabase
    .from('ugc_creatives')
    .select('id')
    .eq('id', uuid)
    .single()
  return !!data
}

function isUUID(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? ''))
}

// ─── Core attribution handler ─────────────────────────────────────────────────
async function handleConversion({ stripeEventId, session, intentId, amountUsd, currency, buyerEmail }) {
  // ── Idempotency guard ──────────────────────────────────────────────────────
  if (await alreadyProcessed(stripeEventId)) {
    log('warn', 'Duplicate event — skipping', { stripeEventId })
    return { skipped: true }
  }

  // ── Fetch line items for product resolution ────────────────────────────────
  let lineItems = null
  let lineItemDesc = null
  let stripePriceId = null
  let stripeProductId = null
  try {
    if (session?.id) {
      const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
      lineItems = li.data
      lineItemDesc = lineItems?.[0]?.description ?? null
      stripePriceId = lineItems?.[0]?.price?.id ?? null
      stripeProductId = lineItems?.[0]?.price?.product ?? null
    }
  } catch (e) {
    log('warn', 'Failed to fetch line items', { error: e.message })
  }

  // ── Resolve product info ───────────────────────────────────────────────────
  const productEntry = resolveProductKey(lineItemDesc ?? session?.metadata?.product_name ?? '')
  const productKey  = productEntry?.product ?? null
  const productName = productEntry?.name ?? lineItemDesc ?? session?.metadata?.product_name ?? null

  // ── Resolve creative attribution ───────────────────────────────────────────
  const { creativeId, method: attributionMethod } = await resolveCreative(session ?? {}, lineItemDesc)

  log('info', 'Attribution resolved', { creativeId, attributionMethod, productKey, amountUsd })

  // ── 1. Insert conversion_events (idempotency key) ─────────────────────────
  const { data: convEvent, error: convError } = await supabase
    .from('conversion_events')
    .insert({
      stripe_event_id:    stripeEventId,
      stripe_session_id:  session?.id ?? null,
      stripe_intent_id:   intentId ?? null,
      creative_id:        creativeId,
      utm_source:         session?.metadata?.utm_source  ?? null,
      utm_medium:         session?.metadata?.utm_medium  ?? null,
      utm_campaign:       session?.metadata?.utm_campaign ?? null,
      utm_content:        session?.metadata?.utm_content ?? session?.client_reference_id ?? null,
      attribution_method: attributionMethod,
      amount_usd:         amountUsd,
      product_name:       productName,
      product_key:        productKey,
      buyer_email:        buyerEmail,
      currency:           currency,
    })
    .select('id')
    .single()

  if (convError) {
    if (convError.code === '23505') {
      log('warn', 'conversion_events duplicate — skipping', { stripeEventId })
      return { skipped: true }
    }
    log('error', 'Failed to insert conversion_event', { error: convError.message })
    // Don't throw — still try income_entries below
  } else {
    log('info', 'Conversion event recorded', { convEventId: convEvent?.id, creativeId, amountUsd })
  }

  // ── 2. Update ugc_creative stats via RPC ──────────────────────────────────
  if (creativeId) {
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('update_creative_conversion', {
        p_creative_id:  creativeId,
        p_amount_usd:   amountUsd,
        p_stripe_event: stripeEventId,
      })

    if (rpcError) {
      log('error', 'update_creative_conversion RPC failed', { error: rpcError.message, creativeId })
    } else {
      log('info', 'Creative stats updated', { result: rpcResult })
    }
  }

  // ── 3. Resolve job_id + user_id for income_entries ──────────────────────
  // user_id is NOT NULL in income_entries — resolve from creative owner or job owner.
  let resolvedUserId = null

  if (creativeId) {
    const { data: creative } = await supabase
      .from('ugc_creatives')
      .select('user_id')
      .eq('id', creativeId)
      .single()
    resolvedUserId = creative?.user_id ?? null
  }

  const { data: job } = await supabase
    .from('ops_jobs')
    .select('id, user_id')
    .or('name.ilike.%Digital%,name.ilike.%UGC%,name.ilike.%Content%')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!resolvedUserId) resolvedUserId = job?.user_id ?? null

  // If we still can't resolve user_id, fall back to LUMINA_DEFAULT_USER_ID env var
  if (!resolvedUserId) {
    resolvedUserId = process.env.LUMINA_DEFAULT_USER_ID ?? null
  }

  if (!resolvedUserId) {
    log('error', 'Could not resolve user_id for income_entry — skipping insert', { stripeEventId })
  }

  // ── 4. Insert income_entry with creative_id linked ───────────────────────
  // income_entries uses v2 schema: amount (not amount_usd), reference_id, entry_date
  const { data: incomeEntry, error: incomeError } = resolvedUserId ? await supabase
    .from('income_entries')
    .insert({
      user_id:      resolvedUserId,
      job_id:       job?.id ?? 'unknown',
      source:       'stripe',
      amount:       amountUsd,
      description:  `${productName ?? 'Product'} — ${buyerEmail}`,
      reference_id: stripeEventId,
      entry_date:   new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single() : { data: null, error: null }

  if (incomeError) {
    // 23505 = duplicate reference_id = already processed via another path
    if (incomeError.code !== '23505') {
      log('error', 'Failed to insert income_entry', { error: incomeError.message })
    }
  } else if (incomeEntry) {
    log('info', 'Income entry recorded', { id: incomeEntry.id, amount: amountUsd })
    // Backfill conversion_event.income_entry_id — only when insert succeeded and returned a row
    if (convEvent?.id && incomeEntry.id) {
      await supabase
        .from('conversion_events')
        .update({ income_entry_id: incomeEntry.id })
        .eq('id', convEvent.id)
    }
  } else {
    // resolvedUserId was null — income entry skipped, no backfill needed
    log('warn', 'Income entry not created (no user_id resolved) — skipping backfill', { stripeEventId })
  }

  // ── 5. Insert / upsert orders table (legacy behavior preserved) ───────────
  let orderId = null
  if (session?.id) {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        stripe_session_id:       session.id,
        product_id:              null,   // will be backfilled by product sync job
        buyer_email:             buyerEmail,
        amount:                  amountUsd,
        currency,
        payment_status:          session?.payment_status ?? 'paid',
        stripe_payment_intent:   intentId ?? null,
        metadata: {
          attribution_method: attributionMethod,
          creative_id:        creativeId,
          product_key:        productKey,
          utm_source:         session?.metadata?.utm_source ?? null,
          line_items:         (lineItems ?? []).map(li => ({
            description: li.description,
            amount:      li.amount_total / 100,
            quantity:    li.quantity,
          })),
        },
      })
      .select('id')
      .single()

    if (orderError) {
      if (orderError.code !== '23505') {
        log('error', 'Failed to insert order', { error: orderError.message })
      }
    } else {
      orderId = order?.id
      // Update conversion_event with order_id
      if (convEvent?.id && orderId) {
        await supabase
          .from('conversion_events')
          .update({ order_id: orderId })
          .eq('id', convEvent.id)
      }
    }
  }

  return { creativeId, attributionMethod, amountUsd, productKey, orderId }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, stripe-signature')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    log('error', 'STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Webhook secret not configured' })
  }

  const sig = req.headers['stripe-signature']
  if (!sig) {
    log('error', 'Missing stripe-signature header')
    return res.status(400).json({ error: 'Missing stripe-signature header' })
  }

  let event
  try {
    const rawBody = await getRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    log('error', 'Signature verification failed', { error: err.message })
    return res.status(400).json({ error: `Invalid signature: ${err.message}` })
  }

  log('info', `Event received: ${event.type}`, { id: event.id })

  try {
    // ── checkout.session.completed ────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        log('warn', 'Session not paid — skipping attribution', { status: session.payment_status })
        return res.status(200).json({ received: true, skipped: 'not_paid' })
      }

      const amountUsd  = (session.amount_total ?? 0) / 100
      const currency   = (session.currency ?? 'usd').toUpperCase()
      const buyerEmail = session.customer_email ?? session.customer_details?.email ?? 'unknown'

      log('info', 'Processing checkout', {
        session_id: session.id,
        buyer: buyerEmail,
        amount: amountUsd,
      })

      const result = await handleConversion({
        stripeEventId: event.id,
        session,
        intentId:      session.payment_intent ?? null,
        amountUsd,
        currency,
        buyerEmail,
      })

      log('info', 'Checkout processed', result)
    }

    // ── payment_intent.succeeded ──────────────────────────────────────────
    // Fires for direct PaymentIntent flows (not Checkout) — less UTM info
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object

      // Skip if we'll also get checkout.session.completed for this (avoid double-count)
      // PaymentIntent from Checkout will have metadata.checkout_session_id set by our code
      if (intent.metadata?.checkout_session_id) {
        log('info', 'PI succeeded — deferring to checkout.session.completed', { intent_id: intent.id })
        return res.status(200).json({ received: true, deferred: true })
      }

      const amountUsd  = (intent.amount ?? 0) / 100
      const currency   = (intent.currency ?? 'usd').toUpperCase()
      const buyerEmail = intent.receipt_email ?? intent.metadata?.email ?? 'unknown'

      // Build a pseudo-session from the intent for attribution
      const pseudoSession = {
        id:                    null,
        payment_status:        'paid',
        payment_intent:        intent.id,
        client_reference_id:   intent.metadata?.creative_id ?? intent.metadata?.client_reference_id ?? null,
        metadata:              intent.metadata ?? {},
        customer_email:        buyerEmail,
        customer_details:      null,
        amount_total:          intent.amount,
        currency:              intent.currency,
      }

      log('info', 'Processing PI', { intent_id: intent.id, amount: amountUsd, buyer: buyerEmail })

      const result = await handleConversion({
        stripeEventId: event.id,
        session:       pseudoSession,
        intentId:      intent.id,
        amountUsd,
        currency,
        buyerEmail,
      })

      log('info', 'PI processed', result)
    }

    // ── payment_intent.payment_failed ─────────────────────────────────────
    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object
      log('warn', 'Payment FAILED', {
        intent_id: intent.id,
        error:     intent.last_payment_error?.message ?? 'unknown',
        buyer:     intent.receipt_email ?? 'unknown',
      })
    }

    return res.status(200).json({ received: true })

  } catch (err) {
    log('error', 'Unhandled webhook error', { error: err.message, stack: err.stack })
    // Return 200 to Stripe — prevents infinite retries for non-transient errors
    return res.status(200).json({ received: true, error: err.message })
  }
}
