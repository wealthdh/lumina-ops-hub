#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Lumina Ops Hub — HYBRID PRODUCTION UGC Pipeline Runner v2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  HYBRID MODE:
 *    • Kling keys present → real AI video generation
 *    • Kling keys missing  → DEV MODE placeholders
 *    • Twitter keys present → real live posting to X
 *    • Twitter keys missing → status = "ready_to_post" (no simulation)
 *
 *  FEATURES:
 *    • Auto-generates 5 new creatives per cycle
 *    • Viral Mode: 3 hooks per creative, picks strongest
 *    • Monetization Mode: CTA appended to every caption
 *    • Daily target: 50 posts/day minimum
 *    • Continuous 5-minute loop
 *    • Full logging to pipeline_logs/
 *
 *  Usage:
 *    node scripts/ugc-pipeline-runner.mjs                  # continuous (5 min)
 *    POLL_INTERVAL_MIN=2 node scripts/ugc-pipeline-runner.mjs
 *    node scripts/ugc-pipeline-runner.mjs --once           # single cycle
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

// ─── Paths ──────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const LOGS_DIR = join(PROJECT_ROOT, 'pipeline_logs')
const DAILY_STATE_FILE = join(LOGS_DIR, 'daily-state.json')

if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true })

// ─── Config ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MIN = parseFloat(process.env.POLL_INTERVAL_MIN || '5')
const POLL_INTERVAL_MS = POLL_INTERVAL_MIN * 60 * 1000
const SINGLE_RUN = process.argv.includes('--once')
const CREATIVES_PER_CYCLE = parseInt(process.env.CREATIVES_PER_CYCLE || '5')
const DAILY_TARGET = parseInt(process.env.DAILY_TARGET || '50')

// ─── Key Detection ──────────────────────────────────────────────────────────
const isRealKey = (k) => k && !k.startsWith('your_') && k !== ''

const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY
const KLING_ENABLED = isRealKey(KLING_ACCESS_KEY) && isRealKey(KLING_SECRET_KEY)

const TW_API_KEY = process.env.TWITTER_API_KEY
const TW_API_SECRET = process.env.TWITTER_API_SECRET
const TW_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TW_ACCESS_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET
const TWITTER_ENABLED = isRealKey(TW_API_KEY) && isRealKey(TW_API_SECRET) &&
                         isRealKey(TW_ACCESS_TOKEN) && isRealKey(TW_ACCESS_SECRET)

// ─── Monetization CTAs ──────────────────────────────────────────────────────
const MONETIZATION_CTAS = [
  "DM 'AI' for access",
  'DM me "BUILD" to get started',
  'Link in bio — free AI toolkit',
  'Comment "HOW" and I\'ll send the playbook',
  'DM "SCALE" for the blueprint',
]

// ─── Supabase ───────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── DEV MODE assets (GUARANTEED PUBLIC — no AccessDenied) ──────────────────
// Using sample-videos.com which serves MP4 without auth
const DEV_VIDEOS = [
  'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
  'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
  'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
  'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
  'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
]
const DEV_THUMBNAILS = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
]

// ─── Logging ────────────────────────────────────────────────────────────────
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const logFile = join(LOGS_DIR, `pipeline-${runId}.log`)

function log(level, msg, data) {
  const ts = new Date().toISOString()
  const line = `[${ts}][${level.toUpperCase()}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`
  console.log(line)
  try { appendFileSync(logFile, line + '\n') } catch {}
}

// ─── Daily State Tracking ───────────────────────────────────────────────────
function loadDailyState() {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = readFileSync(DAILY_STATE_FILE, 'utf8')
    const state = JSON.parse(raw)
    if (state.date === today) return state
  } catch {}
  return { date: today, generated: 0, posted: 0, ready_to_post: 0, errors: 0, cycle: 0 }
}

