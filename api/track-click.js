/**
 * /api/track-click
 *
 * Records a UTM click event against a ugc_creative.
 * Called when a Stripe/product link is opened via UTM redirect.
 *
 * Method: POST (or GET with query params for redirect pixels)
 *
 * Body / Query params:
 *   creative_id  — ugc_creatives.id
 *   platform     — twitter | tiktok | instagram | youtube | linkedin
 *   redirect_url — (optional) where to forward the user after tracking
 *
 * Response:
 *   POST → 200 { ok: true, clicks: <new total> }
 *   GET  → 302 redirect to redirect_url (or 200 JSON if no redirect_url)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const params = req.method === 'GET'
      ? req.query
      : (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {})

    const { creative_id, platform, redirect_url } = params

    if (!creative_id) {
      return res.status(400).json({ error: 'creative_id required' })
    }

    // Atomically increment clicks on the creative
    const { data, error } = await supabase.rpc('increment_creative_clicks', {
      p_creative_id: creative_id,
      p_platform:    platform ?? 'unknown',
    })

    if (error) {
      // Fallback: direct update if RPC doesn't exist yet
      const { data: current } = await supabase
        .from('ugc_creatives')
        .select('clicks')
        .eq('id', creative_id)
        .single()

      await supabase
        .from('ugc_creatives')
        .update({
          clicks: (current?.clicks ?? 0) + 1,
          ctr:    null,   // will be recalculated by DB trigger / nightly job
        })
        .eq('id', creative_id)
    }

    // Also log to a click_events table if it exists (non-blocking)
    supabase.from('click_events').insert({
      creative_id,
      platform:    platform ?? 'unknown',
      clicked_at:  new Date().toISOString(),
      user_agent:  req.headers['user-agent'] ?? null,
      ip_hash:     null,  // privacy-safe: we don't store raw IPs
    }).then(() => {}).catch(() => {})

    // Redirect for GET (pixel-style tracking)
    if (req.method === 'GET' && redirect_url) {
      return res.redirect(302, decodeURIComponent(redirect_url))
    }

    return res.status(200).json({ ok: true, clicks: (data ?? 0) })

  } catch (err) {
    console.error('[track-click] error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
