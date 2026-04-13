/**
 * Vercel Serverless Function — Auto-Distribution Engine
 *
 * When a UGC creative is marked "live", this function queues
 * distribution to all connected platforms. Each platform handler
 * posts via the respective API (TikTok, Instagram, YouTube, etc.).
 *
 * For platforms not yet connected, it logs the intent to Supabase
 * so the dashboard shows what WOULD be distributed once tokens are added.
 *
 * Endpoints (via query param ?action=...):
 *   POST ?action=distribute   — Distribute a creative to all connected platforms
 *   POST ?action=single       — Distribute to a single platform
 *   GET  ?action=status       — Get distribution status for a creative
 *   GET  ?action=connections   — List platform connection status
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─── Supabase (server-side) ─────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

// ─── Platform Distributors ──────────────────────────────────────────────────
// Each returns { success, post_url?, error? }
const DISTRIBUTORS = {
  async TikTok(creative, connection) {
    // TikTok Content Posting API
    // https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
    if (!connection?.access_token) {
      return { success: false, error: 'No TikTok access token configured' }
    }
    try {
      // Step 1: Init video upload
      const initRes = await fetchWithTimeout('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: creative.title,
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: creative.video_url,
          },
        }),
      })
      const data = await initRes.json()
      if (data.error?.code) {
        return { success: false, error: data.error.message || 'TikTok API error' }
      }
      return { success: true, post_url: `https://tiktok.com/@user/video/${data.data?.publish_id || ''}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  async Instagram(creative, connection) {
    // Instagram Graph API — Container + Publish flow
    if (!connection?.access_token) {
      return { success: false, error: 'No Instagram access token configured' }
    }
    try {
      const igUserId = connection.platform_user_id || 'me'
      // Step 1: Create media container
      const containerRes = await fetchWithTimeout(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'REELS',
            video_url: creative.video_url,
            caption: creative.caption || creative.title,
            access_token: connection.access_token,
          }),
        }
      )
      const container = await containerRes.json()
      if (container.error) {
        return { success: false, error: container.error.message }
      }
      // Step 2: Publish
      const publishRes = await fetchWithTimeout(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: connection.access_token,
          }),
        }
      )
      const published = await publishRes.json()
      if (published.error) {
        return { success: false, error: published.error.message }
      }
      return { success: true, post_url: `https://instagram.com/reel/${published.id}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  async YouTube(creative, connection) {
    if (!connection?.access_token) {
      return { success: false, error: 'No YouTube access token configured' }
    }
    // YouTube Shorts upload requires resumable upload API
    // For now, queue as pending — real upload needs multipart
    return {
      success: false,
      error: 'YouTube Shorts upload requires OAuth flow — queued for manual review',
    }
  },

  async LinkedIn(creative, connection) {
    if (!connection?.access_token) {
      return { success: false, error: 'No LinkedIn access token configured' }
    }
    try {
      // LinkedIn UGC Post API
      const res = await fetchWithTimeout('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: `urn:li:person:${connection.platform_user_id}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: creative.caption || creative.title },
              shareMediaCategory: 'VIDEO',
              media: [{
                status: 'READY',
                originalUrl: creative.video_url,
                title: { text: creative.title },
              }],
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.message || 'LinkedIn API error' }
      }
      return { success: true, post_url: `https://linkedin.com/feed/update/${data.id}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  async 'Twitter/X'(creative, connection) {
    // Twitter/X v2 API — real tweet posting
    // Supports two auth modes:
    //   A) OAuth 2.0 User Context (from platform_connections table)
    //   B) OAuth 1.0a App+User tokens (from env vars — fallback)

    const envApiKey = process.env.TWITTER_API_KEY
    const envApiSecret = process.env.TWITTER_API_SECRET
    const envAccessToken = process.env.TWITTER_ACCESS_TOKEN
    const envAccessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET

    // Determine which auth to use
    const useOAuth2 = !!connection?.access_token
    const useOAuth1 = !useOAuth2 && envApiKey && envApiSecret && envAccessToken && envAccessSecret

    if (!useOAuth2 && !useOAuth1) {
      return {
        success: false,
        error: 'No Twitter/X credentials configured. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET in env vars, or connect via OAuth 2.0 in platform_connections.',
      }
    }

    const log = (msg, data) => console.log(`[DISTRIBUTION][twitter][${new Date().toISOString()}] ${msg}`, data ? JSON.stringify(data) : '')

    try {
      const caption = (creative.caption || creative.title || '').substring(0, 280)

      if (useOAuth2) {
        // ── OAuth 2.0 User Context (Bearer token from platform_connections) ──
        log('Posting tweet via OAuth 2.0', { caption: caption.substring(0, 50) })

        const tweetRes = await fetchWithTimeout('https://api.x.com/2/tweets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: creative.video_url
              ? `${caption}\n\n${creative.video_url}`
              : caption,
          }),
        })

        const tweetData = await tweetRes.json()
        log('OAuth2 tweet response', { status: tweetRes.status, data: tweetData })

        if (!tweetRes.ok) {
          return {
            success: false,
            error: `Twitter API error ${tweetRes.status}: ${tweetData.detail || tweetData.title || JSON.stringify(tweetData)}`,
          }
        }

        const tweetId = tweetData.data?.id
        return {
          success: true,
          post_url: tweetId ? `https://x.com/i/status/${tweetId}` : null,
        }
      }

      // ── OAuth 1.0a (env var credentials) ───────────────────────────────────
      log('Posting tweet via OAuth 1.0a', { caption: caption.substring(0, 50) })

      const tweetText = creative.video_url
        ? `${caption}\n\n${creative.video_url}`
        : caption

      // Build OAuth 1.0a signature
      const oauthParams = {
        oauth_consumer_key: envApiKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: envAccessToken,
        oauth_version: '1.0',
      }

      const url = 'https://api.x.com/2/tweets'
      const method = 'POST'

      // Signature base string (only oauth params for POST with JSON body)
      const paramString = Object.keys(oauthParams)
        .sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
        .join('&')

      const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
      const signingKey = `${encodeURIComponent(envApiSecret)}&${encodeURIComponent(envAccessSecret)}`
      const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64')

      const authHeader = 'OAuth ' + Object.entries({
        ...oauthParams,
        oauth_signature: signature,
      })
        .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
        .join(', ')

      const tweetRes = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: tweetText }),
      })

      const tweetData = await tweetRes.json()
      log('OAuth1 tweet response', { status: tweetRes.status, data: tweetData })

      if (!tweetRes.ok) {
        return {
          success: false,
          error: `Twitter API error ${tweetRes.status}: ${tweetData.detail || tweetData.title || JSON.stringify(tweetData.errors || tweetData)}`,
        }
      }

      const tweetId = tweetData.data?.id
      return {
        success: true,
        post_url: tweetId ? `https://x.com/i/status/${tweetId}` : null,
      }
    } catch (err) {
      log('ERROR', { message: err.message, stack: err.stack })
      return { success: false, error: err.message }
    }
  },

  async Facebook(creative, connection) {
    if (!connection?.access_token) {
      return { success: false, error: 'No Facebook access token configured' }
    }
    try {
      const pageId = connection.platform_user_id || 'me'
      const res = await fetchWithTimeout(
        `https://graph.facebook.com/v19.0/${pageId}/videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: creative.video_url,
            title: creative.title,
            description: creative.caption || creative.title,
            access_token: connection.access_token,
          }),
        }
      )
      const data = await res.json()
      if (data.error) {
        return { success: false, error: data.error.message }
      }
      return { success: true, post_url: `https://facebook.com/watch/?v=${data.id}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  async Pinterest(creative, connection) {
    if (!connection?.access_token) {
      return { success: false, error: 'No Pinterest access token configured' }
    }
    return {
      success: false,
      error: 'Pinterest video pin API integration pending — queued',
    }
  },

  async Threads(creative, connection) {
    if (!connection?.access_token) {
      return { success: false, error: 'No Threads access token configured' }
    }
    try {
      const res = await fetchWithTimeout('https://graph.threads.net/v1.0/me/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'VIDEO',
          video_url: creative.video_url,
          text: creative.caption || creative.title,
          access_token: connection.access_token,
        }),
      })
      const data = await res.json()
      if (data.error) {
        return { success: false, error: data.error.message }
      }
      // Publish the container
      const pubRes = await fetchWithTimeout(`https://graph.threads.net/v1.0/me/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: data.id,
          access_token: connection.access_token,
        }),
      })
      const pub = await pubRes.json()
      return { success: true, post_url: `https://threads.net/t/${pub.id}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
}

// ─── CORS helper ─────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )
}

// ─── Logger ─────────────────────────────────────────────────────────────────
const dlog = (level, msg, data) => {
  const ts = new Date().toISOString()
  console[level](`[DISTRIBUTION][${ts}] ${msg}`, data ? JSON.stringify(data) : '')
}

// ─── Fetch timeout wrapper ───────────────────────────────────────────────────
function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const supabase = getSupabase()
    const action = req.query?.action || req.body?.action
    dlog('info', `Request: ${req.method} action=${action}`, { body: req.body, query: req.query })

    // ── Distribute to ALL connected platforms ──────────────────────
    if (action === 'distribute' && req.method === 'POST') {
      const { creative_id } = req.body
      if (!creative_id) {
        return res.status(400).json({ error: 'creative_id is required' })
      }

      // Fetch the creative
      const { data: creative, error: cErr } = await supabase
        .from('ugc_creatives')
        .select('*')
        .eq('id', creative_id)
        .single()
      if (cErr || !creative) {
        return res.status(404).json({ error: 'Creative not found' })
      }
      if (!creative.video_url) {
        return res.status(400).json({ error: 'Creative has no video_url — generate first' })
      }

      // Fetch all platform connections
      const { data: connections } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('connected', true)

      const results = []
      const distributedTo = []

      for (const platformName of Object.keys(DISTRIBUTORS)) {
        const conn = (connections || []).find(c => c.platform === platformName)
        const distributor = DISTRIBUTORS[platformName]
        const result = await distributor(creative, conn || null)

        // Log to distribution_log
        await supabase.from('distribution_log').insert({
          creative_id: creative.id,
          platform: platformName,
          success: result.success,
          post_url: result.post_url || null,
          error_message: result.error || null,
        })

        if (result.success) distributedTo.push(platformName)
        results.push({ platform: platformName, ...result })
      }

      // Update creative status — only 'distributed' if at least one succeeded
      const newStatus = distributedTo.length > 0 ? 'live' : creative.status
      await supabase
        .from('ugc_creatives')
        .update({
          distributed_to: distributedTo,
          status: newStatus,
        })
        .eq('id', creative.id)

      dlog('info', 'Distribution complete', {
        creative_id: creative.id,
        total: results.length,
        successful: distributedTo.length,
        platforms: distributedTo,
        failures: results.filter(r => !r.success).map(r => ({ platform: r.platform, error: r.error })),
      })

      return res.status(200).json({
        creative_id: creative.id,
        total: results.length,
        successful: distributedTo.length,
        results,
      })
    }

    // ── Distribute to a SINGLE platform ────────────────────────────
    if (action === 'single' && req.method === 'POST') {
      const { creative_id, platform } = req.body
      if (!creative_id || !platform) {
        return res.status(400).json({ error: 'creative_id and platform are required' })
      }

      const { data: creative } = await supabase
        .from('ugc_creatives')
        .select('*')
        .eq('id', creative_id)
        .single()
      if (!creative?.video_url) {
        return res.status(400).json({ error: 'Creative not found or has no video' })
      }

      const { data: connections } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('platform', platform)
        .eq('connected', true)

      const conn = connections?.[0] || null
      const distributor = DISTRIBUTORS[platform]
      if (!distributor) {
        return res.status(400).json({ error: `Unknown platform: ${platform}` })
      }

      const result = await distributor(creative, conn)

      await supabase.from('distribution_log').insert({
        creative_id: creative.id,
        platform,
        success: result.success,
        post_url: result.post_url || null,
        error_message: result.error || null,
      })

      return res.status(200).json({ platform, ...result })
    }

    // ── Get distribution status ────────────────────────────────────
    if (action === 'status' && req.method === 'GET') {
      const creativeId = req.query?.creative_id
      if (!creativeId) {
        return res.status(400).json({ error: 'creative_id query param is required' })
      }

      const { data: logs } = await supabase
        .from('distribution_log')
        .select('*')
        .eq('creative_id', creativeId)
        .order('created_at', { ascending: false })

      return res.status(200).json({ creative_id: creativeId, logs: logs || [] })
    }

    // ── List platform connections ──────────────────────────────────
    if (action === 'connections' && req.method === 'GET') {
      const { data: connections } = await supabase
        .from('platform_connections')
        .select('platform, connected, last_post, created_at')
        .order('platform')

      const platforms = Object.keys(DISTRIBUTORS).map(name => {
        const conn = (connections || []).find(c => c.platform === name)
        return {
          platform: name,
          connected: conn?.connected || false,
          last_post: conn?.last_post || null,
        }
      })

      return res.status(200).json({ platforms })
    }

    return res.status(400).json({
      error: 'Invalid action. Use: distribute, single, status, or connections',
    })
  } catch (err) {
    console.error('[distribute] Error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