function saveDailyState(state) {
  writeFileSync(DAILY_STATE_FILE, JSON.stringify(state, null, 2))
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ─── Viral Mode: Hook Generator ─────────────────────────────────────────────
// Generates 3 hook variations per creative concept, scores them, picks best
const HOOK_TEMPLATES = {
  curiosity: [
    'Nobody is talking about this yet...',
    'I just discovered something insane about {{topic}}',
    'This changes everything about {{topic}}',
    'The {{topic}} secret that 99% of people miss',
    'I was wrong about {{topic}} — here\'s what I found',
  ],
  pain: [
    'Stop wasting money on {{topic}}',
    'If you\'re still doing {{topic}} manually, read this',
    'The #1 mistake people make with {{topic}}',
    '{{topic}} is broken — here\'s the fix',
    'You\'re losing $1,000/month because of {{topic}}',
  ],
  proof: [
    'How I used {{topic}} to generate $10K in 30 days',
    '{{topic}} just made me money while I slept',
    'Real results: {{topic}} working in production',
    'From $0 to profitable with {{topic}} — full breakdown',
    'I tested {{topic}} for 30 days — results inside',
  ],
}

function generateHooks(title) {
  // Extract topic from title
  const topic = title.replace(/—.*$/, '').trim()

  // Generate one hook from each category
  const hooks = [
    pick(HOOK_TEMPLATES.curiosity).replace('{{topic}}', topic),
    pick(HOOK_TEMPLATES.pain).replace('{{topic}}', topic),
    pick(HOOK_TEMPLATES.proof).replace('{{topic}}', topic),
  ]

  // Score: proof > curiosity > pain (proof converts best for monetization)
  // But add randomness so content stays varied
  const scores = [
    { hook: hooks[0], type: 'curiosity', score: 70 + Math.random() * 30 },
    { hook: hooks[1], type: 'pain', score: 65 + Math.random() * 35 },
    { hook: hooks[2], type: 'proof', score: 75 + Math.random() * 25 },
  ]

  scores.sort((a, b) => b.score - a.score)
  return {
    winner: scores[0],
    all: scores,
  }
}

// ─── Creative Templates (for auto-generation) ──────────────────────────────
const CREATIVE_TEMPLATES = [
  { title: 'AI Automation Profit Blueprint', platform: 'TikTok', tool: 'Kling' },
  { title: 'Passive Income with AI Agents', platform: 'Instagram', tool: 'Kling' },
  { title: 'Build a $10K/mo AI Side Hustle', platform: 'TikTok', tool: 'Kling' },
  { title: 'AI Content Factory Behind the Scenes', platform: 'YouTube', tool: 'Kling' },
  { title: 'How AI Replaced My 9-5 Income', platform: 'TikTok', tool: 'Kling' },
  { title: 'Trading Bots + AI — Full Stack Profits', platform: 'Instagram', tool: 'Kling' },
  { title: 'The AI Tool Stack Making Me Money Daily', platform: 'TikTok', tool: 'Kling' },
  { title: 'Zero to Revenue with Vibe-Coded Websites', platform: 'YouTube', tool: 'Kling' },
  { title: 'AI UGC Factory — Scale Content 100x', platform: 'TikTok', tool: 'Kling' },
  { title: 'Why Smart Founders Use AI Agents Now', platform: 'Instagram', tool: 'Kling' },
  { title: 'Polymarket + AI — Data-Driven Profits', platform: 'TikTok', tool: 'Kling' },
  { title: 'Client Onboarding in 60 Seconds with AI', platform: 'YouTube', tool: 'Kling' },
  { title: 'Tax Optimization — Let AI Handle It', platform: 'TikTok', tool: 'Kling' },
  { title: 'Crypto + MT5 Synergy Play', platform: 'Instagram', tool: 'Kling' },
  { title: 'The AI Money Machine Nobody Talks About', platform: 'TikTok', tool: 'Kling' },
  { title: 'I Automated My Entire Business with AI', platform: 'YouTube', tool: 'Kling' },
  { title: 'AI SEO Content That Actually Ranks', platform: 'TikTok', tool: 'Kling' },
  { title: 'From Idea to Revenue in 48 Hours', platform: 'Instagram', tool: 'Kling' },
  { title: 'AI Consulting — The New Gold Rush', platform: 'TikTok', tool: 'Kling' },
  { title: 'Full Stack Passive Income Breakdown', platform: 'YouTube', tool: 'Kling' },
]

// ─── STEP 1: Generate new creative rows in Supabase ─────────────────────────
async function generateNewCreatives(count, dailyState) {
  log('info', `Generating ${count} new creative(s)...`)

  const newCreatives = []
  for (let i = 0; i < count; i++) {
    const template = pick(CREATIVE_TEMPLATES)
    const hooks = generateHooks(template.title)
    const cta = pick(MONETIZATION_CTAS)

    // Build caption: winning hook + CTA
    const caption = `${hooks.winner.hook}\n\n${cta}`

    const creative = {
      user_id: '0ce62691-721c-4eba-bf3e-052731d9839b', // existing user_id from table
      title: template.title,
      platform: template.platform,
      status: 'draft',
      views: 0,
      ctr: 0,
      roas: 0,
      tool: template.tool,
      caption: caption,
      platform_ready: false,
      distributed_to: [],
      generation_prompt: `Viral hook (${hooks.winner.type}): ${hooks.winner.hook}`,
      api_provider: KLING_ENABLED ? 'kling' : 'dev-mode',
    }

    const { data, error } = await supabase
      .from('ugc_creatives')
      .insert(creative)
      .select()
      .single()

    if (error) {
      log('error', `Failed to create creative: ${error.message}`)
      dailyState.errors++
      continue
    }

    log('info', `  Created: ${data.id} — "${template.title}"`, {
      hook_type: hooks.winner.type,
      hook_score: hooks.winner.score.toFixed(1),
      hooks_considered: hooks.all.map(h => `${h.type}:${h.score.toFixed(0)}`),
    })

    newCreatives.push(data)
    dailyState.generated++
  }

  return newCreatives
}

// ─── STEP 2: Process creatives (video generation) ───────────────────────────
async function processCreative(creative, dailyState) {
  const start = Date.now()
  log('info', `Processing: ${creative.id} — "${creative.title}"`)

  try {
    // Mark as testing
    await supabase.from('ugc_creatives')
      .update({ status: 'testing' })
      .eq('id', creative.id)

    let videoUrl, thumbnailUrl, provider

    if (KLING_ENABLED) {
      // ── REAL KLING GENERATION ──────────────────────────────────────
      log('info', `  [KLING] Sending to Kling AI...`)
      provider = 'kling'

      const jwt = generateKlingJWT()
      const klingRes = await fetch('https://api.klingai.com/v1/videos/text2video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          model_name: 'kling-v2-master',
          prompt: creative.generation_prompt || creative.title,
          negative_prompt: 'blurry, low quality, distorted, watermark',
          duration: '5',
          mode: 'std',
          aspect_ratio: '9:16',
        }),
      })

      const klingData = await klingRes.json()

      if (!klingRes.ok || (klingData.code && klingData.code !== 0)) {
        const errMsg = klingData.message || klingData.error || `HTTP ${klingRes.status}`
        if (errMsg.includes('balance') || errMsg.includes('1102') || errMsg.includes('credit')) {
          log('error', '  [KLING] ❌ BILLING REQUIRED — Kling out of credits', { error: errMsg })
          log('error', '  ⚠️  ALERT: Kling billing required. Pipeline stopping for Kling jobs.')
          throw new Error(`KLING_BILLING_REQUIRED: ${errMsg}`)
        }
        throw new Error(`Kling API error: ${errMsg}`)
      }

      const taskId = klingData.data?.task_id
      if (!taskId) throw new Error('No task_id from Kling')

      log('info', `  [KLING] Task created: ${taskId} — polling...`)

      // Poll for completion (max 5 min)
      const pollStart = Date.now()
      while (Date.now() - pollStart < 300_000) {
        await new Promise(r => setTimeout(r, 5000))
        const pollRes = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
          headers: { 'Authorization': `Bearer ${generateKlingJWT()}` },
        })
        const pollData = await pollRes.json()
        const status = pollData.data?.task_status

        if (status === 'succeed') {
          videoUrl = pollData.data?.task_result?.videos?.[0]?.url
          thumbnailUrl = videoUrl?.replace(/\.\w+$/, '_thumb.jpg')
          log('info', `  [KLING] ✅ Video ready`, { video_url: videoUrl?.slice(0, 60) })
          break
        }
        if (status === 'failed') {
          throw new Error(`Kling generation failed: ${pollData.data?.task_status_msg}`)
        }
        log('info', `  [KLING] Polling... status=${status}`)
      }

      if (!videoUrl) throw new Error('Kling video generation timed out')

    } else {
      // ── DEV MODE ───────────────────────────────────────────────────
      log('info', `  [DEV MODE] No Kling keys — using placeholder video`)
      provider = 'dev-mode'
      videoUrl = pick(DEV_VIDEOS)
      thumbnailUrl = pick(DEV_THUMBNAILS)
      // Small delay to simulate processing
      await new Promise(r => setTimeout(r, 300 + Math.random() * 700))
    }

    // Ensure caption has monetization CTA
    let caption = creative.caption || ''
    const hasCTA = MONETIZATION_CTAS.some(cta => caption.includes(cta))
    if (!hasCTA) {
      caption = caption + '\n\n' + pick(MONETIZATION_CTAS)
    }

    // Save to Supabase
    const { error: updateErr } = await supabase.from('ugc_creatives')
      .update({
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption: caption,
        status: 'ready',
        platform_ready: true,
        api_provider: provider,
      })
      .eq('id', creative.id)

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

    log('info', `  ✅ Video saved — status → ready (${Date.now() - start}ms)`, {
      provider,
      video: videoUrl?.slice(0, 50),
    })

    return { ...creative, video_url: videoUrl, caption, provider, success: true }

  } catch (err) {
    log('error', `  ❌ FAILED: ${err.message}`, { id: creative.id })
    dailyState.errors++

    await supabase.from('ugc_creatives')
      .update({ status: 'draft' })
      .eq('id', creative.id)
      .catch(() => {})

    return { ...creative, success: false, error: err.message }
  }
}

