# Lumina Ops Hub — Deployment Checklist

**Time to live: < 2 hours from zero**

---

## STEP 1 — Install Dependencies (5 min)

```bash
cd lumina-ops-hub
npm install
```

> Requires Node 18+. Check: `node --version`

---

## STEP 2 — Environment Variables (10 min)

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon key |
| `VITE_MT5_API_KEY` | Your existing LuminaPulse EA config (see Step 4) |
| `VITE_MT5_BRIDGE_URL` | `http://localhost:8080` (local) or your bridge server |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys |
| `VITE_WALLETCONNECT_PROJECT_ID` | cloud.walletconnect.com → New Project |

---

## STEP 3 — Supabase Setup (15 min)

### 3a. Create Supabase project
1. Go to https://supabase.com → New Project
2. Region: choose closest to your MT5 server
3. Save your database password

### 3b. Run schema
```sql
-- In Supabase Dashboard → SQL Editor → New Query
-- Copy-paste contents of: supabase/schema.sql → Run
```

### 3c. Run RLS policies
```sql
-- Copy-paste contents of: supabase/rls_policies.sql → Run
```

### 3d. Optional: seed demo data
```sql
-- Edit supabase/seed_demo.sql:
-- Replace 'YOUR_USER_UUID' with your actual user ID
-- (Auth → Users → copy the UUID)
-- Then run it in SQL Editor
```

### 3e. Enable Auth
- Supabase Dashboard → Authentication → Providers → Email (already enabled)
- Add your email, set password, confirm

---

## STEP 4 — Connect LuminaPulse MT5 (20 min)

The Ops Hub talks to your existing LuminaPulse EA via a REST bridge.
The bridge can be the MT5 built-in HTTP server or a lightweight Node proxy.

### Option A: Use LuminaPulse's built-in HTTP bridge (recommended)

In your existing `LuminaPulse.set` file, confirm these are set:
```
HTTP_SERVER_ENABLED=true
HTTP_SERVER_PORT=8080
HTTP_SERVER_API_KEY=your_api_key_here    ← set VITE_MT5_API_KEY to match
```

The LP EA exposes these endpoints (which mt5Bridge.ts uses):
- `GET  /account`        → account snapshot
- `GET  /trades`         → open positions
- `POST /order`          → place order
- `POST /close/:ticket`  → close trade
- `GET  /kelly/:symbol`  → Kelly sizing
- `POST /mirror-edge`    → Twin-Engine sync

### Option B: Node.js bridge proxy (if LP doesn't have HTTP server)

```bash
# In a separate terminal / server
npx lp-bridge-proxy --port 8080 --mt5-pipe "\\\\.\\pipe\\LuminaPulse"
```

Or deploy the bridge to a VPS near your MT5 server and set:
```
VITE_MT5_BRIDGE_URL=https://your-bridge.yourdomain.com
```

### Firewall note
If running locally: Vite proxies `/api/mt5` → `http://localhost:8080` automatically (see `vite.config.ts`).
In production (Vercel): create `api/mt5/[...path].ts` edge function that forwards to your bridge URL.

---

## STEP 5 — Run Locally (2 min)

```bash
npm run dev
```

Open http://localhost:3000

The dashboard will load in **demo mode** (mock data) if Supabase/MT5 keys are not yet set.
Once keys are filled in `.env`, it connects live automatically.

---

## STEP 6 — Deploy to Vercel (10 min)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard:
# Project Settings → Environment Variables
# Copy all vars from your .env file
```

**Or connect via GitHub:**
1. Push this repo to GitHub
2. vercel.com → New Project → Import from GitHub
3. Add env vars → Deploy

### Vercel config (already included)

```json
// vercel.json is auto-detected. Add this if you need custom routing:
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## STEP 7 — Connect Stripe, Plaid, WalletConnect (30 min)

### Stripe
1. stripe.com → Get API keys
2. Set `VITE_STRIPE_PUBLISHABLE_KEY` in .env
3. FunnelAgent.tsx uses Stripe Checkout for invoice payment links

### Plaid (bank sync for Tax Optimizer)
1. plaid.com → Create app → Get credentials
2. Set `PLAID_CLIENT_ID` and `PLAID_SECRET` in .env
3. Tax auto-categorizer pulls transactions via Plaid Link

### WalletConnect (Crypto Yield Stack)
1. cloud.walletconnect.com → Create project
2. Set `VITE_WALLETCONNECT_PROJECT_ID`

---

## STEP 8 — External AI integrations (optional, 20 min)

### Arcads (UGC video generation)
- arcads.ai → API → Get key → set `VITE_ARCADS_API_KEY`

### Kling (AI video)
- kling.ai → Developer → API key → set `VITE_KLING_API_KEY`

### Claude/Anthropic (AI briefing + negotiation)
- console.anthropic.com → API Keys → set `ANTHROPIC_API_KEY`
- Used in: DailyBriefing generation, FunnelAgent negotiation, SynergyBrain analysis
- These run server-side via Supabase Edge Functions (deploy separately)

---

## Supabase Edge Functions (nightly jobs)

Deploy these for automated nightly runs:

```bash
# Install Supabase CLI
npm i -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy edge functions (create these in supabase/functions/)
supabase functions deploy daily-briefing    # runs at 06:00 UTC
supabase functions deploy pulp-optimizer    # runs at 02:00 UTC
supabase functions deploy arb-scanner       # runs every 5 min
supabase functions deploy tax-categorizer   # runs on Plaid webhook
```

---

## LuminaPulse MT5 Connection Architecture

```
MT5 Terminal
    ↓  Named pipe / HTTP
LuminaPulse EA (existing)
    ↓  HTTP REST (port 8080)
MT5 Bridge (localhost or VPS)
    ↓  Proxied via Vite (dev) / Edge Function (prod)
Lumina Ops Hub Dashboard
    ↑  Supabase Realtime
Supabase Database (account snapshots, trade history)
```

The bridge writes account snapshots to Supabase every 10s, so the dashboard
can show live data even if the bridge is temporarily disconnected.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Missing Supabase env vars" | Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env |
| Dashboard shows mock data | Expected in demo mode — fill in real keys to go live |
| MT5 bridge 404 | Check MT5 bridge is running on port 8080 |
| CORS error on bridge | Add `Access-Control-Allow-Origin: *` to bridge headers |
| RLS "permission denied" | Make sure you're logged in via Supabase Auth |
| Realtime not updating | Check table is in supabase_realtime publication (rls_policies.sql Step 3b) |

---

## Quick Health Check

```bash
npm run test:first-run
```

This runs `scripts/first-run-test.ts` which verifies:
- ✓ Supabase connection
- ✓ MT5 bridge reachable
- ✓ Schema tables exist
- ✓ RLS policies active
- ✓ Demo data loadable
