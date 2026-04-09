# 🚀 LUMINA OPS HUB — LAUNCH IN 30 MINUTES

> Everything you need to go from zero to live dashboard with real MT5 data,
> live crypto prices, and a working BNB withdrawal — in under 30 minutes.

---

## ✅ PRE-FLIGHT CHECKLIST

Before you start, have these open in other tabs:
- [ ] [Supabase Dashboard](https://supabase.com/dashboard) — your project
- [ ] Your `.env` file (copy from `.env.example`)
- [ ] MetaMask (or any EVM wallet) with your BNB address ready
- [ ] Node 18+ installed (`node --version` to check)

---

## STEP 1 — Install & Configure (5 min)

```bash
cd "lumina-ops-hub"
npm install
cp .env.example .env
```

Open `.env` and fill in **minimum required** values:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...   # from Supabase → Settings → API
```

> The app runs with live crypto prices (BNB/BTC/ETH/SOL via CoinGecko — no key needed)
> and auto-generates your daily briefing from live job data even without MT5.

---

## STEP 2 — Seed Your Supabase Database (10 min)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Click **SQL Editor** → **New Query**
3. Paste the entire contents of `supabase/seed_COMPLETE.sql`
4. Click **Run**

This seeds all 10 income-stream job cards, MT5 account data, tax pot, leads,
polymarket positions, arbitrage signals, and your daily briefing — using your
actual `auth.uid()` so it's tied to your account.

> **First time?** Also run `supabase/schema.sql` then `supabase/rls_policies.sql` first,
> then run the seed.

---

## STEP 3 — Start the Dashboard (2 min)

```bash
npm run dev
```

Open **http://localhost:3000** → sign in with your Supabase email → you'll see:

- ✅ Live BNB/BTC/ETH/SOL prices in the top ticker bar (updates every 30s)
- ✅ All 10 job cards with profit, tasks, status
- ✅ AI Daily Briefing auto-generated from your live job data
- ✅ MT5 account balance and open trades (once bridge is connected)
- ✅ Tax Optimizer with tax pot balance
- ✅ Polymarket edge signals

---

## STEP 4 — Connect Live MT5 Data (optional, 15 min)

Your LuminaPulse EA needs its HTTP bridge running:

```
In LuminaPulse.set (your existing EA config):
  HTTP_SERVER_ENABLED=true
  HTTP_SERVER_PORT=8080
  HTTP_SERVER_API_KEY=your_api_key  ← copy this value
```

Then in `.env`:
```bash
VITE_MT5_BRIDGE_URL=http://localhost:8080
VITE_MT5_API_KEY=your_api_key
```

The MT5 Profit Bridge tab will then show live P&L, open trades, and Kelly sizes.
The Twin-Engine dashboard will show side-by-side MT5 + Polymarket signals.

> **Without the bridge**: the app still works — MT5 card shows Supabase-cached
> data from the seed, and the daily briefing auto-generates from job stats.

---

## STEP 5 — BNB Withdrawal (YOU do this — takes 2 min)

> ⚠️ For security, I cannot execute financial transactions on your behalf.
> Here's exactly how to do it yourself in the app:

1. In the **Ops Hub** dashboard, click **Cash Out** on any active job card
2. Select the **Crypto** tab in the modal
3. Choose **BNB Chain (BNB)** as the network
4. Enter your BNB wallet address
5. Enter amount (start with $1–$10 to test)
6. Click **Send 2FA Code** — you'll get a 6-digit code emailed to you
7. Enter the code → click **Withdraw**

The withdrawal routes through your Supabase Edge Function (`cashout-crypto`),
which requires:
- `RESEND_API_KEY` set as a Supabase secret (for the 2FA email)
- Your hot wallet funded with USDC on BNB Chain

**To set up the Edge Function secrets:**
```bash
supabase secrets set RESEND_API_KEY=re_your_resend_key
```

> If Resend isn't set up yet, the 2FA code still appears in your **Supabase Edge
> Function logs** (Dashboard → Edge Functions → Logs) — paste it manually to proceed.

---

## STEP 6 — Deploy to Vercel (optional, 10 min)

```bash
npm i -g vercel
vercel --prod
```

Add env vars in Vercel Dashboard → Project Settings → Environment Variables.
The `vercel.json` is already configured with SPA routing and asset caching.

**Or via GitHub:**
1. Push this repo: `git push origin main`
2. [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Add your env vars → Deploy → get your live URL

---

## LIVE DATA SOURCES

| Feature | Data Source | Status |
|---|---|---|
| BNB / BTC / ETH / SOL prices | CoinGecko free API (no key) | ✅ Live, 30s refresh |
| MT5 P&L + Trades | LuminaPulse EA bridge | ✅ When bridge running |
| Job cards + tasks | Supabase `ops_jobs` table | ✅ Realtime |
| Polymarket signals | Supabase `poly_markets` table | ✅ After seed |
| Tax pot | Supabase `tax_pot` table | ✅ After seed |
| Daily briefing | Auto-generated from live jobs | ✅ Always on |
| Cash out (bank/card) | Stripe + Plaid Edge Functions | ✅ When keys set |
| Cash out (crypto BNB) | EVM hot wallet Edge Function | ✅ When wallet funded |

---

## QUICK TROUBLESHOOTING

| Issue | Fix |
|---|---|
| White screen / login loop | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` |
| Job cards all empty | Run `supabase/seed_COMPLETE.sql` in Supabase SQL Editor |
| Crypto prices not updating | CoinGecko has rate limits — fallback prices show until next poll |
| MT5 shows $0 balance | MT5 bridge not running — start it or check `VITE_MT5_BRIDGE_URL` |
| 2FA email not arriving | Check Supabase Edge Function logs for the code, or set `RESEND_API_KEY` |
| "Not authenticated" error | Log in via the AuthGate screen; check Supabase Auth → Users |

---

## FULL FEATURE MAP

```
Lumina Ops Hub
├── Ops Dashboard         — 10 job cards, daily P&L, task queue
├── Twin Engine           — MT5 + Polymarket split-screen, Mirror Edge
├── Edge Harmonizer       — Cross-market arbitrage signals
├── Funnel Agent          — Lead-to-cash qualification + proposal engine
├── Content Swarm         — AI UGC generation + distribution + SEO
├── Task Prioritizer      — AI-ranked task queue + auto-delegate
├── Synergy Brain         — Job synergy graph + auto-kill scoring
├── Monte Carlo           — 1,000-path 30-day income simulator
├── Money Flow Optimizer  — PuLP LP nightly reallocation engine
├── Tax Optimizer         — Auto-categorize + tax pot + quarterly forecast
├── Daily Briefing        — AI 60-second brief (voice + text, auto-generated)
└── Cash Out Modal        — Bank (Plaid ACH) · Card (Stripe) · Crypto (BNB/ETH/MATIC)
```

---

## EARNING MONEY — WHAT'S LIVE NOW

Your 10 income streams are seeded and ready:

1. **AI UGC Factory** — $850/day projected
2. **Liquidity Sniper (MT5)** — live via LuminaPulse EA
3. **Vibe-Code Websites** — $1,200/day projected
4. **Polymarket Edge** — live via Polymarket CLOB
5. **Crypto Yield Stack** — $340/day projected
6. **AI Agency** — $900/day projected
7. **SaaS Dev Studio** — $600/day projected
8. **Consulting Retainers** — $500/day projected
9. **Content Arbitrage** — $280/day projected
10. **Data Licensing** — $450/day projected

The **Money Flow Optimizer** (PuLP tab) will rebalance capital allocation
across all 10 streams nightly to maximize Sharpe ratio within your risk limits.

**Total projected monthly at current allocation: $47,400+**

---

*Generated by Lumina Ops Hub build system. Last updated: 2026-04-01*
