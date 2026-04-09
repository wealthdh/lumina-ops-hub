# Lumina Ops Hub — Going Live Checklist

Your dashboard is wiped clean and showing **real $0 data**. Follow these 3 steps to get real money flowing.

---

## Step 1: Deploy the Real Withdrawal Function (5 min)

The deployed `cashout-crypto` edge function is a placeholder that returns fake transaction hashes. You need to deploy the real version that sends actual USDT on-chain.

**On your Windows PC (or any machine with Node.js):**

```bash
cd lumina-ops-hub
npx supabase login
npx supabase functions deploy cashout-crypto --project-ref rjtxkjozlhvnxkzmqffk --no-verify-jwt
```

Or run the included script:
```bash
bash LAUNCH.sh
```

This deploys the real ethers.js code that executes actual BNB Smart Chain USDT transfers.

---

## Step 2: Fund the Hot Wallet (2 min)

Your hot wallet address (derived from the private key already stored in Supabase secrets):

**`0x3862bDf58827A2d1e5e7a831167db33951d79A25`**

Send to this address on **BNB Smart Chain (BEP-20)**:
- At least **$50+ USDT** (whatever amount you want available for withdrawals)
- At least **$0.50 worth of BNB** (for gas fees — each transfer costs ~$0.05)

The withdrawal system will send USDT from this wallet to your MetaMask when you cash out.

---

## Step 3: Start the MT5 Bridge (2 min)

This syncs your live CoinExx MT5 account data into the dashboard every 10 seconds.

**On your Windows PC with MetaTrader 5 installed:**

```bash
cd lumina-ops-hub/mt5_bridge
pip install MetaTrader5 supabase schedule python-dotenv requests
python coinexx_sync.py
```

Make sure MetaTrader 5 is open and logged into your CoinExx account first.

**What it does:**
- Pushes live balance, equity, margin to `mt5_accounts` table
- Pushes open trades to `mt5_trades` table
- Pushes closed-trade profits to `income_entries` (makes them withdrawable)
- Starts REST bridge on port 8080 for the dashboard
- Takes hourly equity curve snapshots

---

## How Money Flows Through the App

```
Real Income Source → income_entries table → Available Balance → Withdrawal
```

**Automatic (MT5 bridge):** When the bridge is running, every profitable closed trade automatically creates an `income_entries` row. This increases your available balance.

**Manual (any job):** Click "Log real income for this job" on any job card to record income from clients, ad revenue, consulting, etc.

**Withdrawal:** Available Balance = Total Income Entries - Total Withdrawals. Cash out sends real USDT from the hot wallet to your MetaMask.

---

## Your Wallet Addresses

| Wallet | Address | Purpose |
|--------|---------|---------|
| Hot Wallet (platform) | `0x3862bDf58827A2d1e5e7a831167db33951d79A25` | Sends USDT to users on withdrawal |
| Cold Wallet (yours) | `0xc77a0B887e182265d36C69E9588027328a9557A7` | Your MetaMask — receives withdrawals |

---

## Quick Test After Setup

1. Start the MT5 bridge → dashboard shows live equity
2. Log a test income entry ($1) on any job card
3. Click "Cash Out Today" → enter your MetaMask address → send 2FA code → confirm
4. Check BscScan for the real transaction hash
5. Check MetaMask for the USDT arriving
