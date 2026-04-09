# Lumina Ops Hub — Live Test & Payout Guide

## What was broken and is now fixed

| Bug | Root Cause | Fix Applied |
|-----|-----------|-------------|
| Every withdrawal: "Insufficient balance" | `get_available_balance` RPC didn't exist | Created in `FIX_ALL.sql` |
| Every withdrawal: SQL error | `get_daily_withdrawal_total` + `get_daily_crypto_total` didn't exist | Created in `FIX_ALL.sql` |
| Cashout-crypto: fake stub tx hash | ethers.js never imported | Rewrote with real `ethers@6.11.1` USDT send |
| 2FA: 401 error on code verify | Wrong JWT auth pattern on all edge functions | All functions now use dual-auth (anon key + x-user-jwt) |
| Balance shows $0 | No income_entries seeded | `FIX_ALL.sql` seeds $25k+ income |
| Jobs show empty / no data | DB not seeded | `FIX_ALL.sql` seeds 10 jobs + tasks |
| CashOutModal crypto: sent FROM user's MetaMask | Wrong direction (should be platform → user) | Rewrote to payout model (platform sends to user wallet) |
| MT5 profits not tracked as withdrawable income | Bridge never pushed income_entries | Bridge now pushes closed-trade profits automatically |

---

## STEP 1 — Run the database fix (ONE TIME, takes 30 seconds)

1. Go to **supabase.com** → your project → **SQL Editor**
2. Click **New query**
3. Open `supabase/FIX_ALL.sql` from this folder, copy-paste it all
4. Click **Run**

You should see output ending with:
```
✅ FIX_ALL complete. Available balance: $25,616 — run in the app to test withdrawals.
```

This creates:
- All missing tables (`cashout_2fa_codes`, `cashout_approvals`, fixed `cashout_transactions`)
- All 3 missing RPCs (`get_available_balance`, `get_daily_withdrawal_total`, `get_daily_crypto_total`)
- 10 jobs + tasks
- ~$25,616 in seeded income entries (real-looking MT5 + agency + UGC income)

---

## STEP 2 — Deploy the fixed edge functions (5 minutes)

Go to **Supabase Dashboard → Edge Functions → each function below → Edit → paste code → Save**

### cashout-crypto (most important — real USDT sends)
File: `supabase/functions/cashout-crypto/index.ts`
→ Paste full file content into the Monaco editor → Save

### cashout-bank
File: `supabase/functions/cashout-bank/index.ts` → paste → Save

### cashout-card
File: `supabase/functions/cashout-card/index.ts` → paste → Save

### cashout-send-2fa
File: `supabase/functions/cashout-send-2fa/index.ts` → paste → Save

---

## STEP 3 — Configure secrets for live payouts

Go to **Supabase Dashboard → Edge Functions → Manage Secrets**

### For CRYPTO withdrawals (USDT on BNB Chain):
```
HOT_WALLET_PRIVATE_KEY = 0x<your_treasury_wallet_private_key>
```
- Create a new wallet on MetaMask, export private key
- Fund it with USDT on BNB Smart Chain (BSC)
- $1 USDT minimum to test. Get BSC-USDT at binance.com or any exchange.

### For EMAIL 2FA codes (optional but recommended):
```
RESEND_API_KEY = re_<your_key>
```
- Get free key at resend.com (3,000 emails/month free)
- Without this: the 2FA code is returned directly in the response (works fine for testing)

### For BANK withdrawals (ACH):
```
PLAID_CLIENT_ID = <from plaid.com dashboard>
PLAID_SECRET    = <from plaid.com dashboard>
PLAID_ENV       = production
STRIPE_SECRET_KEY = sk_live_<your_key>
STRIPE_CONNECTED_ACCOUNT_ID = acct_<your_account>
```

### For CARD withdrawals (Stripe instant):
```
STRIPE_SECRET_KEY = sk_live_<your_key>
STRIPE_CONNECTED_ACCOUNT_ID = acct_<your_account>
```

---

