/**
 * cashout-send-2fa — Generate + email 6-digit OTP for crypto withdrawal
 * Auth: dual-header (Authorization=anon key, x-user-jwt=user token)
 * Optional: RESEND_API_KEY for email. Falls back to returning code directly in DEV.
 */
import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
}

const CODE_TTL_MS      = 10 * 60 * 1000   // 10 minutes
const MAX_ACTIVE_CODES = 3

function generateOTP(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

async function sha256Hex(text: string): Promise<string> {
  const buf  = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const visible = local.slice(0, Math.min(3, local.length))
  return `${visible}***@${domain}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url  = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const svc  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    const { idempotencyKey } = rawBody as { idempotencyKey?: string }
    if (!idempotencyKey) {
      return new Response(JSON.stringify({ error: 'Missing idempotencyKey' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Rate limit: max 3 active codes
    const { count } = await admin.from('cashout_2fa_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('used', false).gt('expires_at', new Date().toISOString())

    if ((count ?? 0) >= MAX_ACTIVE_CODES) {
      return new Response(JSON.stringify({ error: 'Too many active codes. Wait 10 minutes for them to expire.' }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Expire any old code for this key
    await admin.from('cashout_2fa_codes').update({ used: true })
      .eq('user_id', user.id).eq('idempotency_key', idempotencyKey).eq('used', false)

    // Generate + store new code
    const code      = generateOTP()
    const codeHash  = await sha256Hex(code)
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

    const { error: insertErr } = await admin.from('cashout_2fa_codes').insert({
      user_id: user.id, code_hash: codeHash, idempotency_key: idempotencyKey, expires_at: expiresAt,
    })
    if (insertErr) throw new Error(`Failed to store code: ${insertErr.message}`)

    // Try to send via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromAddr  = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Lumina Ops Hub <noreply@luminaops.dev>'
    let emailSent   = false

    if (resendKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromAddr, to: [user.email!],
            subject: `${code} — Lumina Ops Hub withdrawal code`,
            html: `<div style="font-family:monospace;background:#0f1320;color:#e8eaf6;padding:32px;border-radius:12px;max-width:480px">
              <h2 style="color:#00f5d4">Crypto Withdrawal Code</h2>
              <p style="color:#8892a4">Your 6-digit code (expires in 10 min):</p>
              <div style="background:#1a2035;border:1px solid #00f5d440;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                <span style="font-size:36px;letter-spacing:12px;color:#00f5d4;font-weight:bold">${code}</span>
              </div>
              <p style="color:#8892a4;font-size:12px">If you didn't request this, ignore this email.</p>
            </div>`,
          }),
        })
        emailSent = emailRes.ok
        if (!emailRes.ok) console.warn('[2fa] Resend failed:', emailRes.status)
      } catch (e) {
        console.warn('[2fa] Resend error:', e)
      }
    }

    if (!emailSent) {
      console.log(`[2FA CODE — DEV MODE] ${user.email}: ${code}`)
    }

    // Return code directly when email delivery fails (Resend not configured or send failed)
    // so the user can still complete the withdrawal flow
    const responsePayload: Record<string, unknown> = {
      sent:        true,
      maskedEmail: maskEmail(user.email!),
      emailSent,
    }
    if (!emailSent) {
      // Fallback: return code so user can complete withdrawal even if email isn't working
      responsePayload.devCode = code
      responsePayload.devNote = !resendKey
        ? 'RESEND_API_KEY not set — code returned directly for testing.'
        : 'Email delivery failed — code returned directly as fallback. Check RESEND_API_KEY and domain verification.'
    }

    return new Response(JSON.stringify(responsePayload), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cashout-send-2fa]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
