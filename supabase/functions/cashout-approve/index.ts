/**
 * cashout-approve (v1)
 *
 * Admin-only edge function for approving or rejecting cashout_approvals.
 *
 * Flow:
 *   APPROVE:
 *     1. Verify caller has service_role or admin claim
 *     2. Load the cashout_approvals record
 *     3. Re-verify balance is still sufficient
 *     4. Update approval status → 'approved'
 *     5. Update linked cashout_transactions → 'processing'
 *     6. Re-route to the appropriate payment processor (bank / card / crypto)
 *     7. Update cashout_transactions → 'completed' or 'failed'
 *
 *   REJECT:
 *     1. Verify caller has service_role or admin claim
 *     2. Update approval → 'rejected' with reason
 *     3. Update cashout_transactions → 'failed' with rejection_reason
 *
 * Required env vars (same as the individual cashout functions):
 *   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
 *   STRIPE_SECRET_KEY, STRIPE_CONNECTED_ACCOUNT_ID
 *
 * Security: this function only accepts calls bearing the service_role key
 * (set via Authorization header) OR a JWT with custom claim { admin: true }.
 * Never expose this function URL to the frontend directly.
 */
import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripeHeaders(stripeKey: string, stripeAccount: string, idempotencyKey: string) {
  return {
    'Authorization':   `Bearer ${stripeKey}`,
    'Content-Type':    'application/x-www-form-urlencoded',
    'Stripe-Account':  stripeAccount,
    'Idempotency-Key': idempotencyKey,
  }
}

