# Lumina Ops Hub — Real API Setup Guide

Everything is now wired for real APIs. No fake data, no mock responses.
Follow this guide to activate each system.

---

## 1. STRIPE (Real Payments)

### What was built
- `POST /api/create-checkout-session` — Creates Stripe Checkout Session, returns URL
- `POST /api/stripe-webhook` — Handles `checkout.session.completed`, inserts into `orders` + `income_entries`
- `DigitalAssetStore.tsx` — Buy Now button creates real checkout, shows loading/success/error states

### Setup Steps
1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`)
3. Set in Vercel Environment Variables:
   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   SUPABASE_URL=https://rjtxkjozlhvnxkzmqffk.supabase.co
   SUPABASE_SERVICE_KEY=<your service role key from Supabase Settings > API>
   ```
4. Create webhook at https://dashboard.stripe.com/test/webhooks
   - Endpoint URL: `https://your-app.vercel.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `payment_intent.payment_failed`
5. Copy webhook signing secret → set `STRIPE_WEBHOOK_SECRET=whsec_...`

### How to Test
1. Click "Initialize Store" (creates Stripe products if not exist)
2. Click "Buy Now" on any product
3. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. After payment: redirects back with green success banner
5. Check: Supabase `orders` table should have new row
6. Check: Vercel function logs should show `[stripe-webhook] Order created`

---

## 2. KLING AI (Real Video Generation)

### What was built
- `POST /api/kling?action=text2video` — Submits video generation task
- `GET /api/kling?action=status&task_id=xxx` — Polls task status
- `lib/ugcApi.ts` — Full pipeline: create task → poll → save to Supabase
- `ContentSwarm.tsx` — Generate button triggers real Kling API

### Setup Steps
1. Go to https://platform.klingai.com
2. Get your **Access Key** and **Secret Key**
3. Set in Vercel Environment Variables:
   ```
   KLING_ACCESS_KEY=<your access key>
   KLING_SECRET_KEY=<your secret key>
   ```

### How to Test
1. Go to Content Swarm tab
2. Click "Generate Creative"
3. Select a Kling template (look for "Kling" label)
4. Click Generate
5. Watch the card — should show "testing" status, then a real video
6. Check: Supabase `ugc_creatives` table → `video_url` should be a real Kling CDN URL
7. Check: Vercel logs → `[kling] Sending text2video request...` → `[kling] Task status: succeed`

---

## 3. TWITTER/X (Real Distribution)

### What was built
- Twitter/X distributor in `api/distribute.js` — OAuth 1.0a tweet posting
- Posts tweet text + video URL to `https://api.x.com/2/tweets`
- Logs to `distribution_log` table

### Setup Steps
1. Go to https://developer.x.com/en/portal/dashboard
2. Create a Project + App (or use existing)
3. Set app permissions to **Read and Write**
4. Generate OAuth 1.0a tokens under "Keys and Tokens"
5. Set in Vercel Environment Variables:
   ```
   TWITTER_API_KEY=<API Key>
   TWITTER_API_SECRET=<API Key Secret>
   TWITTER_ACCESS_TOKEN=<Access Token>
   TWITTER_ACCESS_TOKEN_SECRET=<Access Token Secret>
   ```

### How to Test
1. Generate a creative in Content Swarm (must have a video_url)
2. Click the distribute button on that creative
3. Select Twitter/X
4. Check: Your Twitter account should have a new tweet
5. Check: Supabase `distribution_log` table → `success: true`, `post_url` populated
6. Check: Vercel logs → `[distribute][twitter] Posting tweet via OAuth 1.0a...`

---

## 4. SUPABASE (Server-Side)

All API endpoints need server-side Supabase access. Set these in Vercel:
```
SUPABASE_URL=https://rjtxkjozlhvnxkzmqffk.supabase.co
SUPABASE_SERVICE_KEY=<from Supabase Dashboard > Settings > API > service_role key>
```

**Important:** The service role key bypasses RLS. Never expose it client-side.

---

## 5. VERCEL DEPLOYMENT

```bash
cd lumina-ops-hub
npm install
npm run build      # Should compile with no errors
vercel deploy      # Or push to connected Git repo
```

After deploy, set ALL env vars in Vercel Dashboard > Settings > Environment Variables.

---

## Debug Logs

All API endpoints log to Vercel function logs with this format:
```
[endpoint-name][2026-04-06T12:00:00.000Z] Message {"key": "value"}
```

View logs at: https://vercel.com/your-team/lumina-ops-hub/logs

---

## Supabase Tables Used

| Table | Written By | Purpose |
|---|---|---|
| `stripe_products` | create-payment-links, create-checkout-session | Product catalog |
| `orders` | stripe-webhook (ONLY) | Verified payments |
| `income_entries` | stripe-webhook, revenue-sync | Revenue tracking |
| `ugc_creatives` | ContentSwarm, ugcApi | Video creatives |
| `distribution_log` | distribute.js | Social posting logs |
| `mt5_trades` | MT5 bridge (external) | Trading data |
| `ops_jobs` | mt5-sync | Job P&L updates |
| `platform_connections` | Manual / OAuth flows | API tokens per platform |
