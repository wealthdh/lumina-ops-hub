/**
 * Vercel Serverless Function — Kling AI Video Generation Proxy
 *
 * Handles JWT authentication (HMAC-SHA256) and proxies requests to the
 * Kling AI API. Keeps secret keys server-side only.
 *
 * Endpoints (via query param ?action=...):
 *   POST ?action=text2video   — Create a text-to-video generation task
 *   POST ?action=image2video  — Create an image-to-video generation task
 *   GET  ?action=status&task_id=xxx — Poll task status
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ─── JWT Generation ──────────────────────────────────────────────────────────
function generateKlingJWT() {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('Missing KLING_ACCESS_KEY or KLING_SECRET_KEY env vars');
  }

  const now = Math.floor(Date.now() / 1000);

  // Header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // Payload — 30 min expiry, valid from 5s ago
  const payload = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5,
  };

  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

// ─── Kling API base ──────────────────────────────────────────────────────────
const KLING_BASE = process.env.KLING_API_BASE || 'https://api.klingai.com';

// ─── Supabase client (initialized on demand) ─────────────────────────────────
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

// ─── CORS helper ─────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

// ─── Logger (with [KLING] prefix for consistency) ──────────────────────────
const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[KLING][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

// ─── Fetch timeout wrapper ───────────────────────────────────────────────────
function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Validate keys before proceeding
  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY ||
      process.env.KLING_ACCESS_KEY === 'your_kling_access_key_here') {
    log('error', 'KLING_ACCESS_KEY or KLING_SECRET_KEY not configured');
    return res.status(500).json({
      error: 'Kling API not configured',
      details: 'Set KLING_ACCESS_KEY and KLING_SECRET_KEY in your Vercel environment variables. Get them from https://platform.klingai.com',
    });
  }

  try {
    const token = generateKlingJWT();
    const action = req.query?.action || req.body?.action;
    log('info', `Request: ${req.method} action=${action}`, {
      query: req.query,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });

    // ── Text-to-Video ──────────────────────────────────────────────
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

      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }

      const body = {
        model_name,
        prompt,
        negative_prompt,
        duration,
        mode,
        aspect_ratio,
      };

      // Optional fields
      if (cfg_scale !== undefined) body.cfg_scale = cfg_scale;
      if (camera_control) body.camera_control = camera_control;
      if (callback_url) body.callback_url = callback_url;

      log('info', 'Sending text2video request to Kling', { prompt: body.prompt?.substring(0, 80), duration: body.duration, aspect_ratio: body.aspect_ratio });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${KLING_BASE}/v1/videos/text2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).catch((err) => {
        clearTimeout(timeout);
        throw err;
      });

      clearTimeout(timeout);

      const data = await response.json();
      log(response.ok ? 'info' : 'error', 'Kling text2video response', {
        status: response.status,
        code: data.code,
        message: data.message,
        task_id: data.data?.task_id,
        task_status: data.data?.task_status,
      });

      // If successful, persist task_id to Supabase ugc_creatives table
      if (response.ok && data.data?.task_id && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('ugc_creatives')
            .update({ task_id: data.data.task_id })
            .eq('id', creativeId)
            .then(() => {
              log('info', 'Persisted task_id to Supabase', { creativeId, task_id: data.data.task_id });
            })
            .catch((err) => {
              log('warn', 'Failed to persist task_id to Supabase', { creativeId, error: err.message });
            });
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    // ── Image-to-Video ─────────────────────────────────────────────
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

      if (!image) {
        return res.status(400).json({ error: 'image (URL or base64) is required' });
      }

      const body = {
        model_name,
        image,
        duration,
        mode,
        prompt,
        negative_prompt,
      };

      if (image_tail) body.image_tail = image_tail;
      if (callback_url) body.callback_url = callback_url;

      log('info', 'Sending image2video request to Kling', { duration, mode });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${KLING_BASE}/v1/videos/image2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).catch((err) => {
        clearTimeout(timeout);
        throw err;
      });

      clearTimeout(timeout);

      const data = await response.json();
      log(response.ok ? 'info' : 'error', 'Kling image2video response', {
        status: response.status,
        code: data.code,
        message: data.message,
        task_id: data.data?.task_id,
        task_status: data.data?.task_status,
      });

      // If successful, persist task_id to Supabase ugc_creatives table
      if (response.ok && data.data?.task_id && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('ugc_creatives')
            .update({ task_id: data.data.task_id })
            .eq('id', creativeId)
            .then(() => {
              log('info', 'Persisted task_id to Supabase', { creativeId, task_id: data.data.task_id });
            })
            .catch((err) => {
              log('warn', 'Failed to persist task_id to Supabase', { creativeId, error: err.message });
            });
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    // ── Poll Task Status ───────────────────────────────────────────
    if (action === 'status' && req.method === 'GET') {
      const taskId = req.query?.task_id;
      const taskType = req.query?.type || 'text2video';
      const creativeId = req.query?.creativeId;

      if (!taskId) {
        return res.status(400).json({ error: 'task_id is required' });
      }

      log('info', 'Polling task status', { taskId, taskType });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(
        `${KLING_BASE}/v1/videos/${taskType}/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        }
      ).catch((err) => {
        clearTimeout(timeout);
        throw err;
      });

      clearTimeout(timeout);

      const data = await response.json();
      const videoUrl = data.data?.task_result?.videos?.[0]?.url;

      log('info', 'Task status response', {
        task_id: taskId,
        status: data.data?.task_status,
        has_videos: !!data.data?.task_result?.videos?.length,
        video_url: videoUrl?.substring(0, 60),
      });

      // If video is complete, update Supabase record with video URLs and set status to 'live'
      if (response.ok && data.data?.task_status === 'succeed' && videoUrl && creativeId) {
        const sb = getSupabaseClient();
        if (sb) {
          const thumbnailUrl = videoUrl.replace(/\.\w+$/, '_thumb.jpg');
          sb.from('ugc_creatives')
            .update({
              video_url: videoUrl,
              thumbnail_url: thumbnailUrl,
              status: 'live',
            })
            .eq('id', creativeId)
            .then(() => {
              log('info', 'Updated creative to live status with video URLs', {
                creativeId,
                taskId,
                video_url: videoUrl.substring(0, 60),
              });
            })
            .catch((err) => {
              log('warn', 'Failed to update creative status to live', {
                creativeId,
                error: err.message,
              });
            });
        }
      }

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    return res.status(400).json({
      error: 'Invalid action. Use: text2video, image2video, or status',
    });
  } catch (err) {
    log('error', 'Unhandled error', { message: err.message, stack: err.stack });
    return res.status(500).json({
      error: err.message || 'Internal server error',
    });
  }
}