// ─── STEP 3: Post to Twitter/X ─────────────────────────────────────────────
async function postToX(creative, dailyState, retryCount = 0) {
  if (!TWITTER_ENABLED) {
    // No Twitter keys — mark as ready_to_post
    log('info', `  [X] No Twitter keys — marking ready_to_post`, { id: creative.id })

    await supabase.from('ugc_creatives')
      .update({ status: 'ready' })
      .eq('id', creative.id)

    await supabase.from('distribution_log').insert({
      creative_id: creative.id,
      platform: 'Twitter/X',
      success: false,
      post_url: null,
      error_message: 'ready_to_post: Twitter API keys not configured',
    })

    dailyState.ready_to_post++
    return { success: false, reason: 'ready_to_post' }
  }

  // ── REAL TWITTER POSTING ──────────────────────────────────────────
  log('info', `  [X] Posting live to Twitter/X...`, { id: creative.id })

  try {
    const tweetText = creative.video_url
      ? `${creative.caption}\n\n${creative.video_url}`
      : creative.caption

    // Build OAuth 1.0a signature
    const oauthParams = {
      oauth_consumer_key: TW_API_KEY,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: TW_ACCESS_TOKEN,
      oauth_version: '1.0',
    }

    const url = 'https://api.x.com/2/tweets'
    const paramString = Object.keys(oauthParams).sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
      .join('&')

    const signatureBase = `POST&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
    const signingKey = `${encodeURIComponent(TW_API_SECRET)}&${encodeURIComponent(TW_ACCESS_SECRET)}`
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64')

    const authHeader = 'OAuth ' + Object.entries({ ...oauthParams, oauth_signature: signature })
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ')

    const tweetRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText.substring(0, 280) }),
    })

    const tweetData = await tweetRes.json()

    if (!tweetRes.ok) {
      const errMsg = tweetData.detail || tweetData.title || JSON.stringify(tweetData)
      throw new Error(`Twitter API ${tweetRes.status}: ${errMsg}`)
    }

    const tweetId = tweetData.data?.id
    const tweetUrl = tweetId ? `https://x.com/i/status/${tweetId}` : null

    log('info', `  [X] ✅ LIVE TWEET POSTED`, { tweet_url: tweetUrl })

    // Update Supabase
    await supabase.from('ugc_creatives')
      .update({ status: 'posted', distributed_to: ['Twitter/X'] })
      .eq('id', creative.id)

    await supabase.from('distribution_log').insert({
      creative_id: creative.id,
      platform: 'Twitter/X',
      success: true,
      post_url: tweetUrl,
      error_message: null,
    })

    dailyState.posted++
    return { success: true, tweet_url: tweetUrl }

  } catch (err) {
    log('error', `  [X] ❌ Twitter failed: ${err.message}`, { retry: retryCount })

    // Retry once
    if (retryCount < 1) {
      log('info', `  [X] Retrying (attempt ${retryCount + 1})...`)
      await new Promise(r => setTimeout(r, 2000))
      return postToX(creative, dailyState, retryCount + 1)
    }

    // Final failure — log it
    await supabase.from('distribution_log').insert({
      creative_id: creative.id,
      platform: 'Twitter/X',
      success: false,
      post_url: null,
      error_message: err.message,
    })

    dailyState.errors++
    return { success: false, error: err.message }
  }
}

