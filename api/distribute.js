/**
 * Vercel Serverless Function - Auto-Distribution Engine
 *
 * When a UGC creative is marked "live", this function queues
 * distribution to all connected platforms.
 *
 * Endpoints (via query param ?action=...):
 *   POST ?action=distribute   - Distribute to all connected platforms
 *   POST ?action=single       - Distribute to a single platform
 *   GET  ?action=status       - Get distribution status for a creative
 *   GET  ?action=connections   - List platform connection status
 */
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

const DISTRIBUTORS = {
  async TikTok(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No TikTok access token configured' }
    try {
      const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${connection.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_info: { title: creative.title, privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_stitch: false, disable_comment: false },
          source_info: { source: 'PULL_FROM_URL', video_url: creative.video_url },
        }),
      })
      const data = await initRes.json()
      if (data.error?.code) return { success: false, error: data.error.message || 'TikTok API error' }
      return { success: true, post_url: `https://tiktok.com/@user/video/${data.data?.publish_id || ''}` }
    } catch (err) { return { success: false, error: err.message } }
  },

  async Instagram(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No Instagram access token configured' }
    try {
      const igUserId = connection.platform_user_id || 'me'
      const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'REELS', video_url: creative.video_url, caption: creative.caption || creative.title, access_token: connection.access_token }),
      })
      const container = await containerRes.json()
      if (container.error) return { success: false, error: container.error.message }
      const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: connection.access_token }),
      })
      const published = await publishRes.json()
      if (published.error) return { success: false, error: published.error.message }
      return { success: true, post_url: `https://instagram.com/reel/${published.id}` }
    } catch (err) { return { success: false, error: err.message } }
  },

  async YouTube(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No YouTube access token configured' }
    return { success: false, error: 'YouTube Shorts upload requires OAuth flow - queued for manual review' }
  },

  async LinkedIn(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No LinkedIn access token configured' }
    try {
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${connection.access_token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
        body: JSON.stringify({
          author: `urn:li:person:${connection.platform_user_id}`,
          lifecycleState: 'PUBLISHED',
          specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: creative.caption || creative.title }, shareMediaCategory: 'VIDEO', media: [{ status: 'READY', originalUrl: creative.video_url, title: { text: creative.title } }] } },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      })
      const data = await res.json()
      if (!res.ok) return { success: false, error: data.message || 'LinkedIn API error' }
      return { success: true, post_url: `https://linkedin.com/feed/update/${data.id}` }
    } catch (err) { return { success: false, error: err.message } }
  },

  async 'Twitter/X'(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No Twitter/X access token configured' }
    return { success: false, error: 'Twitter/X video upload requires chunked media upload - queued for manual review' }
  },

  async Facebook(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No Facebook access token configured' }
    try {
      const pageId = connection.platform_user_id || 'me'
      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: creative.video_url, title: creative.title, description: creative.caption || creative.title, access_token: connection.access_token }),
      })
      const data = await res.json()
      if (data.error) return { success: false, error: data.error.message }
      return { success: true, post_url: `https://facebook.com/watch/?v=${data.id}` }
    } catch (err) { return { success: false, error: err.message } }
  },

  async Pinterest(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No Pinterest access token configured' }
    return { success: false, error: 'Pinterest video pin API integration pending - queued' }
  },

  async Threads(creative, connection) {
    if (!connection?.access_token) return { success: false, error: 'No Threads access token configured' }
    try {
      const res = await fetch('https://graph.threads.net/v1.0/me/threads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'VIDEO', video_url: creative.video_url, text: creative.caption || creative.title, access_token: connection.access_token }),
      })
      const data = await res.json()
      if (data.error) return { success: false, error: data.error.message }
      const pubRes = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: data.id, access_token: connection.access_token }),
      })
      const pub = await pubRes.json()
      return { success: true, post_url: `https://threads.net/t/${pub.id}` }
    } catch (err) { return { success: false, error: err.message } }
  },
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const supabase = getSupabase()
    const action = req.query?.action || req.body?.action

    if (action === 'distribute' && req.method === 'POST') {
      const { creative_id } = req.body
      if (!creative_id) return res.status(400).json({ error: 'creative_id is required' })

      const { data: creative, error: cErr } = await supabase.from('ugc_creatives').select('*').eq('id', creative_id).single()
      if (cErr || !creative) return res.status(404).json({ error: 'Creative not found' })
      if (!creative.video_url) return res.status(400).json({ error: 'Creative has no video_url - generate first' })

      const { data: connections } = await supabase.from('platform_connections').select('*').eq('connected', true)
      const results = []
      const distributedTo = []

      for (const platformName of Object.keys(DISTRIBUTORS)) {
        const conn = (connections || []).find(c => c.platform === platformName)
        const result = await DISTRIBUTORS[platformName](creative, conn || null)
        await supabase.from('distribution_log').insert({ creative_id: creative.id, platform: platformName, success: result.success, post_url: result.post_url || null, error_message: result.error || null })
        if (result.success) distributedTo.push(platformName)
        results.push({ platform: platformName, ...result })
      }

      await supabase.from('ugc_creatives').update({ distributed_to: distributedTo, status: 'live' }).eq('id', creative.id)
      return res.status(200).json({ creative_id: creative.id, total: results.length, successful: distributedTo.length, results })
    }

    if (action === 'single' && req.method === 'POST') {
      const { creative_id, platform } = req.body
      if (!creative_id || !platform) return res.status(400).json({ error: 'creative_id and platform are required' })
      const { data: creative } = await supabase.from('ugc_creatives').select('*').eq('id', creative_id).single()
      if (!creative?.video_url) return res.status(400).json({ error: 'Creative not found or has no video' })
      const { data: connections } = await supabase.from('platform_connections').select('*').eq('platform', platform).eq('connected', true)
      const conn = connections?.[0] || null
      const distributor = DISTRIBUTORS[platform]
      if (!distributor) return res.status(400).json({ error: `Unknown platform: ${platform}` })
      const result = await distributor(creative, conn)
      await supabase.from('distribution_log').insert({ creative_id: creative.id, platform, success: result.success, post_url: result.post_url || null, error_message: result.error || null })
      return res.status(200).json({ platform, ...result })
    }

    if (action === 'status' && req.method === 'GET') {
      const creativeId = req.query?.creative_id
      if (!creativeId) return res.status(400).json({ error: 'creative_id query param is required' })
      const { data: logs } = await supabase.from('distribution_log').select('*').eq('creative_id', creativeId).order('created_at', { ascending: false })
      return res.status(200).json({ creative_id: creativeId, logs: logs || [] })
    }

    if (action === 'connections' && req.method === 'GET') {
      const { data: connections } = await supabase.from('platform_connections').select('platform, connected, last_post, created_at').order('platform')
      const platforms = Object.keys(DISTRIBUTORS).map(name => {
        const conn = (connections || []).find(c => c.platform === name)
        return { platform: name, connected: conn?.connected || false, last_post: conn?.last_post || null }
      })
      return res.status(200).json({ platforms })
    }

    return res.status(400).json({ error: 'Invalid action. Use: distribute, single, status, or connections' })
  } catch (err) {
    console.error('[distribute] Error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
