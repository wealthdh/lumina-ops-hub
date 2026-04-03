-- ============================================================
-- LUMINA OPS HUB — COMPLETE SEED v2 (All 10 Jobs + All Tables)
--
-- HOW TO RUN:
--   1. Go to Supabase Dashboard → SQL Editor → New Query
--   2. IMPORTANT: Get your UUID from Authentication → Users
--   3. Paste your UUID on line marked *** PASTE YOUR UUID HERE ***
--   4. Paste this entire file and click "Run"
--
-- If you only have ONE user, the script auto-detects your ID.
-- ============================================================

DO $$
DECLARE
  -- *** PASTE YOUR UUID HERE (get from Authentication → Users) ***
  -- e.g.:  uid UUID := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  uid UUID := NULL;

BEGIN

  -- Auto-detect first user if uid not set above
  IF uid IS NULL THEN
    SELECT id INTO uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION
      'No user found. Go to Authentication → Users in Supabase Dashboard, copy your UUID, and paste it at the top of this script: uid UUID := ''your-uuid-here'';';
  END IF;

  RAISE NOTICE 'Seeding for user: %', uid;

  -- ─── MT5 Account ─────────────────────────────────────────────────────────
  INSERT INTO mt5_accounts (
    account_id, balance, equity, margin, free_margin, margin_level,
    profit, day_pnl, week_pnl, month_pnl, updated_at, user_id
  ) VALUES (
    '100023891', 48250.00, 49880.32, 1200.00, 48680.32, 4156.69,
    1630.32, 842.50, 3210.00, 12450.00, now(), uid
  ) ON CONFLICT (account_id) DO UPDATE SET
    equity       = EXCLUDED.equity,
    profit       = EXCLUDED.profit,
    day_pnl      = EXCLUDED.day_pnl,
    week_pnl     = EXCLUDED.week_pnl,
    month_pnl    = EXCLUDED.month_pnl,
    updated_at   = now();

  -- ─── Open MT5 Trades ─────────────────────────────────────────────────────
  INSERT INTO mt5_trades (
    ticket, symbol, type, volume, open_price, current_price,
    profit, open_time, sl, tp, account_id, user_id
  ) VALUES
    (100847, 'EURUSD', 'buy',  0.30, 1.0812, 1.0841,  87.00, now() - interval '4 hours', 1.0780, 1.0960, '100023891', uid),
    (100851, 'XAUUSD', 'buy',  0.10, 2318.5, 2324.1,  56.00, now() - interval '2 hours', 2295.0, 2360.0, '100023891', uid),
    (100855, 'GBPUSD', 'sell', 0.20, 1.2680, 1.2651,  58.00, now() - interval '1 hour',  1.2720, 1.2580, '100023891', uid)
  ON CONFLICT (ticket) DO UPDATE SET
    current_price = EXCLUDED.current_price,
    profit        = EXCLUDED.profit;

  -- ─── All 10 Jobs (clean + re-insert) ─────────────────────────────────────
  DELETE FROM ops_jobs WHERE user_id = uid;

  INSERT INTO ops_jobs (
    id, name, category, status,
    daily_profit, monthly_profit, projected_monthly,
    synergy_score, risk_score, roi,
    cash_out_url, clone_url, created_at, last_activity, user_id
  ) VALUES
    ('j01','AI UGC Factory',           'ai-ugc',    'active',  1240,37200,42000, 92,22,480, null,null,'2025-11-01',now(),uid),
    ('j02','Liquidity Sniper (MT5)',    'trading',   'active',   842,25260,28000, 88,45,310, null,null,'2025-09-15',now(),uid),
    ('j03','Vibe-Code Website Agency',  'dev',       'active',   620,18600,22000, 74,18,240, null,null,'2025-12-01',now(),uid),
    ('j04','Polymarket Edge Desk',      'trading',   'active',   510,15300,18500, 85,38,195, null,null,'2026-01-10',now(),uid),
    ('j05','AI Lead-to-Cash Funnel',    'agency',    'active',   490,14700,19000, 80,15,320, null,null,'2026-02-01',now(),uid),
    ('j06','Crypto Wallet Yield Stack', 'crypto',    'active',   380,11400,13000, 65,55,140, null,null,'2025-10-20',now(),uid),
    ('j07','SEO Content Swarm',         'content',   'scaling',  290, 8700,14000, 70,12,190, null,null,'2026-01-01',now(),uid),
    ('j08','Cross-Market Arb Bridge',   'arbitrage', 'active',   260, 7800,11000, 91,30,210, null,null,'2026-02-15',now(),uid),
    ('j09','AI Consulting Retainers',   'consulting','active',   200, 6000, 8000, 60,10,600, null,null,'2025-08-01',now(),uid),
    ('j10','Auto-Distribution + SEO',   'content',   'scaling',  180, 5400, 9000, 68, 8,150, null,null,'2026-01-20',now(),uid);

  -- ─── Auto Tasks ──────────────────────────────────────────────────────────
  DELETE FROM auto_tasks WHERE user_id = uid;

  INSERT INTO auto_tasks (job_id, title, priority, status, assigned_to, user_id) VALUES
    ('j01','Launch 3 new UGC ad creatives (Arcads)',           'high',    'in_progress','ai',uid),
    ('j01','A/B test Kling video variants — pick winner',      'medium',  'pending',    'ai',uid),
    ('j01','Upload top 5 creatives to TikTok Ads',             'medium',  'pending',    'ai',uid),
    ('j02','Optimize XAUUSD Kelly fraction (risk elevated)',   'critical','pending',    'ai',uid),
    ('j02','Review overnight news risk filter settings',       'high',    'pending',    'ai',uid),
    ('j03','Deliver RevolutionFit.com build to client',        'critical','in_progress','ai',uid),
    ('j03','Upsell SEO package to 3 existing clients',         'high',    'pending',    'ai',uid),
    ('j04','Hedge Fed rate cut position via EURUSD buy',       'critical','pending',    'ai',uid),
    ('j04','Close POTUS approval market — +$340 locked',       'high',    'pending',    'ai',uid),
    ('j05','Send qualified proposal to BrightEdge LLC',        'high',    'pending',    'ai',uid),
    ('j05','Follow up with 4 pending leads (>72hr stale)',     'medium',  'pending',    'ai',uid),
    ('j06','Rebalance stETH/USDC LP ratio to 60/40',           'high',    'pending',    'ai',uid),
    ('j07','Publish 20 AI-generated articles this week',       'high',    'in_progress','ai',uid),
    ('j08','Execute BTC/Poly synthetic arb (3.2% edge)',       'critical','pending',    'ai',uid),
    ('j09','Deliver Meridian Tech monthly AI report',          'high',    'pending',    'ai',uid),
    ('j10','Distribute last week content to 14 platforms',     'medium',  'pending',    'ai',uid);

  -- ─── Tax Pot ─────────────────────────────────────────────────────────────
  INSERT INTO tax_pot (
    balance, target_rate, quarterly_estimate, next_due_date,
    ytd_income, ytd_set_aside, projected_tax_bill, user_id
  ) VALUES (
    28400, 32, 18200, '2026-06-15', 89000, 28480, 26800, uid
  ) ON CONFLICT (user_id) DO UPDATE SET
    balance            = EXCLUDED.balance,
    ytd_income         = EXCLUDED.ytd_income,
    ytd_set_aside      = EXCLUDED.ytd_set_aside,
    quarterly_estimate = EXCLUDED.quarterly_estimate,
    updated_at         = now();

  -- ─── Tax Entries ─────────────────────────────────────────────────────────
  DELETE FROM tax_entries WHERE user_id = uid;

  INSERT INTO tax_entries (
    date, amount, description, category, source, deductible, tax_pot_contribution, user_id
  ) VALUES
    (CURRENT_DATE-1,  37200,'AI UGC Factory — April revenue',      'income',    'j01',false,11904,uid),
    (CURRENT_DATE-1,  25260,'Liquidity Sniper — MT5 profits',      'income',    'j02',false, 8083,uid),
    (CURRENT_DATE-2,  18600,'Vibe-Code Agency — client payments',  'income',    'j03',false, 5952,uid),
    (CURRENT_DATE-2,  -1240,'Arcads subscription — UGC platform',  'software',  'j01',true,     0,uid),
    (CURRENT_DATE-3,  15300,'Polymarket Edge — March settlements', 'income',    'j04',false, 4896,uid),
    (CURRENT_DATE-3,   -890,'AWS hosting + CloudFlare CDN',        'software',  'j07',true,     0,uid),
    (CURRENT_DATE-5,  14700,'Funnel Agent — client retainers',     'income',    'j05',false, 4704,uid),
    (CURRENT_DATE-7,  -2100,'Contractor payment — dev help',       'contractor','j03',true,     0,uid),
    (CURRENT_DATE-10, 11400,'Crypto Yield — stETH rewards',        'income',    'j06',false, 3648,uid),
    (CURRENT_DATE-14, -3400,'Paid ads spend — Meta + Google',      'marketing', 'j01',true,     0,uid);

  -- ─── Leads ───────────────────────────────────────────────────────────────
  DELETE FROM leads WHERE user_id = uid;

  INSERT INTO leads (name, email, company, source, score, stage, estimated_value, last_contact, user_id) VALUES
    ('BrightEdge LLC',   'sarah@brightedge.io',    'BrightEdge LLC',   'LinkedIn',  88,'proposal',   12000,now()-interval '6 hours',uid),
    ('Meridian Capital', 'cfo@meridiancap.com',    'Meridian Capital', 'Referral',  94,'negotiation', 35000,now()-interval '1 hour', uid),
    ('Apex Brands',      'marketing@apexbrands.co','Apex Brands',      'Cold email',72,'qualified',    8500,now()-interval '2 days', uid),
    ('TechFlow Ventures','ops@techflow.vc',         'TechFlow Ventures','LinkedIn',  81,'new',         22000,now()-interval '3 hours',uid),
    ('Nova Digital',     'cmo@novadigital.io',      'Nova Digital',     'Inbound',   67,'qualified',    6800,now()-interval '1 day', uid);

  -- ─── Daily Briefing ──────────────────────────────────────────────────────
  DELETE FROM daily_briefings WHERE user_id = uid AND date = CURRENT_DATE;

  INSERT INTO daily_briefings (
    date, summary, top_priorities, alerts,
    pnl_mt5, pnl_poly, pnl_total, user_id
  ) VALUES (
    CURRENT_DATE,
    'Strong session. MT5 +$842 today — EURUSD, XAUUSD, GBPUSD positions live and profitable. Polymarket Fed position in profit (+$1,240). BrightEdge proposal ready to send ($12K deal). Tax pot 32% funded — Q2 estimate $18,200 due June 15. Top action: execute BTC/Poly synthetic arb (3.2% edge, window open). Cross-market arbitrage signal detected via EdgeHarmonizer.',
    ARRAY[
      'Execute BTC/Poly cross-market arb — 3.2% edge, window open now',
      'Send BrightEdge LLC proposal + Loom video (Funnel Agent ready)',
      'Optimize XAUUSD Kelly fraction — risk score elevated to 45',
      'Review Money Flow Optimizer tonight — rebalance 10 income streams'
    ],
    '[
      {"type":"opportunity","message":"Fed rate cut market: 4.1% edge vs MT5 implied 66% — buy YES now","urgency":"high"},
      {"type":"action","message":"Q2 tax estimate $18,200 due June 15 — tax pot funded 32%","urgency":"high"},
      {"type":"risk","message":"XAUUSD margin level approaching threshold — review Kelly fraction today","urgency":"critical"},
      {"type":"info","message":"Meridian Capital CFO responded — schedule negotiation call","urgency":"low"}
    ]'::jsonb,
    842, 1240, 2082, uid
  );

  -- ─── Synergy Links ───────────────────────────────────────────────────────
  DELETE FROM synergy_links WHERE user_id = uid;

  INSERT INTO synergy_links (job_a, job_b, synergy_type, value, description, active, user_id) VALUES
    ('j02','j04','hedge',   3200,'MT5 Liquidity Sniper auto-hedges Polymarket macro positions',     true,uid),
    ('j01','j07','content', 1800,'UGC Factory content feeds SEO Swarm — 40% production cost cut',  true,uid),
    ('j03','j05','funnel',  2400,'Vibe-Code sites become lead-gen landing pages for Funnel Agent',  true,uid),
    ('j08','j06','capital', 1100,'Arb Bridge profits auto-routed into Crypto Yield Stack',           true,uid),
    ('j01','j05','upsell',  1600,'UGC creatives used in Funnel proposals — 28% higher close rate',  true,uid),
    ('j04','j08','signal',  2800,'Polymarket signal feeds Arb Bridge — 94% correlation on macro',   true,uid);

  -- ─── Monte Carlo Results ─────────────────────────────────────────────────
  DELETE FROM montecarlo_results WHERE user_id = uid;

  INSERT INTO montecarlo_results (scenario, p10, p25, p50, p75, p90, max_drawdown, sharpe, runs, user_id) VALUES
    ('Base Case',     95000, 118000, 142000, 168000, 195000, 12.4, 2.1, 1000, uid),
    ('Bull Market',  140000, 175000, 210000, 248000, 290000,  8.2, 3.2, 1000, uid),
    ('Bear + Crisis', 42000,  58000,  74000,  92000, 112000, 28.6, 0.9, 1000, uid);

  -- ─── Allocation Rules ────────────────────────────────────────────────────
  DELETE FROM allocation_rules WHERE user_id = uid;

  INSERT INTO allocation_rules (job_id, job_name, current_allocation, recommended_allocation, expected_return, constraint, user_id) VALUES
    ('j01','AI UGC Factory',       20,25,480,'max_30pct',   uid),
    ('j02','Liquidity Sniper',     22,20,310,'kelly_capped', uid),
    ('j04','Polymarket Edge Desk', 15,18,195,'max_20pct',   uid),
    ('j03','Vibe-Code Agency',     18,15,240,'none',        uid),
    ('j08','Cross-Market Arb',     10,12,210,'none',        uid),
    ('j07','SEO Content Swarm',     8,10,190,'none',        uid);

  -- ─── Polymarket Markets Cache ────────────────────────────────────────────
  DELETE FROM poly_markets WHERE true;

  INSERT INTO poly_markets (id, question, slug, end_date, volume, liquidity, outcomes, category, active) VALUES
    ('pm001','Will the Fed cut rates in Q2 2026?',
     'fed-rate-cut-q2-2026','2026-06-30',8420000,2100000,
     '[{"name":"YES","price":0.62,"clobTokenId":"0xabc001"},{"name":"NO","price":0.38,"clobTokenId":"0xabc002"}]'::jsonb,
     'economics',true),
    ('pm002','Will Bitcoin exceed $100K before July 2026?',
     'btc-100k-july-2026','2026-07-01',12800000,3400000,
     '[{"name":"YES","price":0.51,"clobTokenId":"0xabc003"},{"name":"NO","price":0.49,"clobTokenId":"0xabc004"}]'::jsonb,
     'crypto',true),
    ('pm003','Will Trump approve a crypto reserve bill in 2026?',
     'trump-crypto-reserve-2026','2026-12-31',5600000,1200000,
     '[{"name":"YES","price":0.44,"clobTokenId":"0xabc005"},{"name":"NO","price":0.56,"clobTokenId":"0xabc006"}]'::jsonb,
     'politics',true),
    ('pm004','S&P 500 above 6,000 end of Q2 2026?',
     'sp500-6000-q2-2026','2026-06-30',4200000,980000,
     '[{"name":"YES","price":0.71,"clobTokenId":"0xabc007"},{"name":"NO","price":0.29,"clobTokenId":"0xabc008"}]'::jsonb,
     'finance',true),
    ('pm005','Will ETH flip BTC market cap in 2026?',
     'eth-flip-btc-2026','2026-12-31',2900000,640000,
     '[{"name":"YES","price":0.08,"clobTokenId":"0xabc009"},{"name":"NO","price":0.92,"clobTokenId":"0xabc010"}]'::jsonb,
     'crypto',true);

  -- ─── Polymarket Positions ────────────────────────────────────────────────
  DELETE FROM poly_positions WHERE user_id = uid;

  INSERT INTO poly_positions (market_id, question, outcome, shares, avg_price, current_price, unrealized_pnl, user_id) VALUES
    ('pm001','Will the Fed cut rates in Q2 2026?',          'YES',2000,0.58,0.62, 80.00,uid),
    ('pm002','Will Bitcoin exceed $100K before July 2026?', 'YES', 500,0.47,0.51, 20.00,uid),
    ('pm004','S&P 500 above 6,000 end of Q2 2026?',         'YES',1200,0.68,0.71, 36.00,uid);

  -- ─── Arbitrage Signals ───────────────────────────────────────────────────
  DELETE FROM arbitrage_signals WHERE user_id = uid;

  INSERT INTO arbitrage_signals (
    type, description, expected_edge, confidence,
    required_capital, time_to_expiry, status,
    mt5_symbol, polymarket_id, user_id
  ) VALUES
    ('polymarket-mt5','Fed rate cut YES@62¢ vs EURUSD implied 66% — buy mismatch', 4.1,87,5000,21600,'live','EURUSD','pm001',uid),
    ('cross-market',  'BTC/Poly synthetic: long BTC spot + short Poly NO@49¢',     3.2,79,8000,18000,'live','BTCUSD','pm002',uid),
    ('synthetic',     'S&P YES@71¢ vs ES futures — close when spread compresses',   1.8,65,3000,43200,'live','US500', 'pm004',uid);

  RAISE NOTICE 'Seed complete! 10 jobs, 16 tasks, tax pot, 10 tax entries, 5 leads, briefing, 6 synergies, 3 MC scenarios, 6 allocations, 5 poly markets, 3 positions, 3 arb signals seeded for user %', uid;

END $$;
