/**
 * Stripe Webhook Handler â REAL payment processing
 *
 * Listens for checkout.session.completed events from Stripe.
 * On success:
 *   1. Inserts into `orders` table (product_id, buyer_email, amount)
 *   2. Inserts into `income_entries` table (for revenue tracking)
 *   3. Logs everything for debug visibility
 *
 * NEVER fakes success â only confirms after Stripe signature is verified.
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = {
  api: {
    bodyParser: false, // Stripe needs raw body for signature verification
  },
};

// Read raw body for signature verification
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, stripe-signature'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const log = (level, msg, data) => {
    const ts = new Date().toISOString();
    console[level](`[stripe-webhook][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
  };

  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      log('error', 'STRIPE_WEBHOOK_SECRET not configured');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    if (!sig) {
      log('error', 'No stripe-signature header present');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    // Get raw body for signature verification
    const rawBody = await getRawBody(req);

    // Verify webhook signature â this proves the request came from Stripe
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      log('error', 'Signature verification FAILED', { error: err.message });
      return res.status(400).json({ error: `Invalid signature: ${err.message}` });
    }

    log('info', `Event received: ${event.type}`, { id: event.id });

    // ââ Handle checkout.session.completed âââââââââââââââââââââââââââââ
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      log('info', 'Checkout session completed', {
        session_id: session.id,
        customer_email: session.customer_email || session.customer_details?.email,
        amount_total: session.amount_total,
        currency: session.currency,
        payment_status: session.payment_status,
        payment_intent: session.payment_intent,
      });

      const buyerEmail = session.customer_email || session.customer_details?.email || 'unknown';
      const amountDollars = (session.amount_total || 0) / 100;
      const currency = (session.currency || 'usd').toUpperCase();

      // ââ 1. Match to a product in stripe_products âââââââââââââââââ
      let productId = null;
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      if (lineItems?.data?.length > 0) {
        const stripePriceId = lineItems.data[0].price?.id;
        const stripeProductId = lineItems.data[0].price?.product;

        if (stripePriceId || stripeProductId) {
          const { data: matchedProduct } = await supabase
            .from('stripe_products')
            .select('id')
            .or(`stripe_price_id.eq.${stripePriceId},stripe_product_id.eq.${stripeProductId}`)
            .single();

          if (matchedProduct) {
            productId = matchedProduct.id;
            log('info', 'Matched to product', { productId, stripePriceId });
          } else {
            log('warn', 'No matching product found', { stripePriceId, stripeProductId });
          }
        }
      }

      // ââ 2. Insert into `orders` table ââââââââââââââââââââââââââââ
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          stripe_session_id: session.id,
          product_id: productId,
          buyer_email: buyerEmail,
          amount: amountDollars,
          currency,
          payment_status: session.payment_status || 'paid',
          stripe_payment_intent: session.payment_intent || null,
          metadata: {
            line_items: lineItems?.data?.map(li => ({
              description: li.description,
              amount: li.amount_total / 100,
              quantity: li.quantity,
            })),
          },
        })
        .select()
        .single();

      if (orderError) {
        // Duplicate session_id means we already processed this â that's OK
        if (orderError.code === '23505') {
          log('warn', 'Duplicate order â already processed', { session_id: session.id });
        } else {
          log('error', 'Failed to insert order', { error: orderError.message });
        }
      } else {
        log('info', 'Order created', { order_id: order?.id, amount: amountDollars });
      }

      // ââ 3. Insert into `income_entries` for revenue tracking âââââ
      const { data: job } = await supabase
        .from('ops_jobs')
        .select('id')
        .ilike('name', 'Digital%')
        .single();

      const { error: incomeError } = await supabase.from('income_entries').insert({
        job_id: job?.id || null,
        source: 'stripe',
        amount: amountDollars,
        currency,
        description: `Stripe payment: ${buyerEmail} â ${lineItems?.data?.[0]?.description || session.id}`,
        metadata: {
          stripe_session_id: session.id,
          customer_email: buyerEmail,
          payment_status: session.payment_status,
          order_id: order?.id || null,
        },
      });

      if (incomeError) {
        log('error', 'Failed to insert income entry', { error: incomeError.message });
      } else {
        log('info', 'Income entry recorded', { amount: amountDollars, email: buyerEmail });
      }
    }

    // ââ Handle payment_intent.payment_failed ââââââââââââââââââââââââ
    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      log('warn', 'Payment FAILED', {
        intent_id: intent.id,
        error: intent.last_payment_error?.message,
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    log('error', 'Unhandled webhook error', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
}
