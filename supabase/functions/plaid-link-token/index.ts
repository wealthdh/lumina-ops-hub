/**
 * Supabase Edge Function: plaid-link-token
 * Creates a Plaid Link token so the browser can open the Plaid Link UI.
 *
 * Required env vars (set via `supabase secrets set`):
 *   PLAID_CLIENT_ID
 *   PLAID_SECRET          (Sandbox / Development / Production key)
 *   PLAID_ENV             "sandbox" | "development" | "production"
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Verify caller is authenticated
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const plaidEnv  = Deno.env.get('PLAID_ENV') ?? 'sandbox'
    const plaidBase = plaidEnv === 'production'
      ? 'https://production.plaid.com'
      : plaidEnv === 'development'
        ? 'https://development.plaid.com'
        : 'https://sandbox.plaid.com'

    const res = await fetch(`${plaidBase}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:    Deno.env.get('PLAID_CLIENT_ID'),
        secret:       Deno.env.get('PLAID_SECRET'),
        user:         { client_user_id: user.id },
        client_name:  'Lumina Ops Hub',
        products:     ['auth', 'transactions'],
        country_codes: ['US'],
        language:     'en',
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error_message ?? 'Plaid link token creation failed')

    return new Response(
      JSON.stringify({ linkToken: data.link_token, expiration: data.expiration }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