// ─── Kling JWT Helper ───────────────────────────────────────────────────────
function generateKlingJWT() {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { iss: KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5 }
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const h = enc(header)
  const p = enc(payload)
  const sig = crypto.createHmac('sha256', KLING_SECRET_KEY).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${sig}`
}

// ─── Full Pipeline Cycle ────────────────────────────────────────────────────
async function runCycle(dailyState) {
  dailyState.cycle++
  const cycleStart = Date.now()

  log('info', `\n${'═'.repeat(70)}`)
  log('info', `  CYCLE #${dailyState.cycle} — ${new Date().toISOString()}`)
  log('info', `  Mode: Kling=${KLING_ENABLED ? 'REAL' : 'DEV'} | Twitter=${TWITTER_ENABLED ? 'REAL' : 'READY_TO_POST'}`)
  log('info', `  Daily: ${dailyState.posted + dailyState.ready_to_post}/${DAILY_TARGET} target`)
  log('info', `${'═'.repeat(70)}`)

  // Check daily target
  const totalDone = dailyState.posted + dailyState.ready_to_post
  if (totalDone >= DAILY_TARGET) {
    log('info', `🎯 Daily target of ${DAILY_TARGET} reached! (${totalDone} done)`)
    log('info', `   Skipping generation — will resume tomorrow.`)
    return dailyState
  }

  const remaining = DAILY_TARGET - totalDone
  const batchSize = Math.min(CREATIVES_PER_CYCLE, remaining)

  // Step 1: Generate new creatives
  const newCreatives = await generateNewCreatives(batchSize, dailyState)

  // Step 2: Also pick up any existing unprocessed creatives
  const { data: pending } = await supabase
    .from('ugc_creatives')
    .select('*')
    .is('video_url', null)
    .in('status', ['draft'])
    .order('created_at', { ascending: true })
    .limit(10)

  const toProcess = [...newCreatives, ...(pending || []).filter(p =>
    !newCreatives.find(n => n.id === p.id)
  )]

  log('info', `Processing ${toProcess.length} creative(s) (${newCreatives.length} new + ${toProcess.length - newCreatives.length} existing)`)

  // Step 3: Process each (generate video)
  const processed = []
  for (const creative of toProcess) {
    const result = await processCreative(creative, dailyState)
    processed.push(result)
  }

  // Step 4: Post successful ones to X
  const readyToPost = processed.filter(p => p.success)
  log('info', `\nPosting ${readyToPost.length} creative(s) to X...`)

  const postResults = []
  for (const creative of readyToPost) {
    const result = await postToX(creative, dailyState)
    postResults.push({ ...result, creative_id: creative.id, title: creative.title })
  }

  // Step 5: Cycle summary
  const elapsed = Date.now() - cycleStart
  const summary = {
    cycle: dailyState.cycle,
    timestamp: new Date().toISOString(),
    kling_mode: KLING_ENABLED ? 'REAL' : 'DEV',
    twitter_mode: TWITTER_ENABLED ? 'REAL' : 'READY_TO_POST',
    batch_generated: newCreatives.length,
    batch_processed: processed.length,
    batch_succeeded: processed.filter(p => p.success).length,
    batch_posted: postResults.filter(p => p.success).length,
    batch_ready_to_post: postResults.filter(p => p.reason === 'ready_to_post').length,
    batch_errors: processed.filter(p => !p.success).length,
    daily_total: dailyState.posted + dailyState.ready_to_post,
    daily_target: DAILY_TARGET,
    daily_progress_pct: Math.round(((dailyState.posted + dailyState.ready_to_post) / DAILY_TARGET) * 100),
    elapsed_ms: elapsed,
  }

  log('info', `\n── Cycle #${dailyState.cycle} Summary ──`)
  log('info', `  Generated:     ${summary.batch_generated}`)
  log('info', `  Processed:     ${summary.batch_processed} (${summary.batch_succeeded} ok)`)
  log('info', `  Posted (X):    ${summary.batch_posted}`)
  log('info', `  Ready to Post: ${summary.batch_ready_to_post}`)
  log('info', `  Errors:        ${summary.batch_errors}`)
  log('info', `  Daily Total:   ${summary.daily_total}/${DAILY_TARGET} (${summary.daily_progress_pct}%)`)
  log('info', `  Elapsed:       ${elapsed}ms`)

  // Write cycle summary
  const summaryFile = join(LOGS_DIR, `cycle-${dailyState.cycle}-${runId}.json`)
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2))

  saveDailyState(dailyState)
  return dailyState
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log('info', '🚀 Lumina Ops Hub — HYBRID PRODUCTION UGC Pipeline v2')
  log('info', `   Kling:   ${KLING_ENABLED ? '✅ REAL (keys detected)' : '⚡ DEV MODE (no keys)'}`)
  log('info', `   Twitter: ${TWITTER_ENABLED ? '✅ REAL (keys detected)' : '📋 READY_TO_POST (no keys)'}`)
  log('info', `   Loop:    ${SINGLE_RUN ? 'SINGLE RUN' : `every ${POLL_INTERVAL_MIN} min`}`)
  log('info', `   Target:  ${DAILY_TARGET} posts/day`)
  log('info', `   Batch:   ${CREATIVES_PER_CYCLE} creatives/cycle`)
  log('info', `   Viral:   ✅ 3 hooks per creative`)
  log('info', `   Monetiz: ✅ CTA in every caption`)
  log('info', `   Log:     ${logFile}`)
  log('info', '')

  // Test Supabase
  const { count, error } = await supabase
    .from('ugc_creatives')
    .select('*', { count: 'exact', head: true })
  if (error) {
    log('error', `❌ Supabase connection failed: ${error.message}`)
    process.exit(1)
  }
  log('info', `✅ Supabase connected — ${count} creatives in table\n`)

  let dailyState = loadDailyState()

  if (SINGLE_RUN) {
    await runCycle(dailyState)
    log('info', '\n✅ Single cycle complete.')
    process.exit(0)
  }

  // Continuous loop
  while (true) {
    try {
      // Reset daily state if new day
      const today = new Date().toISOString().slice(0, 10)
      if (dailyState.date !== today) {
        log('info', `📅 New day detected (${today}). Resetting daily counters.`)
        dailyState = { date: today, generated: 0, posted: 0, ready_to_post: 0, errors: 0, cycle: 0 }
      }

      dailyState = await runCycle(dailyState)
    } catch (err) {
      log('error', `Cycle crashed: ${err.message}`)
    }

    log('info', `\n⏳ Next cycle in ${POLL_INTERVAL_MIN} min... (Ctrl+C to stop)\n`)
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
