/**
 * cashout-crypto — LIVE on-chain USDT payout via ethers.js v6
 *
 * Supports: bsc (BNB Chain), ethereum, polygon
 *
 * Required Supabase Secrets:
 *   HOT_WALLET_PRIVATE_KEY  — treasury wallet private key (0x...)
 *   ALCHEMY_API_KEY         — for ETH/Polygon RPC (optional)
 *
 * Auth: dual-header
 *   Authorization: Bearer <anon_key>    → Supabase gateway
 *   x-user-jwt:    <user_access_token>  → user identity
 */
import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ethers }       from 'https://esm.sh/ethers@6.11.1'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
}

const DAILY_LIMIT      = 500
const CRYPTO_DAILY_CAP = 1_000
const MAX_2FA_ATTEMPTS = 5

const RPC_URLS: Record<string, string> = {
  bsc:      'https://bsc-dataseed1.binance.org/',
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${Deno.env.get('ALCHEMY_API_KEY') ?? 'demo'}`,
  polygon:  `https://polygon-mainnet.g.alchemy.com/v2/${Deno.env.get('ALCHEMY_API_KEY') ?? 'demo'}`,
}

const USDT: Record<string, string> = {
  bsc:      '0x55d398326f99059fF775485246999027B3197955',
  ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  polygon:  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
}

const EXPLORER: Record<string, string> = {
  bsc:      'https://bscscan.com/tx/',
  ethereum: 'https://etherscan.io/tx/',
  polygon:  'https://polygonscan.com/tx/',
}

