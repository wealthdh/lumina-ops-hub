/**
 * Supabase Edge Function: stripe-webhook
 *
 * Receives real Stripe events (charge.succeeded, payment_intent.succeeded,
 * invoice.paid) and logs them as income_entries so the dashboard shows live revenue.
 *
 * Setup in Stripe Dashboard:
 *   Dashboard → Developers → Webhooks → Add endpoint
 *   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
 *   Events: charge.succeeded, payment_intent.succeeded, invoice.paid, payout.paid
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY         — your Stripe secret key
 *   STRIPE_WEBHOOK_SECRET     — from Stripe webhook signing secret
 *   LUMINA_DEFAULT_JOB_ID     — fallback job ID if metadata.job_id not set
 *   LUMINA_DEFAULT_USER_ID    — your Supabase auth user ID (for service-role inserts)
 *
 * To set:
 *   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... LUMINA_DEFAULT_USER_ID=<your-user-id>
 */
import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

// ── Stripe signature verification (no SDK needed — pure crypto) ───────────────

async function verifyStripeSignature(body: string, header: string, secret: string): Promise<boolean> {
  try {
    const parts: Record<string, string> = {}
    for (const part of header.split(',')) {
      const [k, v] = part.split('=')
      if (k && v) parts[k] = v
    }
    const timestamp = parts['t']
    const sig       = parts['v1']
    if (!timestamp || !sig) return false

    // HMAC-SHA256(secret, `${timestamp}.${body}`)
    const key     = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const payload = new TextEncoder().encode(`${timestamp}.${body}`)
    const hmac    = await crypto.subtle.sign('HMAC', key, payload)
    const hex     = Array.from(new Uint8Array(hmac)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Constant-time compare
    if (hex.length !== sig.length) return false
    let diff = 0
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i)
    if (diff !== 0) return false

    // Reject events older than 5 minutes
    const age = Math.abs(Date.now() / 1000 - Number(timestamp))
    return age < 300
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  const body      = await req.text()
  const sigHeader = req.headers.get('stripe-signature') ?? ''
  const secret    = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

  // Verify signature
  const valid = secret ? await verifyStripeSignature(body, sigHeader, secret) : true
  if (!valid) {
    console.error('Invalid Stripe signature')
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: CORS })
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Fallback: hardcoded owner UUID (wealthdh@gmail.com — confirmed from auth.users 2026-04-14)
  // Override via: supabase secrets set LUMINA_DEFAULT_USER_ID=<uuid> --project-ref rjtxkjozlhvnxkzmqffk
  const defaultUserId = Deno.env.get('LUMINA_DEFAULT_USER_ID') ?? '0ce62691-721c-4eba-bf3e-052731d9839b'

  // Idempotency: stripe_events table does not yet exist in live DB.
  // Dedup is handled downstream via income_entries.reference_id UNIQUE index (23505 = skip).

  const obj = event.data.object
  let amountUsd: number | null = null
  let sourceRef = event.id
  let description: string | null = null

  try {
    switch (event.type) {
      // ── Successful charge ───────────────────────────────────────────────────
      case 'charge.succeeded': {
        const amount   = Number(obj.amount)          // in cents
        const currency = String(obj.currency ?? 'usd').toLowerCase()
        if (currency !== 'usd') break   // only USD for now
        amountUsd   = amount / 100
        sourceRef   = String(obj.id ?? event.id)
        description = String(obj.description ?? obj.statement_descriptor ?? 'Stripe charge')
        break
      }

      // ── Payment intent succeeded ────────────────────────────────────────────
      // SKIP if this PI came from a Checkout session — the Vercel webhook handler
      // covers checkout.session.completed for those, preventing double-counting.
      case 'payment_intent.succeeded': {
        const meta = obj.metadata as Record<string, string> | undefined
        if (meta?.checkout_session_id) {
          console.log(`PI ${String(obj.id)} belongs to checkout session — skipping (handled by Vercel webhook)`)
          break
        }
        const amount   = Number(obj.amount)
        const currency = String(obj.currency ?? 'usd').toLowerCase()
        if (currency !== 'usd') break
        amountUsd   = amount / 100
        sourceRef   = String(obj.id ?? event.id)
        description = String(obj.description ?? 'Stripe payment')
        break
      }

      // ── Invoice paid (recurring/subscription) ───────────────────────────────
      case 'invoice.paid': {
        const total    = Number(obj.amount_paid)
        const currency = String(obj.currency ?? 'usd').toLowerCase()
        if (currency !== 'usd') break
        amountUsd   = total / 100
        sourceRef   = String(obj.id ?? event.id)
        description = `Invoice paid: ${String(obj.number ?? 'recurring')}`
        break
      }

      // ── Payout from Stripe (money leaving Stripe → your bank) ──────────────
      case 'payout.paid': {
        const amount = Number(obj.amount)
        amountUsd   = amount / 100
        sourceRef   = String(obj.id ?? event.id)
        description = `Stripe payout to ${String(obj.destination ?? 'bank')}`
        break
      }

      default:
        // Log but don't process other event types
        console.log(`Unhandled event type: ${event.type}`)
    }

    // Insert income entry if we extracted a dollar amount
    // Column names: live DB uses income_schema_v2 (amount, reference_id, entry_date)
    // NOT the v1 names (amount_usd, source_ref, earned_at).
    // job_id is UUID FK to ops_jobs — omit (null) since we have no job UUID at webhook time.
    // stripe_events table does not yet exist in live DB — idempotency is handled via
    // income_entries.reference_id UNIQUE index instead.
    if (amountUsd && amountUsd > 0 && defaultUserId) {
      const { error: insertError } = await admin.from('income_entries').insert({
        user_id:      defaultUserId,
        // job_id omitted — nullable UUID FK, no lookup available at webhook time
        amount:       amountUsd,        // v2: 'amount' (was 'amount_usd' in v1)
        source:       'stripe',
        reference_id: sourceRef,        // v2: 'reference_id' (was 'source_ref' in v1)
        description:  description,
        entry_date:   new Date().toISOString().slice(0, 10), // v2: DATE string (was 'earned_at' TIMESTAMPTZ)
      })

      if (insertError) {
        // 23505 = unique_violation on reference_id = duplicate event, safe to ignore
        if (insertError.code !== '23505') {
          console.error('income_entries insert error:', insertError.message, insertError.code)
        } else {
          console.log('Duplicate reference_id — event already processed:', sourceRef)
        }
      }
    }

    return new Response(
      JSON.stringify({ received: true, amountUsd }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('stripe-webhook error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
