import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      console.log(`Checkout session completed: ${session.id}`);
      console.log(`Customer email: ${session.customer_email}`);
      console.log(`Amount: ${session.amount_total} ${session.currency.toUpperCase()}`);

      // Get the job_id for 'Digital%' products
      const { data: job } = await supabase
        .from('ops_jobs')
        .select('id')
        .ilike('name', 'Digital%')
        .single();

      const jobId = job ? job.id : null;

      // Insert into income_entries
      const { error: insertError } = await supabase.from('income_entries').insert({
        job_id: jobId,
        source: 'stripe',
        amount: session.amount_total / 100, // Convert cents to dollars (preserve decimals)
        currency: session.currency.toUpperCase(),
        description: `Stripe checkout session: ${session.id}`,
        metadata: {
          stripe_session_id: session.id,
          customer_email: session.customer_email,
          payment_status: session.payment_status,
        },
      });

      if (insertError) {
        console.error('Error inserting income entry:', insertError);
        return res.status(500).json({
          error: 'Failed to record income entry',
          details: insertError.message,
        });
      }

      console.log(`Income entry recorded for session ${session.id}`);
    }

    // Return success
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      details: error.message,
    });
  }
}
