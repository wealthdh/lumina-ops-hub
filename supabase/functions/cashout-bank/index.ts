/**
 * cashout-bank — Plaid ACH payout
 * Auth: dual-header (Authorization=anon key for gateway, x-user-jwt for identity)
 * Required secrets: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, STRIPE_SECRET_KEY, STRIPE_CONNECTED_ACCOUNT_ID
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

    const { amount, plaidPublicToken, plaidAccountId, idempotencyKey, jobId } = rawBody as {
      amount: number; plaidPublicToken: string; plaidAccountId: string; idempotencyKey: string; jobId?: string
    }

    if (!amount || amount < 1)     return err400('Invalid amount')
    if (!plaidPublicToken)          return err400('Missing Plaid token — complete Plaid Link first')
    if (!plaidAccountId)            return err400('Missing Plaid account ID')
    if (!idempotencyKey)            return err400('Missing idempotency key')

    const { data: existing } = await admin.from('cashout_transactions')
      .select('id, status, tx_id').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existing) return ok({ success: existing.status === 'completed', txId: existing.tx_id, requiresApproval: existing.status === 'needs_approval', idempotent: true })

    const { data: bal }   = await admin.rpc('get_available_balance',    { p_user_id: user.id })
    const { data: daily } = await admin.rpc('get_daily_withdrawal_total',{ p_user_id: user.id })
    const available    = Number(bal   ?? 0)
    const dailyTotal   = Number(daily ?? 0)

    if (amount > available) return err400(`Insufficient balance. Available: $${available.toFixed(2)}`)
    const needsApproval = amount > DAILY_LIMIT || (dailyTotal + amount) > DAILY_LIMIT

    const { data: tx, error: txErr } = await admin.from('cashout_transactions').insert({
      user_id: user.id, method: 'bank', amount,
      status: needsApproval ? 'needs_approval' : 'pending',
      job_id: jobId ?? null, idempotency_key: idempotencyKey,
      server_balance: available, daily_total_at_req: dailyTotal,
    }).select('id').single()

    if (txErr || !tx) throw new Error(`DB insert: ${txErr?.message}`)
    txId = tx.id

    if (needsApproval) {
      await admin.from('cashout_approvals').insert({
        transaction_id: txId, user_id: user.id, amount, method: 'bank', job_id: jobId ?? null,
        reason: `$${amount} would push daily total to $${(dailyTotal + amount).toFixed(0)} (limit $${DAILY_LIMIT})`,
      })
      return ok({ success: false, requiresApproval: true, txId })
    }

    await admin.from('cashout_transactions').update({ status: 'processing' }).eq('id', txId)

    // Plaid keys
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID')
    const plaidSecret   = Deno.env.get('PLAID_SECRET')
    const plaidEnv      = Deno.env.get('PLAID_ENV') ?? 'sandbox'
    const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const stripeAccount = Deno.env.get('STRIPE_CONNECTED_ACCOUNT_ID') ?? ''

    if (!plaidClientId || !plaidSecret || stripeKey.length < 20) {
      await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: 'PLAID or STRIPE secrets not configured' } }).eq('id', txId)
      return new Response(JSON.stringify({
        success: false, configRequired: true,
        error: 'Bank payout requires PLAID_CLIENT_ID, PLAID_SECRET, and STRIPE_SECRET_KEY in Supabase Edge Function Secrets.',
        txId,
      }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const plaidBase = plaidEnv === 'production' ? 'https://production.plaid.com'
      : plaidEnv === 'development' ? 'https://development.plaid.com' : 'https://sandbox.plaid.com'

    const exchRes = await fetch(`${plaidBase}/item/public_token/exchange`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: plaidClientId, secret: plaidSecret, public_token: plaidPublicToken }),
    })
    const exchData = await exchRes.json()
    if (!exchData.access_token) throw new Error(exchData.error_message ?? 'Plaid exchange failed')

    const procRes = await fetch(`${plaidBase}/processor/stripe/bank_account_token/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: plaidClientId, secret: plaidSecret, access_token: exchData.access_token, account_id: plaidAccountId }),
    })
    const procData = await procRes.json()
    if (!procData.stripe_bank_account_token) throw new Error(procData.error_message ?? 'Plaid processor token failed')

    const hdr = { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Account': stripeAccount, 'Idempotency-Key': `${idempotencyKey}-attach` }
    const extRes = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccount}/external_accounts`, {
      method: 'POST', headers: hdr, body: new URLSearchParams({ external_account: procData.stripe_bank_account_token }),
    })
    const ext = await extRes.json()
    if (ext.error) throw new Error(`Stripe attach: ${ext.error.message}`)

    const payRes = await fetch('https://api.stripe.com/v1/payouts', {
      method: 'POST',
      headers: { ...hdr, 'Idempotency-Key': idempotencyKey },
      body: new URLSearchParams({ amount: String(Math.round(amount * 100)), currency: 'usd', destination: ext.id, description: `Lumina OpsHub — job ${jobId ?? 'all'}` }),
    })
    const payout = await payRes.json()
    if (payout.error) throw new Error(`Stripe payout: ${payout.error.message}`)

    await admin.from('cashout_transactions').update({ status: 'completed', tx_id: payout.id }).eq('id', txId)
    return ok({ success: true, txId: payout.id, estimatedArrival: '2–3 business days' })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cashout-bank]', msg)
    if (txId) await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: msg } }).eq('id', txId)
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

const ok     = (d: Record<string, unknown>) => new Response(JSON.stringify(d), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const err400 = (e: string)                  => new Response(JSON.stringify({ error: e }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