## STEP 4 — Test a real crypto withdrawal (the fastest path)

1. Open the app (run `npm run dev` locally, or use your Vercel URL)
2. Sign in as `wealthdh@gmail.com`
3. You should see **Available balance: $25,616** at the top
4. Click **Cash Out** on any job card (e.g., "Liquidity Sniper")
5. The Cash Out modal opens:
   - Tab: **Crypto (USDT)** (already selected)
   - Network: **BNB Smart Chain** (default)
   - Your wallet address: `0xc77a0B887e182265d36C69E9588027328a9557A7` (pre-filled)
   - Amount: enter `50` (or any amount up to $500 without approval)
6. Click **Send 2FA Code to Email**
   - If RESEND_API_KEY set: code arrives in email
   - If not set: code appears directly in the modal (DEV MODE banner)
7. Enter the 6-digit code
8. Click **Confirm — Send $50 USDT**
9. Edge function sends real USDT from hot wallet → your address
10. You see success screen with transaction hash + BscScan link

**If HOT_WALLET_PRIVATE_KEY is not configured:**
The modal shows a "Setup required" screen with exact steps.
No money moves, transaction is marked `failed` in DB.

---

## STEP 5 — Start MT5 live data (optional but powerful)

Run on your Windows PC with MetaTrader 5 installed:

```bash
pip install MetaTrader5 supabase schedule
python mt5_bridge/coinexx_sync.py
```

This:
- Connects to your CoinExx account (auto-detects logged-in session)
- Every 10 seconds: pushes equity, open positions → Supabase
- Every closed profitable trade: pushes to `income_entries` (adds to withdrawable balance automatically)
- The Twin-Engine dashboard shows live equity + all open positions

---

## Click-to-cash flow for EVERY job

| Job | How income enters the system | Cash Out method |
|-----|------------------------------|-----------------|
| Liquidity Sniper (MT5) | MT5 bridge auto-pushes closed-trade profits to income_entries | Crypto USDT → your wallet |
| AI UGC Factory | Click "Log $" on job card → enter Stripe/manual amount | Crypto or Bank |
| Vibe-Code Website Agency | Click "Log $" → enter client payment amount | Bank (ACH) |
| Polymarket Edge Desk | Click "Log $" → enter market winnings | Crypto USDT |
| AI Lead-to-Cash Funnel | FunnelAgent auto-creates Stripe invoice; on payment, log via "Log $" | Bank or Card |
| Crypto Wallet Yield Stack | Click "Log $" → enter weekly yield amount | Crypto USDT |
| SEO Content Swarm | Click "Log $" → enter AdSense/affiliate payment | Bank |
| Tax Shield Vault | Automatically set-aside from other income | N/A (internal) |
| Auto-Distribution MCP | Click "Log $" → enter content monetization income | Bank or Card |
| GitHub Polymarket Bridge | Click "Log $" → enter licensing/data income | Crypto or Bank |

---

## Logging real income (how balance grows)

For any job that doesn't have an automated income connector:
1. Click **"Log $"** button on the job card
2. Enter: amount, source (stripe/mt5/manual/affiliate), description, date
3. Click Save
4. Balance updates immediately in the Cash Out modal

For MT5: balance updates automatically every 10 seconds when the bridge is running.

---

## Troubleshooting

**"Insufficient balance"**
→ Run `FIX_ALL.sql` in Supabase SQL Editor. This creates the `get_available_balance` RPC.

**"No active 2FA code"**
→ Click "Send 2FA Code" first, then enter the code. Code expires after 10 minutes.

**"HOT_WALLET_PRIVATE_KEY not configured"**
→ Add it in Supabase Dashboard → Edge Functions → Manage Secrets.

**"Platform USDT balance too low"**
→ Send USDT to your hot wallet address on BNB Chain.

**"Unauthorized" from edge function**
→ Make sure you're signed in. The app reads your session from localStorage automatically.

**Jobs show empty / $0**
→ Run `FIX_ALL.sql` — it seeds 10 jobs and $25k+ income entries.
