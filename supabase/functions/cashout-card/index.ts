/**
 * cashout-card — Stripe instant payout to debit card
 * Auth: dual-header (Authorization=anon key for gateway, x-user-jwt for identity)
 * Required secrets: STRIPE_SECRET_KEY, STRIPE_CONNECTED_ACCOUNT_ID
 */
import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
}
const DAILY_LIMIT = 500

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url  = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const svc  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let txId: string | undefined

  try {
    // Parse body once (includes _userJwt for auth)
    const rawBody = await req.json() as Record<string, unknown>
    const bodyJwt = (rawBody._userJwt as string) ?? ''

    // Auth: prefer body JWT, fall back to x-user-jwt header, then Authorization header
    const xJwt     = req.headers.get('x-user-jwt') ?? ''
    const authHdr  = req.headers.get('authorization') ?? ''
    const userToken = (bodyJwt || xJwt || authHdr).replace(/^Bearer\s+/i, '')

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${userToken}` } } })
    const admin      = createClient(url, svc)

    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: authErr?.message }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { amount, stripePaymentMethodId, idempotencyKey, jobId } = rawBody as {
      amount: number; stripePaymentMethodId: string; idempotencyKey: string; jobId?: string
    }

    if (!amount || amount < 1)          return err400('Invalid amount')
    if (!stripePaymentMethodId)         return err400('Missing Stripe payment method — complete card entry first')
    if (!idempotencyKey)                return err400('Missing idempotency key')

    const { data: existing } = await admin.from('cashout_transactions')
      .select('id, status, tx_id').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existing) return ok({ success: existing.status === 'completed', txId: existing.tx_id, requiresApproval: existing.status === 'needs_approval', idempotent: true })

    const { data: bal }   = await admin.rpc('get_available_balance',    { p_user_id: user.id })
    const { data: daily } = await admin.rpc('get_daily_withdrawal_total',{ p_user_id: user.id })
    const available  = Number(bal   ?? 0)
    const dailyTotal = Number(daily ?? 0)

    if (amount > available) return err400(`Insufficient balance. Available: $${available.toFixed(2)}`)
    const needsApproval = amount > DAILY_LIMIT || (dailyTotal + amount) > DAILY_LIMIT

    const { data: tx, error: txErr } = await admin.from('cashout_transactions').insert({
      user_id: user.id, method: 'card', amount,
      status: needsApproval ? 'needs_approval' : 'pending',
      job_id: jobId ?? null, idempotency_key: idempotencyKey,
      server_balance: available, daily_total_at_req: dailyTotal,
    }).select('id').single()

    if (txErr || !tx) throw new Error(`DB insert: ${txErr?.message}`)
    txId = tx.id

    if (needsApproval) {
      await admin.from('cashout_approvals').insert({
        transaction_id: txId, user_id: user.id, amount, method: 'card', job_id: jobId ?? null,
        reason: `$${amount} exceeds limit`,
      })
      return ok({ success: false, requiresApproval: true, txId })
    }

    await admin.from('cashout_transactions').update({ status: 'processing' }).eq('id', txId)

    const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const stripeAccount = Deno.env.get('STRIPE_CONNECTED_ACCOUNT_ID') ?? ''

    if (stripeKey.length < 20 || !stripeAccount) {
      await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: 'Stripe not configured' } }).eq('id', txId)
      return new Response(JSON.stringify({
        success: false, configRequired: true,
        error: 'Card payout requires STRIPE_SECRET_KEY and STRIPE_CONNECTED_ACCOUNT_ID in Supabase Edge Function Secrets.',
        txId,
      }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const hdr = {
      'Authorization':   `Bearer ${stripeKey}`,
      'Content-Type':    'application/x-www-form-urlencoded',
      'Stripe-Account':  stripeAccount,
    }

    const attachRes = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccount}/external_accounts`, {
      method: 'POST', headers: { ...hdr, 'Idempotency-Key': `${idempotencyKey}-attach` },
      body: new URLSearchParams({ external_account: stripePaymentMethodId }),
    })
    const ext = await attachRes.json()
    if (ext.error) throw new Error(`Stripe attach card: ${ext.error.message}`)

    const payRes = await fetch('https://api.stripe.com/v1/payouts', {
      method: 'POST', headers: { ...hdr, 'Idempotency-Key': idempotencyKey },
      body: new URLSearchParams({
        amount: String(Math.round(amount * 100)), currency: 'usd',
        method: 'instant', destination: ext.id,
        description: `Lumina OpsHub card payout — job ${jobId ?? 'all'}`,
      }),
    })
    const payout = await payRes.json()
    if (payout.error) throw new Error(`Stripe payout: ${payout.error.message}`)

    await admin.from('cashout_transactions').update({ status: 'completed', tx_id: payout.id }).eq('id', txId)
    return ok({ success: true, txId: payout.id, estimatedArrival: 'Within 30 minutes (Stripe Instant)' })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cashout-card]', msg)
    if (txId) await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: msg } }).eq('id', txId)
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

const ok     = (d: Record<string, unknown>) => new Response(JSON.stringify(d), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const err400 = (e: string)                  => new Response(JSON.stringify({ error: e }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
