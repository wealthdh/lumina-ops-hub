/**
 * Vercel Serverless Function - Kling AI Video Generation Proxy
 * Handles JWT auth (HMAC-SHA256) and proxies to Kling AI API.
 * Keys stay server-side only.
 */
import crypto from 'crypto';

function generateKlingJWT() {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('Missing KLING_ACCESS_KEY or KLING_SECRET_KEY env vars');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const hB64 = encode(header);
  const pB64 = encode(payload);
  const sig = crypto.createHmac('sha256', secretKey).update(hB64 + '.' + pB64).digest('base64url');
  return hB64 + '.' + pB64 + '.' + sig;
}

const KLING_BASE = process.env.KLING_API_BASE || 'https://api.klingai.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const token = generateKlingJWT();
    const action = req.query?.action || req.body?.action;
    if (action === 'text2video' && req.method === 'POST') {
      const { prompt, negative_prompt = '', model_name = 'kling-v2-master', duration = '5', mode = 'std', aspect_ratio = '16:9', cfg_scale, camera_control, callback_url } = req.body;
      if (!prompt) return res.status(400).json({ error: 'prompt is required' });
      const body = { model_name, prompt, negative_prompt, duration, mode, aspect_ratio };
      if (cfg_scale !== undefined) body.cfg_scale = cfg_scale;
      if (camera_control) body.camera_control = camera_control;
      if (callback_url) body.callback_url = callback_url;
      const response = await fetch(KLING_BASE + '/v1/videos/text2video', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : response.status).json(await response.json());
    }
    if (action === 'image2video' && req.method === 'POST') {
      const { prompt = '', image, image_tail, model_name = 'kling-v2-master', duration = '5', mode = 'std', negative_prompt = '', callback_url } = req.body;
      if (!image) return res.status(400).json({ error: 'image is required' });
      const body = { model_name, image, duration, mode, prompt, negative_prompt };
      if (image_tail) body.image_tail = image_tail;
      if (callback_url) body.callback_url = callback_url;
      const response = await fetch(KLING_BASE + '/v1/videos/image2video', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : response.status).json(await response.json());
    }
    if (action === 'status' && req.method === 'GET') {
      const taskId = req.query?.task_id;
      const taskType = req.query?.type || 'text2video';
      if (!taskId) return res.status(400).json({ error: 'task_id is required' });
      const response = await fetch(KLING_BASE + '/v1/videos/' + taskType + '/' + taskId, { headers: { Authorization: 'Bearer ' + token } });
      return res.status(response.ok ? 200 : response.status).json(await response.json());
    }
    return res.status(400).json({ error: 'Invalid action. Use: text2video, image2video, or status' });
  } catch (err) {
    console.error('[kling] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