const ERC20 = [
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

async function sha256Hex(text: string): Promise<string> {
  const buf  = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
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

    const { amount, toAddress, network, twoFactorCode, idempotencyKey, jobId } = rawBody as {
      amount: number; toAddress: string; network: string
      twoFactorCode: string; idempotencyKey: string; jobId?: string
    }

    if (!amount || amount < 1)                          return err400('Minimum withdrawal is $1')
    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress))        return err400('Invalid EVM wallet address')
    if (!RPC_URLS[network])                              return err400(`Network "${network}" not supported. Use: bsc, ethereum, polygon`)
    if (!twoFactorCode || twoFactorCode.length !== 6)   return err400('6-digit 2FA code required — click Send Code first')
    if (!idempotencyKey)                                 return err400('Missing idempotency key')

    // Idempotency
    const { data: existing } = await admin.from('cashout_transactions')
      .select('id, status, tx_id').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existing) return ok({ success: existing.status === 'completed', txId: existing.tx_id, requiresApproval: existing.status === 'needs_approval', idempotent: true })

    // 2FA check
    const { data: code } = await admin.from('cashout_2fa_codes')
      .select('id, code_hash, attempts')
      .eq('user_id', user.id).eq('idempotency_key', idempotencyKey)
      .eq('used', false).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (!code) return err400('No active code found. Click "Send Code" to get a fresh one.')

    const tries = (code.attempts ?? 0) + 1
    await admin.from('cashout_2fa_codes').update({ attempts: tries }).eq('id', code.id)
    if (tries > MAX_2FA_ATTEMPTS) {
      await admin.from('cashout_2fa_codes').update({ used: true }).eq('id', code.id)
      return err400('Too many wrong attempts. Request a new code.')
    }
    if (await sha256Hex(twoFactorCode) !== code.code_hash) {
      return err400(`Wrong code. ${MAX_2FA_ATTEMPTS - tries} attempt${MAX_2FA_ATTEMPTS - tries === 1 ? '' : 's'} left.`)
    }
    await admin.from('cashout_2fa_codes').update({ used: true }).eq('id', code.id)

    // Balance
    const { data: bal }   = await admin.rpc('get_available_balance',    { p_user_id: user.id })
    const { data: daily } = await admin.rpc('get_daily_withdrawal_total',{ p_user_id: user.id })
    const { data: cryptoD }= await admin.rpc('get_daily_crypto_total',   { p_user_id: user.id })

    const available     = Number(bal ?? 0)
    const dailyTotal    = Number(daily ?? 0)
    const cryptoToday   = Number(cryptoD ?? 0)

    if (amount > available)                          return err400(`Insufficient balance. Available: $${available.toFixed(2)}`)
    if (cryptoToday + amount > CRYPTO_DAILY_CAP)     return err400(`Daily crypto limit reached. Remaining: $${Math.max(0, CRYPTO_DAILY_CAP - cryptoToday).toFixed(2)}`)

    const needsApproval = amount > DAILY_LIMIT || (dailyTotal + amount) > DAILY_LIMIT

    // Create DB record
    const { data: tx, error: txErr } = await admin.from('cashout_transactions').insert({
      user_id: user.id, method: 'crypto', amount,
      status: needsApproval ? 'needs_approval' : 'pending',
      job_id: jobId ?? null, idempotency_key: idempotencyKey,
      server_balance: available, daily_total_at_req: dailyTotal,
      network, to_address: toAddress,
    }).select('id').single()

    if (txErr || !tx) throw new Error(`DB insert failed: ${txErr?.message}`)
    txId = tx.id

    if (needsApproval) {
      await admin.from('cashout_approvals').insert({
        transaction_id: txId, user_id: user.id, amount, method: 'crypto', job_id: jobId ?? null,
        reason: `$${amount} exceeds ${amount > DAILY_LIMIT ? 'single' : 'daily'} limit of $${DAILY_LIMIT}`,
      })
      return ok({ success: false, requiresApproval: true, txId })
    }

    await admin.from('cashout_transactions').update({ status: 'processing' }).eq('id', txId)

    // ── HOT WALLET SEND ────────────────────────────────────────────────────────
    const pk = Deno.env.get('HOT_WALLET_PRIVATE_KEY') ?? ''
    if (!pk || pk.length < 60 || pk.startsWith('REPLACE')) {
      await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: 'HOT_WALLET_PRIVATE_KEY not set' } }).eq('id', txId)
      return new Response(JSON.stringify({
        success: false,
        configRequired: true,
        error: 'Platform hot wallet not configured — add HOT_WALLET_PRIVATE_KEY to Supabase Edge Function Secrets.',
        txId,
      }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const provider  = new ethers.JsonRpcProvider(RPC_URLS[network])
    const signer    = new ethers.Wallet(pk, provider)
    const token     = new ethers.Contract(USDT[network], ERC20, signer)
    const decimals: bigint = await token.decimals()
    const hotBal: bigint   = await token.balanceOf(signer.address)
    const hotBalUsd        = Number(ethers.formatUnits(hotBal, decimals))

    console.log(`[crypto] hot wallet: ${signer.address} | USDT bal: ${hotBalUsd.toFixed(2)} | sending: ${amount} → ${toAddress}`)

    if (hotBalUsd < amount) {
      await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: `Hot wallet USDT too low: ${hotBalUsd.toFixed(2)}` } }).eq('id', txId)
      return new Response(JSON.stringify({ success: false, error: `Hot wallet balance ($${hotBalUsd.toFixed(2)} USDT) is less than requested amount ($${amount}).` }),
        { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const sendAmt = ethers.parseUnits(amount.toFixed(2), decimals)
    const sendTx  = await token.transfer(toAddress, sendAmt)
    console.log(`[crypto] broadcast: ${sendTx.hash}`)
    const receipt = await sendTx.wait(1)
    const hash    = receipt?.hash ?? sendTx.hash
    console.log(`[crypto] confirmed: ${hash}`)

    await admin.from('cashout_transactions').update({
      status: 'completed', tx_id: hash, hot_wallet_warned: hotBalUsd < amount * 2,
    }).eq('id', txId)

    return ok({ success: true, txId: hash, explorerUrl: `${EXPLORER[network]}${hash}`, network, toAddress, amount })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cashout-crypto]', msg)
    if (txId) await admin.from('cashout_transactions').update({ status: 'failed', metadata: { error: msg } }).eq('id', txId)
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

const ok  = (d: Record<string, unknown>) => new Response(JSON.stringify(d), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const err400 = (e: string)               => new Response(JSON.stringify({ error: e }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
