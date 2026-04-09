# Lumina Ops Hub — Activation Guide

## Status: All Systems Connected & Outreach Live

---

## EMAILS SENT TODAY (April 3, 2026)

| # | Niche | Business | Email | Status |
|---|-------|----------|-------|--------|
| 1 | Dental | The Dentists of Newtown | info@dentistsofnewtown.com | SENT (earlier session) |
| 2 | HVAC | Family Heating & Air Conditioning | info@familyhvac.com | SENT |
| 3 | Real Estate | Laurie Dau Team (eXp Realty) | lauriedau@gmail.com | SENT |
| 4 | Gym/Fitness | Ignite Fitness (Owner: Chris) | ignitefitnessnewtown@gmail.com | SENT |
| 5 | Med Spa | 4Ever Young Med Spa - Newtown | newtown@4everyoungantiaging.com | SENT |

**Total outreach: 5 personalized emails to real local businesses near Newtown, PA**

---

## STEP 1: Activate Supabase (10 minutes)

1. Go to your **Supabase Dashboard** → select your project
2. Click **SQL Editor** → **New Query**
3. Open and copy the contents of: `supabase/seed_UPGRADE_v3.sql`
4. Paste into the SQL Editor and click **Run**
5. This will upgrade all 10 jobs with latest revenue projections and auto-tasks

---

## STEP 2: Deploy to Vercel (5 minutes)

### Option A: CLI Deploy
```bash
cd lumina-ops-hub
npm install -g vercel    # if not already installed
vercel                   # follow prompts, select your project
```

### Option B: GitHub Deploy
1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Vercel auto-detects `vercel.json` config
4. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
   - `VITE_STRIPE_PUBLIC_KEY` → your Stripe publishable key
5. Click Deploy

### Pre-built files
The `dist/` folder already contains a production build. You can also serve it locally:
```bash
npx serve dist
```

---

## STEP 3: Connect X/Twitter (2 minutes)

The X/Twitter post is ready but you need to log into X in Chrome first:
1. Open Chrome → go to x.com
2. Log in with your account
3. Then I can post the AI marketing content automatically

---

## CONNECTED SYSTEMS

| System | Status | What It Does |
|--------|--------|-------------|
| Airtable | LIVE | Ops Hub Jobs table with all 10 jobs, revenue, targets, next actions |
| Gmail | LIVE | 5 outreach emails sent, Forge-369 daily reports in drafts |
| Asana | LIVE | 5 priority income tasks with due dates |
| Google Calendar | LIVE | Daily 9AM income review (weekdays) + Weekly Sunday deep-dive |
| Notion | LIVE | Command Center page with full job dashboard |
| Scheduled Tasks | LIVE | Daily Polymarket edge scan (weekday 8AM) |
| Polymarket | CONNECTED | Wallet setup complete (by user) |
| LinkedIn | POSTED | AI passive income content posted (by user) |
| X/Twitter | BLOCKED | Needs user login in Chrome |

---

## THE 10 JOBS (from seed_UPGRADE_v3.sql)

| # | Job | Monthly Target | Category |
|---|-----|---------------|----------|
| 1 | AI UGC Factory + Client Ad Packs | $55,000 | Content |
| 2 | Liquidity Sniper | $31,000 | Trading |
| 3 | Vibe-Code Websites | $28,000 | Dev |
| 4 | AI Education Hub | $15,000 | Education |
| 5 | AI Customer Acquisition Engine | $50,000 | Agency |
| 6 | Polymarket Edge Trader | $22,000 | Trading |
| 7 | Digital Asset Store | $12,000 | Passive |
| 8 | Content Distribution MCP | $8,000 | Marketing |
| 9 | LuminaPulse Profit Bridge | $35,000 | Trading |
| 10 | Cross-Job Synergy Brain | $20,000 | Orchestration |

---

## NEXT ACTIONS TO MAXIMIZE INCOME

1. **Run the Supabase seed** — activates all 10 jobs in the live dashboard
2. **Deploy to Vercel** — makes the dashboard accessible anywhere
3. **Check email replies** — any of the 5 prospects could respond within 24-72 hours
4. **Log into X in Chrome** — so I can post marketing content
5. **Fund Polymarket** — deposit to start edge-entry trading on low-odds contracts
6. **Run deploy.sh** — push the blog live for organic search traffic + AdSense
