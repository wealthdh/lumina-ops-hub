# TONIGHT — Go-Live Checklist
# Lumina Ops Hub · Darrell's Personal Dashboard

Your BNB address is pre-configured: `0xc77a0B887e182265d36C69E9588027328a9557A7`
All 10 jobs are live. Real income logs the moment you record it or Stripe pays you.

---

## STEP 1 — Install dependencies (1 min)

```bash
cd lumina-ops-hub
npm install
```

---

## STEP 2 — Set up Supabase environment (5 min)

Create `.env.local` (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Get these from: **Supabase Dashboard → Settings → API**

---

## STEP 3 — Run the database schemas (10 min)

In Supabase SQL Editor, run these in order:

1. `supabase/schema.sql` — main tables (ops_jobs, auto_tasks, etc.)
2. `supabase/cashout_schema_v3.sql` — withdrawal tracking
3. `supabase/income_schema.sql` — **NEW: real income tracking + Stripe webhook**
4. `supabase/seed_COMPLETE.sql` — loads your 10 jobs with starter data

After running seed_COMPLETE.sql, all 10 jobs appear immediately.

---

## STEP 4 — Test the app locally (2 min)

```bash
npm run dev
```

Open http://localhost:5173 — you should see all 10 jobs with live data.

---

## STEP 5 — BNB TEST WITHDRAWAL (do this tonight)

**What this does:** Sends real BNB from your MetaMask wallet to `0xc77a0B887e182265d36C69E9588027328a9557A7`

1. Open the app → click any job → "Cash Out"
2. Crypto tab is selected by default, BSC/BNB is pre-selected
3. Your address `0xc77a0B887e182265d36C69E9588027328a9557A7` is pre-filled
4. Click "Connect MetaMask Wallet" → MetaMask opens → approve connection
5. Enter a test amount (e.g. `0.01` = ~$6 worth of BNB)
6. Click "Send via MetaMask" → MetaMask popup → confirm
7. Real BNB arrives in your wallet in ~3–10 seconds
8. TxHash appears with BSCScan link to verify

**Note:** You are sending FROM your connected MetaMask wallet TO your cold BNB address.
Make sure your MetaMask wallet has enough BNB for the amount + gas (~0.0005 BNB gas).

---

## STEP 6 — Enable real Stripe income tracking

### 6a. Set Supabase secrets
```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  LUMINA_DEFAULT_USER_ID=YOUR_SUPABASE_AUTH_USER_ID \
  LUMINA_DEFAULT_JOB_ID=j05
```

Get your user ID from: Supabase → Authentication → Users → copy your UUID

### 6b. Deploy the webhook function
```bash
supabase functions deploy stripe-webhook
```

### 6c. Register in Stripe Dashboard
- Go to: https://dashboard.stripe.com/webhooks
- Add endpoint: `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
- Select events: `charge.succeeded`, `payment_intent.succeeded`, `invoice.paid`, `payout.paid`
- Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` above

**From now on:** Every Stripe payment auto-logs to the correct job card. Daily/monthly totals update in real-time.

---

## STEP 7 — Log your first real income manually

From any job card:
1. Click the green **"Log $"** button
2. Enter the amount, source (Manual/Stripe/Consulting/etc.), description
3. Click "Log $X to [job name]"
4. Job card daily/monthly numbers update immediately

Use this to backfill any income you've already earned this month.

---

## STEP 8 — Deploy to Vercel (5 min)

```bash
# Install Vercel CLI if needed
npm install -g vercel

# Deploy
vercel --prod

# Set env vars in Vercel Dashboard:
# VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
```

Your live URL: `https://lumina-ops-hub.vercel.app` (or custom domain)

---

## STEP 9 — Deploy all Supabase Edge Functions

```bash
supabase functions deploy \
  stripe-webhook \
  plaid-link-token \
  cashout-bank \
  cashout-card \
  cashout-approve \
  cashout-crypto
```

---

## Real Data Sources — What's Live RIGHT NOW (no setup needed)

| Feature | Data Source | Status |
|---------|-------------|--------|
| BNB Price | CoinGecko public API | ✅ LIVE |
| ETH/MATIC Price | CoinGecko public API | ✅ LIVE |
| Polymarket Markets | Polymarket CLOB API (public) | ✅ LIVE |
| BNB Wallet Balance | MetaMask `eth_getBalance` | ✅ LIVE on connect |
| MT5 Account | LuminaPulse bridge | ✅ when bridge running |
| Job Earnings | Supabase `income_entries` | ✅ after manual log or Stripe |
| Cash Out Crypto | MetaMask direct (no backend) | ✅ LIVE |
| Cash Out Bank | Plaid + Stripe (edge functions) | ✅ after Step 6 deploy |

---

## Supabase Edge Function Secrets Cheat Sheet

```bash
supabase secrets set PLAID_CLIENT_ID=...
supabase secrets set PLAID_SECRET=...
supabase secrets set PLAID_ENV=production
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_CONNECTED_ACCOUNT_ID=acct_...
supabase secrets set LUMINA_DEFAULT_USER_ID=<your-supabase-uuid>
supabase secrets set LUMINA_DEFAULT_JOB_ID=j05
```

---

## Troubleshooting

**"Only 3 jobs showing"** → Run `supabase/seed_COMPLETE.sql` in Supabase SQL Editor

**"Can't connect MetaMask"** → Make sure MetaMask browser extension is installed and you're on http://localhost:5173 or your Vercel URL (not a file:// URL)

**"BNB withdrawal fails"** → Make sure your connected MetaMask wallet has BNB for the amount + gas. The recipient is pre-filled as your cold wallet address.

**"Stripe webhook not firing"** → Check Supabase Functions logs: `supabase functions logs stripe-webhook`

**"Income not updating"** → Run `supabase/income_schema.sql` — the `income_entries` table needs to exist first

---

## Your Daily Cash Flow (from tonight)

| Action | Time | Cash |
|--------|------|------|
| Client pays Stripe invoice | Instant | Auto-logged to job card |
| MT5 trade closes | Instant | Auto-logged via bridge |
| Log manual income | 10 seconds | Immediate dashboard update |
| Cash out BNB to wallet | ~5 seconds | Real on-chain tx |
| Cash out via ACH bank | 2–3 business days | After Plaid setup |