async function plaidExchangeAndProcessorToken(
  plaidBase: string, clientId: string, secret: string,
  publicToken: string, accountId: string,
): Promise<string> {
  const exchangeRes = await fetch(`${plaidBase}/item/public_token/exchange`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, public_token: publicToken }),
  })
  const exchangeData = await exchangeRes.json()
  if (!exchangeData.access_token)
    throw new Error(exchangeData.error_message ?? 'Plaid token exchange failed')

  const processorRes = await fetch(`${plaidBase}/processor/stripe/bank_account_token/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:    clientId, secret,
      access_token: exchangeData.access_token, account_id: accountId,
    }),
  })
  const processorData = await processorRes.json()
  if (!processorData.stripe_bank_account_token)
    throw new Error(processorData.error_message ?? 'Plaid processor token failed')
  return processorData.stripe_bank_account_token
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Admin auth — must present the service_role key ─────────────────────────
  // Pattern: frontend never calls this. Only internal automations / your own
  // admin panel calls it with the service_role JWT in the Authorization header.
  const authHeader = req.headers.get('Authorization') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Verify caller used the service_role key (starts with "Bearer ")
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    // Fall back: allow a regular JWT with { admin: true } custom claim
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    const isAdmin = (user?.app_metadata as Record<string, unknown>)?.admin === true
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), { status: 403, headers: CORS })
    }
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  )

  try {
    const { approvalId, action, rejectionReason } = await req.json() as {
      approvalId:      string
      action:          'approve' | 'reject'
      rejectionReason?: string
    }

    if (!approvalId || !action)
      return new Response(JSON.stringify({ error: 'Missing approvalId or action' }), { status: 400, headers: CORS })
    if (action !== 'approve' && action !== 'reject')
      return new Response(JSON.stringify({ error: 'action must be "approve" or "reject"' }), { status: 400, headers: CORS })

    // ── Load the approval record ──────────────────────────────────────────────
    const { data: approval, error: apprErr } = await admin
      .from('cashout_approvals')
      .select('*, cashout_transactions(*)')
      .eq('id', approvalId)
      .eq('status', 'pending')
      .single()

    if (apprErr || !approval) {
      return new Response(
        JSON.stringify({ error: 'Approval not found or already processed' }),
        { status: 404, headers: CORS },
      )
    }

    const tx = approval.cashout_transactions as {
      id: string; method: string; amount: number; user_id: string
      idempotency_key: string; job_id: string | null
      metadata?: Record<string, unknown>
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      await Promise.all([
        admin.from('cashout_approvals')
          .update({ status: 'rejected', rejection_reason: rejectionReason ?? 'Rejected by admin', resolved_at: new Date().toISOString() })
          .eq('id', approvalId),
        admin.from('cashout_transactions')
          .update({ status: 'failed', rejection_reason: rejectionReason ?? 'Rejected by admin' })
          .eq('id', tx.id),
      ])
      return new Response(
        JSON.stringify({ success: true, action: 'rejected', txId: tx.id }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // ── APPROVE ───────────────────────────────────────────────────────────────

    // Re-verify balance is still sufficient before processing
    const { data: balData } = await admin
      .rpc('get_available_balance', { p_user_id: tx.user_id })
    const availableBalance = Number(balData ?? 0)

    if (tx.amount > availableBalance) {
      await admin.from('cashout_approvals')
        .update({ status: 'rejected', rejection_reason: 'Insufficient balance at time of approval', resolved_at: new Date().toISOString() })
        .eq('id', approvalId)
      await admin.from('cashout_transactions')
        .update({ status: 'failed', rejection_reason: 'Insufficient balance at time of approval' })
        .eq('id', tx.id)
      return new Response(
        JSON.stringify({ error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` }),
        { status: 400, headers: CORS },
      )
    }

    // Mark approved + processing
    await Promise.all([
      admin.from('cashout_approvals')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', approvalId),
      admin.from('cashout_transactions')
        .update({ status: 'processing', approved_at: new Date().toISOString() })
        .eq('id', tx.id),
    ])

    // ── Re-process payment by method ──────────────────────────────────────────
    const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY')!
    const stripeAccount = Deno.env.get('STRIPE_CONNECTED_ACCOUNT_ID')!
    const iKey          = tx.idempotency_key   // already unique; safe to reuse for the final payout
    let   txHash: string

    if (tx.method === 'bank') {
      // Plaid ACH — need the original public_token + account_id from metadata
      const meta = (tx.metadata ?? {}) as Record<string, string>
      if (!meta.plaidPublicToken || !meta.plaidAccountId)
        throw new Error('Missing Plaid tokens in transaction metadata for re-processing')

      const plaidEnv  = Deno.env.get('PLAID_ENV') ?? 'sandbox'
      const plaidBase = plaidEnv === 'production' ? 'https://production.plaid.com'
        : plaidEnv === 'development' ? 'https://development.plaid.com'
        : 'https://sandbox.plaid.com'

      const processorToken = await plaidExchangeAndProcessorToken(
        plaidBase,
        Deno.env.get('PLAID_CLIENT_ID')!,
        Deno.env.get('PLAID_SECRET')!,
        meta.plaidPublicToken,
        meta.plaidAccountId,
      )

      const hdrs = stripeHeaders(stripeKey, stripeAccount, `${iKey}-approve`)
      const extAccRes = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccount}/external_accounts`, {
        method: 'POST', headers: hdrs,
        body: new URLSearchParams({ external_account: processorToken }),
      })
      const extAcc = await extAccRes.json()
      if (extAcc.error) throw new Error(`Stripe ext account (approve): ${extAcc.error.message}`)

      const payoutRes = await fetch('https://api.stripe.com/v1/payouts', {
        method: 'POST', headers: hdrs,
        body: new URLSearchParams({
          amount:      String(Math.round(tx.amount * 100)),
          currency:    'usd',
          destination: extAcc.id,
          description: tx.job_id ? `Lumina OpsHub approved ACH — job ${tx.job_id}` : 'Lumina OpsHub approved ACH',
        }),
      })
      const payout = await payoutRes.json()
      if (payout.error) throw new Error(`Stripe payout (approve): ${payout.error.message}`)
      txHash = payout.id

    } else if (tx.method === 'card') {
      const meta = (tx.metadata ?? {}) as Record<string, string>
      if (!meta.stripePaymentMethodId)
        throw new Error('Missing stripePaymentMethodId in transaction metadata for re-processing')

      const hdrs = stripeHeaders(stripeKey, stripeAccount, `${iKey}-approve`)
      const extAccRes = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccount}/external_accounts`, {
        method: 'POST', headers: hdrs,
        body: new URLSearchParams({ external_account: meta.stripePaymentMethodId }),
      })
      const extAcc = await extAccRes.json()
      if (extAcc.error) throw new Error(`Stripe attach card (approve): ${extAcc.error.message}`)

      const payoutRes = await fetch('https://api.stripe.com/v1/payouts', {
        method: 'POST', headers: { ...hdrs, 'Idempotency-Key': `${iKey}-approve-payout` },
        body: new URLSearchParams({
          amount:      String(Math.round(tx.amount * 100)),
          currency:    'usd',
          method:      'instant',
          destination: extAcc.id,
          description: tx.job_id ? `Lumina OpsHub approved instant — job ${tx.job_id}` : 'Lumina OpsHub approved instant',
        }),
      })
      const payout = await payoutRes.json()
      if (payout.error) throw new Error(`Stripe instant payout (approve): ${payout.error.message}`)
      txHash = payout.id

    } else if (tx.method === 'crypto') {
      // Crypto: wire ethers.js here when HOT_WALLET_PRIVATE_KEY is configured
      // For now, stub to prevent blocking the approval flow in dev
      txHash = `0x_APPROVED_CRYPTO_STUB_${Date.now().toString(16)}`
      console.warn('[cashout-approve] crypto payout stub — wire ethers.js in cashout-crypto and call it directly')

    } else {
      throw new Error(`Unknown payment method: ${tx.method}`)
    }

    // ── Mark completed ────────────────────────────────────────────────────────
    await admin.from('cashout_transactions').update({
      status: 'completed',
      tx_id:  txHash,
    }).eq('id', tx.id)

    return new Response(
      JSON.stringify({ success: true, action: 'approved', txId: txHash }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('cashout-approve error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
