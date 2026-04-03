/**
 * Vercel Serverless — Stripe Webhook Handler
 *
 * Listens for Stripe events and auto-logs income to income_entries table.
 *
 * Supported events:
 *   - checkout.session.completed  → logs payment to matching job
 *   - invoice.paid               → logs recurring revenue
 *   - payment_intent.succeeded   → logs one-time payments
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY         — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET     — Webhook signing secret (whsec_...)
 *   SUPABASE_URL              — or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY      — service role key for writes
 *   DEFAULT_USER_ID           — fallback user ID
 */

// Edge runtime does NOT support Stripe signature verification with crypto.subtle
// easily, so we use Node.js runtime for webhook processing
export const config = { runtime: 'nodejs18.x' }

// Simple Stripe signature verification using Node.js crypto
import crypto from 'crypto'

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false
  const parts = sigHeader.split(',')
  const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1]
  const signature = parts.find(p => p.startsWith('v1='))?.split('=')[1]
  if (!timestamp || !signature) return false

  const signedPayload = `${timestamp}.${payload}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

// Job name → job category mapping for auto-matching Stripe payments to jobs
const JOB_MATCHERS = [
  { keywords: ['ugc', 'content', 'creative', 'arcads', 'kling'], category: 'ai-ugc' },
  { keywords: ['website', 'vibe', 'web dev', 'dev'], category: 'dev' },
  { keywords: ['agency', 'client', 'consulting', 'proposal'], category: 'agency' },
  { keywords: ['trading', 'mt5', 'forex', 'lumina'], category: 'trading' },
  { keywords: ['crypto', 'defi', 'liquidity', 'sniper'], category: 'crypto' },
  { keywords: ['arbitrage', 'polymarket', 'prediction'], category: 'arbitrage' },
  { keywords: ['seo', 'distribution', 'content'], category: 'content' },
]

function matchJobCategory(description) {
  const lower = (description || '').toLowerCase()
  for (const m of JOB_MATCHERS) {
    if (m.keywords.some(k => lower.includes(k))) return m.category
  }
  return null
}

export default async function handler(req, res) {
  // Only accept POST
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const userId = process.env.DEFAULT_USER_ID || '0ce62691-721c-4eba-bf3e-052731d9839b'

  if (!supabaseUrl || !supabaseKey) {
    console.error('[stripe-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  // Read raw body for signature verification
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const rawBody = Buffer.concat(chunks).toString('utf8')

  // Verify signature if webhook secret is set
  if (webhookSecret) {
    const sig = req.headers['stripe-signature']
    if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
      console.warn('[stripe-webhook] Signature verification failed')
      return res.status(400).json({ error: 'Invalid signature' })
    }
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  try {
    let amountUsd = 0
    let description = ''
    let sourceRef = ''

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        amountUsd = (session.amount_total || 0) / 100
        description = session.metadata?.job_name || session.customer_details?.name || 'Stripe checkout'
        sourceRef = session.id
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object
        amountUsd = (invoice.amount_paid || 0) / 100
        description = invoice.metadata?.job_name || invoice.customer_name || `Invoice ${invoice.number}`
        sourceRef = invoice.id
        break
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object
        amountUsd = (pi.amount || 0) / 100
        description = pi.metadata?.job_name || pi.description || 'Stripe payment'
        sourceRef = pi.id
        break
      }
      default:
        // Ignore other events
        return res.status(200).json({ received: true, ignored: event.type })
    }

    if (amountUsd <= 0) {
      return res.status(200).json({ received: true, skipped: 'zero amount' })
    }

    // Try to match to a job by category
    const category = matchJobCategory(description)
    let jobId = null

    if (category) {
      // Find first active job with this category
      const jobRes = await fetch(
        `${supabaseUrl}/rest/v1/ops_jobs?select=id&category=eq.${category}&status=eq.active&limit=1`,
        { headers: sbHeaders }
      )
      const jobs = await jobRes.json()
      if (jobs.length > 0) jobId = jobs[0].id
    }

    // If no category match, try metadata job_id
    if (!jobId && event.data.object.metadata?.job_id) {
      jobId = event.data.object.metadata.job_id
    }

    // Fallback: find ANY active job (revenue still gets logged)
    if (!jobId) {
      const fallbackRes = await fetch(
        `${supabaseUrl}/rest/v1/ops_jobs?select=id&status=eq.active&order=daily_profit.desc&limit=1`,
        { headers: sbHeaders }
      )
      const fallbackJobs = await fallbackRes.json()
      if (fallbackJobs.length > 0) jobId = fallbackJobs[0].id
    }

    // Insert income entry
    const entry = {
      user_id: userId,
      job_id: jobId,
      amount: amountUsd,
      source: 'stripe',
      reference_id: sourceRef,
      description: `${description} (${event.type})`,
      entry_date: new Date().toISOString().slice(0, 10),
    }

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/income_entries`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify(entry),
    })

    if (!insertRes.ok) {
      const errText = await insertRes.text()
      console.error('[stripe-webhook] Insert failed:', errText)
      return res.status(500).json({ error: 'Failed to log income', detail: errText })
    }

    // Also update the job's daily_profit (running tally)
    if (jobId) {
      // Fetch current daily_profit and add
      const jobDataRes = await fetch(
        `${supabaseUrl}/rest/v1/ops_jobs?select=daily_profit&id=eq.${jobId}`,
        { headers: sbHeaders }
      )
      const jobData = await jobDataRes.json()
      if (jobData.length > 0) {
        const newDaily = (jobData[0].daily_profit || 0) + amountUsd
        await fetch(`${supabaseUrl}/rest/v1/ops_jobs?id=eq.${jobId}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            daily_profit: Math.round(newDaily * 100) / 100,
            last_activity: new Date().toISOString(),
          }),
        })
      }
    }

    console.log(`[stripe-webhook] Logged $${amountUsd} from ${event.type} → job ${jobId}`)
    return res.status(200).json({
      received: true,
      logged: { amountUsd, jobId, source: 'stripe', ref: sourceRef },
    })
  } catch (err) {
    console.error('[stripe-webhook] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
