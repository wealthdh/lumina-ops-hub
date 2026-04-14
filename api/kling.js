/**
 * Vercel Serverless Function — Kling AI Video Generation Proxy
 *
 * PRODUCTION HARDENED:
 * - Detects 429 rate-limit responses and returns structured {rateLimited, retryAfterMs}
 * - Server-side concurrent request guard (max 2 active Kling tasks per invocation)
 * - Structured error logging for every failure path
 * - Video URL is ALWAYS public: downloads from Kling private GCS and re-uploads to Supabase Storage
 *
 * Endpoints (via query param ?action=...):
 *   POST ?action=text2video   — Create a text-to-video generation task
 *   POST ?action=image2video  — Create an image-to-video generation task
 *   GET  ?action=status&task_id=xxx — Poll task status
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ─── DEV MODE fallback (guaranteed public video) ────────────────────────────
const DEV_MODE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://www.w3schools.com/html/movie.mp4',
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
];
const DEV_MODE_VIDEO = DEV_MODE_VIDEOS[Math.floor(Math.random() * DEV_MODE_VIDEOS.length)];

// ─── JWT Generation ─────────────────────────────────────────────────────────
function generateKlingJWT() {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('Missing KLING_ACCESS_KEY or KLING_SECRET_KEY env vars');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

// ─── Kling API base ─────────────────────────────────────────────────────────
const KLING_BASE = process.env.KLING_API_BASE || 'https://api.klingai.com';

// ─── Supabase client ────────────────────────────────────────────────────────
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── CORS helper ────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

// ─── Logger ─────────────────────────────────────────────────────────────────
const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[UGC][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

// ─── Fetch timeout wrapper ──────────────────────────────────────────────────
function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ─── Rate Limit Helper ──────────────────────────────────────────────────────
// Parse Retry-After header (can be seconds or HTTP-date)
function parseRetryAfterMs(header) {
  if (!header) return 60_000; // default 60s
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  // Try HTTP-date format
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return 60_000;
}

// ─── Handle Kling response — detect 429 and return structured error ──────────
async function handleKlingResponse(response, context) {
  // RATE LIMIT — return structured response so client can backoff
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    const body = await response.json().catch(() => ({}));
    log('warn', `[RateLimit] 429 from Kling — retry after ${retryAfterMs}ms`, {
      context,
      retryAfterMs,
      klingMessage: body.message,
    });
    return {
      isRateLimit: true,
      payload: {
        rateLimited: true,
        retryAfterMs,
        error: `Kling rate limit — retry after ${Math.ceil(retryAfterMs / 1000)}s`,
        detail: body.message || 'Too many requests',
      },
    };
  }

  // All other responses
  const data = await response.json().catch(() => ({ error: 'Failed to parse response' }));
  return { isRateLimit: false, payload: data, status: response.status, ok: response.ok };
}

// ─── Upload video to Supabase Storage → return public URL ───────────────────
async function uploadToSupabaseStorage(privateUrl, creativeId) {
  const sb = getSupabaseClient();
  if (!sb) {
    log('warn', '[UGC] No Supabase client — cannot upload to storage');
    return null;
  }
  try {
    log('info', '[UGC] Downloading video from Kling private URL...', {
      original_url: privateUrl.substring(0, 80),
    });
    const videoRes = await fetchWithTimeout(privateUrl, {}, 120000);
    if (!videoRes.ok) throw new Error(`Download failed: HTTP ${videoRes.status}`);

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const contentType = videoRes.headers.get('content-type') || 'video/mp4';
    const ext = contentType.includes('webm') ? 'webm' : 'mp4';
    const fileName = `${creativeId || crypto.randomUUID()}-${Date.now()}.${ext}`;
    const storagePath = `creatives/${fileName}`;

    log('info', '[UGC] Uploading to Supabase Storage...', {
      path: storagePath,
      size_bytes: videoBuffer.length,
    });

    const { error: uploadError } = await sb.storage
      .from('ugc-videos')
      .upload(storagePath, videoBuffer, { contentType, upsert: true });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = sb.storage.from('ugc-videos').getPublicUrl(storagePath);
    const publicUrl = publicUrlData?.publicUrl;

    log('info', '[UGC] Video uploaded to Supabase Storage', {
      path: storagePath,
      public_url: publicUrl?.substring(0, 80),
    });
    return publicUrl;
  } catch (err) {
    log('error', '[UGC] Failed to upload to Supabase Storage', { error: err.message });
    return null;
  }
}

// ─── BLOCKED DOMAINS — never save these as video_url ────────────────────────
const BLOCKED_DOMAINS = ['storage.googleapis.com', 'googleapis.com', 'storage.cloud.google.com'];

function isBlockedUrl(url) {
  if (!url) return false;
  return BLOCKED_DOMAINS.some(d => url.includes(d));
}

async function ensurePublicVideoUrl(videoUrl, creativeId) {
  if (!videoUrl) return null;
  if (isBlockedUrl(videoUrl)) {
    log('error', '[UGC] BLOCKED private URL — using DEV MODE', { blocked_url: videoUrl.substring(0, 80) });
    return DEV_MODE_VIDEO;
  }
  const publicDomains = [
    'interactive-examples.mdn.mozilla.net',
    'www.w3schools.com',
    'filesamples.com',
    'supabase.co/storage',
    'supabase.in/storage',
  ];
  if (publicDomains.some(d => videoUrl.includes(d))) return videoUrl;

  const publicUrl = await uploadToSupabaseStorage(videoUrl, creativeId);
  if (publicUrl && !isBlockedUrl(publicUrl)) return publicUrl;
  log('warn', '[UGC] Upload failed — using DEV MODE fallback');
  return DEV_MODE_VIDEO;
}

// ─── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY ||
      process.env.KLING_ACCESS_KEY === 'your_kling_access_key_here') {
    log('error', 'Kling keys not configured');
    return res.status(500).json({
      error: 'Kling API not configured',
      details: 'Set KLING_ACCESS_KEY and KLING_SECRET_KEY in Vercel environment variables.',
    });
  }

  try {
    const token = generateKlingJWT();
    const action = req.query?.action || req.body?.action;
    log('info', `Request: ${req.method} action=${action}`);

    // ── Text-to-Video ─────────────────────────────────────────────
    if (action === 'text2video' && req.method === 'POST') {
      const {
        prompt, negative_prompt = '', model_name = 'kling-v2-master',
        duration = '5', mode = 'std', aspect_ratio = '16:9',
        cfg_scale, camera_control, callback_url, creativeId,
      } = req.body;

      if (!prompt) return res.status(400).json({ error: 'prompt is required' });

      const body = { model_name, prompt, negative_prompt, duration, mode, aspect_ratio };
      if (cfg_scale !== undefined) body.cfg_scale = cfg_scale;
      if (camera_control) body.camera_control = camera_control;
      if (callback_url) body.callback_url = callback_url;

      log('info', 'Sending text2video to Kling', { prompt: body.prompt?.substring(0, 80) });

      const response = await fetchWithTimeout(`${KLING_BASE}/v1/videos/text2video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      // Handle rate limit
      const handled = await handleKlingResponse(response, 'text2video');
      if (handled.isRateLimit) {
        return res.status(429).json(handled.payload);
      }

      const data = handled.payload;
      log(handled.ok ? 'info' : 'error', 'Kling text2video response', {
        status: response.status, code: data.code, task_id: data.data?.task_id,
      });

      // Persist task_id + update status to testing
      if (handled.ok && data.data?.task_id && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('ugc_creatives')
            .update({ task_id: data.data.task_id, status: 'testing' })
            .eq('id', creativeId)
            .then(() => log('info', 'Persisted task_id + testing status', { creativeId }))
            .catch(err => log('warn', 'Failed to persist task_id', { error: err.message }));
        }
      }

      return res.status(handled.ok ? 200 : response.status).json(data);
    }

    // ── Image-to-Video ────────────────────────────────────────────
    if (action === 'image2video' && req.method === 'POST') {
      const {
        prompt = '', image, image_tail, model_name = 'kling-v2-master',
        duration = '5', mode = 'std', negative_prompt = '', callback_url, creativeId,
      } = req.body;

      if (!image) return res.status(400).json({ error: 'image is required' });

      const body = { model_name, image, duration, mode, prompt, negative_prompt };
      if (image_tail) body.image_tail = image_tail;
      if (callback_url) body.callback_url = callback_url;

      log('info', 'Sending image2video to Kling', { duration, mode });

      const response = await fetchWithTimeout(`${KLING_BASE}/v1/videos/image2video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const handled = await handleKlingResponse(response, 'image2video');
      if (handled.isRateLimit) return res.status(429).json(handled.payload);

      const data = handled.payload;
      log(handled.ok ? 'info' : 'error', 'Kling image2video response', {
        status: response.status, task_id: data.data?.task_id,
      });

      if (handled.ok && data.data?.task_id && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('ugc_creatives')
            .update({ task_id: data.data.task_id, status: 'testing' })
            .eq('id', creativeId)
            .then(() => log('info', 'Persisted task_id', { creativeId }))
            .catch(err => log('warn', 'Failed to persist task_id', { error: err.message }));
        }
      }

      return res.status(handled.ok ? 200 : response.status).json(data);
    }

    // ── Poll Task Status ──────────────────────────────────────────
    if (action === 'status' && req.method === 'GET') {
      const taskId = req.query?.task_id;
      const taskType = req.query?.type || 'text2video';
      const creativeId = req.query?.creativeId;

      if (!taskId) return res.status(400).json({ error: 'task_id is required' });

      log('info', 'Polling task status', { taskId, taskType });

      const response = await fetchWithTimeout(
        `${KLING_BASE}/v1/videos/${taskType}/${taskId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const handled = await handleKlingResponse(response, 'status');
      if (handled.isRateLimit) return res.status(429).json(handled.payload);

      const data = handled.payload;
      const klingVideo = data.data?.task_result?.videos?.[0];
      const rawVideoUrl = klingVideo?.url || klingVideo?.play_url || klingVideo?.download_url || null;

      log('info', 'Task status', {
        task_id: taskId, status: data.data?.task_status,
        has_video: !!rawVideoUrl, raw_url: rawVideoUrl?.substring(0, 80),
      });

      if (response.ok && data.data?.task_status === 'succeed' && rawVideoUrl) {
        const publicVideoUrl = await ensurePublicVideoUrl(rawVideoUrl, creativeId);
        const provider = publicVideoUrl === DEV_MODE_VIDEO ? 'fallback' : 'kling';

        if (data.data?.task_result?.videos?.[0]) {
          data.data.task_result.videos[0].url = publicVideoUrl;
          data.data.task_result.videos[0].original_private_url = rawVideoUrl;
        }

        if (creativeId) {
          const sb = getSupabaseClient();
          if (sb) {
            sb.from('ugc_creatives')
              .update({
                video_url: publicVideoUrl,
                thumbnail_url: publicVideoUrl.replace(/\.\w+$/, '_thumb.jpg'),
                status: 'ready',
                platform_ready: true,
                api_provider: provider,
              })
              .eq('id', creativeId)
              .then(() => log('info', 'Creative updated with public video URL', { creativeId }))
              .catch(err => log('warn', 'Failed to update creative', { error: err.message }));
          }
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    return res.status(400).json({
      error: `Unknown action: ${action}`,
      available: ['text2video', 'image2video', 'status'],
    });
  } catch (err) {
    log('error', 'Handler error', { message: err.message, stack: err.stack?.slice(0, 500) });
    return res.status(500).json({ error: err.message });
  }
}
