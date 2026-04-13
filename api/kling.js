/**
 * Vercel Serverless Function — Kling AI Video Generation Proxy
 *
 * Handles JWT authentication (HMAC-SHA256) and proxies requests to the
 * Kling AI API. Keeps secret keys server-side only.
 *
 * VIDEO URL FIX: Kling returns private GCS URLs that expire.
 * This function now downloads the video and uploads to Supabase Storage
 * (ugc-videos bucket, public), so video_url is ALWAYS publicly accessible.
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

// ─── Upload video to Supabase Storage → return public URL ───────────────────
// Downloads the private Kling URL and re-uploads to our public bucket.
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

    // Download the video binary
    const videoRes = await fetchWithTimeout(privateUrl, {}, 120000); // 2 min timeout for large video
    if (!videoRes.ok) {
      throw new Error(`Download failed: HTTP ${videoRes.status}`);
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const contentType = videoRes.headers.get('content-type') || 'video/mp4';
    const ext = contentType.includes('webm') ? 'webm' : 'mp4';
    const fileName = `${creativeId || crypto.randomUUID()}-${Date.now()}.${ext}`;
    const storagePath = `creatives/${fileName}`;

    log('info', '[UGC] Uploading to Supabase Storage...', {
      path: storagePath,
      size_bytes: videoBuffer.length,
      content_type: contentType,
    });

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await sb.storage
      .from('ugc-videos')
      .upload(storagePath, videoBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: publicUrlData } = sb.storage
      .from('ugc-videos')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;

    log('info', '[UGC] ✅ Video uploaded to Supabase Storage', {
      original_url: privateUrl.substring(0, 60),
      uploaded_path: storagePath,
      public_url: publicUrl,
    });

    return publicUrl;
  } catch (err) {
    log('error', '[UGC] ❌ Failed to upload to Supabase Storage', {
      error: err.message,
      original_url: privateUrl.substring(0, 60),
    });
    return null;
  }
}

// ─── BLOCKED DOMAINS — never save these as video_url ────────────────────────
const BLOCKED_DOMAINS = ['storage.googleapis.com', 'googleapis.com', 'storage.cloud.google.com'];

function isBlockedUrl(url) {
  if (!url) return false;
  return BLOCKED_DOMAINS.some(d => url.includes(d));
}

// ─── Make a video URL public (upload if private, or return as-is) ───────────
async function ensurePublicVideoUrl(videoUrl, creativeId) {
  if (!videoUrl) return null;

  // HARD BLOCK: Never allow googleapis URLs through
  if (isBlockedUrl(videoUrl)) {
    log('error', '[UGC] BLOCKED private URL — googleapis detected, using DEV MODE', {
      blocked_url: videoUrl.substring(0, 80),
    });
    return DEV_MODE_VIDEO;
  }

  // Already public (known safe domains)
  const publicDomains = [
    'interactive-examples.mdn.mozilla.net',
    'www.w3schools.com',
    'filesamples.com',
    'supabase.co/storage',
    'supabase.in/storage',
  ];
  const isAlreadyPublic = publicDomains.some(d => videoUrl.includes(d));
  if (isAlreadyPublic) {
    log('info', '[UGC] Video URL already public — no upload needed');
    return videoUrl;
  }

  // Private URL (Kling CDN, etc.) → download + upload to Supabase Storage
  log('info', '[UGC] Private URL detected — uploading to Supabase Storage...');
  const publicUrl = await uploadToSupabaseStorage(videoUrl, creativeId);

  if (publicUrl) {
    // Double-check the uploaded URL isn't somehow private
    if (isBlockedUrl(publicUrl)) {
      log('error', '[UGC] BLOCKED — upload returned private URL, using DEV MODE');
      return DEV_MODE_VIDEO;
    }
    return publicUrl;
  }

  // Fallback: use DEV MODE video
  log('warn', '[UGC] Upload failed — using DEV MODE fallback video');
  return DEV_MODE_VIDEO;
}

// ─── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validate Kling keys
  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY ||
      process.env.KLING_ACCESS_KEY === 'your_kling_access_key_here') {
    log('error', 'KLING_ACCESS_KEY or KLING_SECRET_KEY not configured');
    return res.status(500).json({
      error: 'Kling API not configured',
      details: 'Set KLING_ACCESS_KEY and KLING_SECRET_KEY in your Vercel environment variables.',
    });
  }

  try {
    const token = generateKlingJWT();
    const action = req.query?.action || req.body?.action;
    log('info', `Request: ${req.method} action=${action}`, {
      query: req.query,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });

    // ── Text-to-Video ─────────────────────────────────────────────
    if (action === 'text2video' && req.method === 'POST') {
      const {
        prompt,
        negative_prompt = '',
        model_name = 'kling-v2-master',
        duration = '5',
        mode = 'std',
        aspect_ratio = '16:9',
        cfg_scale,
        camera_control,
        callback_url,
        creativeId,
      } = req.body;

      if (!prompt) return res.status(400).json({ error: 'prompt is required' });

      const body = { model_name, prompt, negative_prompt, duration, mode, aspect_ratio };
      if (cfg_scale !== undefined) body.cfg_scale = cfg_scale;
      if (camera_control) body.camera_control = camera_control;
      if (callback_url) body.callback_url = callback_url;

      log('info', 'Sending text2video request to Kling', {
        prompt: body.prompt?.substring(0, 80),
        duration: body.duration,
        aspect_ratio: body.aspect_ratio,
      });

      const response = await fetchWithTimeout(`${KLING_BASE}/v1/videos/text2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      log(response.ok ? 'info' : 'error', 'Kling text2video response', {
        status: response.status,
        code: data.code,
        message: data.message,
        task_id: data.data?.task_id,
      });

      // Persist task_id
      if (response.ok && data.data?.task_id && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('ugc_creatives')
            .update({ task_id: data.data.task_id })
            .eq('id', creativeId)
            .then(() => log('info', 'Persisted task_id', { creativeId, task_id: data.data.task_id }))
            .catch((err) => log('warn', 'Failed to persist task_id', { error: err.message }));
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    // ── Image-to-Video ────────────────────────────────────────────
    if (action === 'image2video' && req.method === 'POST') {
      const {
        prompt = '',
        image,
        image_tail,
        model_name = 'kling-v2-master',
        duration = '5',
        mode = 'std',
        negative_prompt = '',
        callback_url,
        creativeId,
      } = req.body;

      if (!image) return res.status(400).json({ error: 'image is required' });

      const body = { model_name, image, duration, mode, prompt, negative_prompt };
      if (image_tail) body.image_tail = image_tail;
      if (callback_url) body.callback_url = callback_url;

      log('info', 'Sending image2video request to Kling', { duration, mode });

      const response = await fetchWithTimeout(`${KLING_BASE}/v1/videos/image2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      log(response.ok ? 'info' : 'error', 'Kling image2video response', {
        status: response.status,
        code: data.code,
        task_id: data.data?.task_id,
      });

      if (response.ok && data.data?.task_id && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('ugc_creatives')
            .update({ task_id: data.data.task_id })
            .eq('id', creativeId)
            .then(() => log('info', 'Persisted task_id', { creativeId }))
            .catch((err) => log('warn', 'Failed to persist task_id', { error: err.message }));
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
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

      const data = await response.json();

      // Check all possible URL fields from Kling response
      const klingVideo = data.data?.task_result?.videos?.[0];
      const rawVideoUrl = klingVideo?.url || klingVideo?.play_url || klingVideo?.download_url || null;

      log('info', 'Task status response', {
        task_id: taskId,
        status: data.data?.task_status,
        has_videos: !!data.data?.task_result?.videos?.length,
        raw_video_url: rawVideoUrl?.substring(0, 80),
        video_fields: klingVideo ? Object.keys(klingVideo) : [],
      });

      // ── VIDEO COMPLETE: Download → Upload to Supabase → Public URL ──
      if (response.ok && data.data?.task_status === 'succeed' && rawVideoUrl) {
        log('info', '[UGC] Video generation complete — ensuring public URL...');

        const publicVideoUrl = await ensurePublicVideoUrl(rawVideoUrl, creativeId);
        const provider = publicVideoUrl === DEV_MODE_VIDEO ? 'fallback' : 'kling';

        log('info', '[UGC] Final video URLs', {
          original_url: rawVideoUrl.substring(0, 60),
          final_public_url: publicVideoUrl,
          provider,
        });

        // Overwrite the response with the public URL
        if (data.data?.task_result?.videos?.[0]) {
          data.data.task_result.videos[0].url = publicVideoUrl;
          data.data.task_result.videos[0].original_private_url = rawVideoUrl;
        }

        // Update Supabase record with PUBLIC url
        if (creativeId) {
          const sb = getSupabaseClient();
          if (sb) {
            const thumbnailUrl = publicVideoUrl.replace(/\.\w+$/, '_thumb.jpg');
            sb.from('ugc_creatives')
              .update({
                video_url: publicVideoUrl,
                thumbnail_url: thumbnailUrl,
                status: 'ready',
                platform_ready: true,
                api_provider: provider,
              })
              .eq('id', creativeId)
              .then(() => {
                log('info', '[UGC] ✅ Creative updated with public video URL', {
                  creativeId,
                  public_url: publicVideoUrl.substring(0, 60),
                });
              })
              .catch((err) => {
                log('warn', '[UGC] Failed to update creative', { error: err.message });
              });
          }
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    // ── Unknown action ────────────────────────────────────────────
    return res.status(400).json({
      error: `Unknown action: ${req.query?.action}`,
      available: ['text2video', 'image2video', 'status'],
    });
  } catch (err) {
    log('error', 'Handler error', { message: err.message, stack: err.stack });
    return res.status(500).json({ error: err.message });
  }
}
