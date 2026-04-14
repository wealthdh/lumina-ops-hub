/**
 * /api/track-click — Fixed: PostgrestFilterBuilder .catch() TypeError + Stripe attribution
 */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[track-click] missing env vars')
    return res.status(500).json({ error: 'Supabase not configured' })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const params = req.method === 'GET'
      ? req.query
      : (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {})
    const { creative_id, platform, redirect_url } = params

    if (!creative_id) return res.status(400).json({ error: 'creative_id required' })

    const { data, error } = await supabase.rpc('increment_creative_clicks', {
      p_creative_id: creative_id,
      p_platform: platform ?? 'unknown',
    })
    if (error) {
      const { data: current } = await supabase.from('ugc_creatives').select('clicks').eq('id', creative_id).single()
      await supabase.from('ugc_creatives').update({ clicks: (current?.clicks ?? 0) + 1, ctr: null }).eq('id', creative_id)
    }

    // FIX: PostgrestFilterBuilder has .then() but NOT .catch() — await directly, destructure error
    const { error: insertError } = await supabase.from('click_events').insert({
      creative_id,
      platform: platform ?? 'unknown',
      clicked_at: new Date().toISOString(),
      user_agent: req.headers['user-agent'] ?? null,
      ip_hash: null,
    })
    if (insertError) console.warn('[track-click] click_events insert failed:', insertError.message)

    if (req.method === 'GET' && redirect_url) {
      let finalUrl = decodeURIComponent(redirect_url)
      if (creative_id && finalUrl.includes('buy.stripe.com')) {
        try { const u = new URL(finalUrl); u.searchParams.set('client_reference_id', creative_id); finalUrl = u.toString() } catch (_) {}
      }
      return res.redirect(302, finalUrl)
    }

    return res.status(200).json({ ok: true, clicks: (data ?? 0) })
  } catch (err) {
    console.error('[track-click] error:', err?.message || err, err?.stack || '')
    return res.status(500).json({ error: 'Internal server error', detail: err?.message })
  }
             }
