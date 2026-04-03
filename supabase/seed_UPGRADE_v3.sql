-- ============================================================
-- LUMINA OPS HUB — UPGRADE SEED v3
-- Applies post-research upgrades to all 10 jobs
--
-- Sources:
--   Post 1: AI Customer Acquisition ($3-5K/client niche agency)
--   Post 2: 20 Free AI Courses (skill → income mapping)
--   Post 3: Polymarket Claude Script ($5 → $5.5M automated)
--   Post 4: Edge-Entry Strategy (buy at 10¢, 52% WR = $22K/3 days)
--   Post 5: Multi-Agent Orchestration (UltraPlan, parallel workers)
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

DO $$
DECLARE
  uid UUID := NULL;
BEGIN
  IF uid IS NULL THEN
    SELECT id INTO uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user found. Paste your UUID at line 17.';
  END IF;

  RAISE NOTICE 'Upgrading jobs for user: %', uid;

  -- ════════════════════════════════════════════════════════════════════════
  -- UPGRADE ALL 10 JOBS (preserve IDs, update strategy + projected revenue)
  -- ════════════════════════════════════════════════════════════════════════

  -- Job 1: AI UGC Factory → UPGRADED: Niche Client Ad Pack Engine
  -- Post 1 insight: charge $3-5K/mo per niche client, 30-day ad packs
  UPDATE ops_jobs SET
    name = 'AI UGC Factory + Client Ad Packs',
    daily_profit = 1580,
    monthly_profit = 47400,
    projected_monthly = 55000,
    synergy_score = 95,
    roi = 560,
    last_activity = now()
  WHERE id = 'j01' AND user_id = uid;

  -- Job 2: Liquidity Sniper → No direct post upgrade, but benefits from multi-agent
  UPDATE ops_jobs SET
    daily_profit = 920,
    monthly_profit = 27600,
    projected_monthly = 31000,
    last_activity = now()
  WHERE id = 'j02' AND user_id = uid;

  -- Job 3: Vibe-Code Agency → UPGRADED: Bundle with acquisition campaigns
  -- Post 1 insight: sites become lead-gen + acquisition funnels, not just builds
  UPDATE ops_jobs SET
    name = 'Vibe-Code Agency + Acquisition Funnels',
    daily_profit = 780,
    monthly_profit = 23400,
    projected_monthly = 28000,
    synergy_score = 82,
    roi = 310,
    last_activity = now()
  WHERE id = 'j03' AND user_id = uid;

  -- Job 4: Polymarket Edge Desk → UPGRADED: Claude Script Trader + Edge-Entry
  -- Post 3: automate with Claude script, Post 4: buy at 10¢ with AI confidence
  UPDATE ops_jobs SET
    name = 'Polymarket Script Trader + Edge-Entry',
    daily_profit = 1200,
    monthly_profit = 36000,
    projected_monthly = 48000,
    synergy_score = 93,
    risk_score = 35,
    roi = 420,
    last_activity = now()
  WHERE id = 'j04' AND user_id = uid;

  -- Job 5: AI Lead-to-Cash Funnel → UPGRADED: Full Client Acquisition Agency
  -- Post 1: sell customers, not proposals. Measurable acquisition per week.
  UPDATE ops_jobs SET
    name = 'AI Client Acquisition Funnel',
    daily_profit = 720,
    monthly_profit = 21600,
    projected_monthly = 30000,
    synergy_score = 88,
    roi = 440,
    last_activity = now()
  WHERE id = 'j05' AND user_id = uid;

  -- Job 6: Crypto Wallet Yield Stack → Pair with arb profits (Post 4)
  UPDATE ops_jobs SET
    daily_profit = 420,
    monthly_profit = 12600,
    projected_monthly = 15000,
    last_activity = now()
  WHERE id = 'j06' AND user_id = uid;

  -- Job 7: SEO Content Swarm → UPGRADED: Multi-Agent Content Pipeline
  -- Post 5: parallelize with agent fleet, 5x throughput
  UPDATE ops_jobs SET
    name = 'SEO Content Swarm (Multi-Agent)',
    daily_profit = 440,
    monthly_profit = 13200,
    projected_monthly = 20000,
    synergy_score = 78,
    roi = 280,
    last_activity = now()
  WHERE id = 'j07' AND user_id = uid;

  -- Job 8: Cross-Market Arb Bridge → UPGRADED: Poly Edge + MT5 Hedged Arb
  -- Post 4: pair 10¢ Polymarket entries with MT5 inverse positions
  UPDATE ops_jobs SET
    name = 'Cross-Market Arb + Edge-Entry Hedge',
    daily_profit = 480,
    monthly_profit = 14400,
    projected_monthly = 20000,
    synergy_score = 94,
    risk_score = 25,
    roi = 320,
    last_activity = now()
  WHERE id = 'j08' AND user_id = uid;

  -- Job 9: AI Consulting → UPGRADED: Premium multi-agent + course curation
  -- Post 2: package AI course paths for clients. Post 5: sell agent setups.
  UPDATE ops_jobs SET
    name = 'AI Consulting + Agent-as-a-Service',
    daily_profit = 340,
    monthly_profit = 10200,
    projected_monthly = 15000,
    synergy_score = 72,
    roi = 750,
    last_activity = now()
  WHERE id = 'j09' AND user_id = uid;

  -- Job 10: Auto-Distribution → UPGRADED: AI-powered multi-platform blast
  -- Post 5: multi-agent distributes to 14+ platforms simultaneously
  UPDATE ops_jobs SET
    name = 'Auto-Distribution Swarm + SEO',
    daily_profit = 280,
    monthly_profit = 8400,
    projected_monthly = 14000,
    synergy_score = 75,
    roi = 220,
    last_activity = now()
  WHERE id = 'j10' AND user_id = uid;

  -- ════════════════════════════════════════════════════════════════════════
  -- NEW TASKS — Revenue-generating actions from post insights
  -- ════════════════════════════════════════════════════════════════════════
  DELETE FROM auto_tasks WHERE user_id = uid;

  INSERT INTO auto_tasks (job_id, title, priority, status, assigned_to, user_id) VALUES

    -- J01: AI UGC Factory + Client Ad Packs
    ('j01','Build 30-day short-form ad pack for DentalBright (niche: dentistry, $4K/mo)',    'critical','pending','ai',uid),
    ('j01','Onboard FitCore Gym as ad-pack client #6 — send pricing deck + sample reel',     'high',    'pending','ai',uid),
    ('j01','A/B test 5 Kling video hooks — pick top CTR for MedSpa client campaign',         'high',    'in_progress','ai',uid),
    ('j01','Track weekly customer acquisition for all 5 active ad-pack clients — report due', 'medium',  'pending','ai',uid),

    -- J02: Liquidity Sniper (MT5)
    ('j02','Optimize XAUUSD Kelly fraction — risk elevated, reduce exposure 15%',            'critical','pending','ai',uid),
    ('j02','Deploy multi-agent news filter: Agent Delta scans 12 feeds, flags risk events',  'high',    'pending','ai',uid),
    ('j02','Review overnight session — lock profits on GBPUSD if +$80 target hit',          'medium',  'pending','ai',uid),

    -- J03: Vibe-Code Agency + Acquisition Funnels
    ('j03','Deliver RevolutionFit.com + bolt on acquisition funnel (retargeting pixel + CTA)','critical','in_progress','ai',uid),
    ('j03','Upsell 3 existing site clients to $3K/mo acquisition bundle (ads + tracking)',   'high',    'pending','ai',uid),
    ('j03','Build landing page template for niche onboarding (dentists, gyms, med spas)',    'medium',  'pending','ai',uid),

    -- J04: Polymarket Script Trader + Edge-Entry
    ('j04','Deploy Claude Sonnet script — scan all markets for contracts ≤10¢ with >70% AI confidence','critical','pending','ai',uid),
    ('j04','Enable copy-trading @swisstony positions with 0.5x stake multiplier',            'critical','pending','ai',uid),
    ('j04','Execute edge-entry: "Fed rate cut Q2" YES at 10¢ (AI confidence 78%, EV +$0.68)','high',    'pending','ai',uid),
    ('j04','Backtest 30-day edge-entry results: $500 start → track actual vs projected growth','medium', 'pending','ai',uid),

    -- J05: AI Client Acquisition Funnel
    ('j05','Send BrightEdge proposal — reframe as customer acquisition ($4K/mo retainer)',   'high',    'pending','ai',uid),
    ('j05','Follow up 4 stale leads — pitch: "we deliver customers, not content"',           'high',    'pending','ai',uid),
    ('j05','Build Loom walkthrough showing client #3 weekly acquisition numbers (12 customers/wk)','medium','pending','ai',uid),
    ('j05','Launch cold outreach to 20 med spas — use Claude research for personalization',  'medium',  'pending','ai',uid),

    -- J06: Crypto Wallet Yield Stack
    ('j06','Rebalance stETH/USDC LP to 60/40 — route arb profits from j08 into yield',      'high',    'pending','ai',uid),
    ('j06','Evaluate Aave v4 stablecoin pool — 11.2% APY, $1B+ TVL (low risk)',             'medium',  'pending','ai',uid),

    -- J07: SEO Content Swarm (Multi-Agent)
    ('j07','Launch 3-agent parallel pipeline: Agent Beta writes, Alpha researches, Delta analyzes', 'critical','pending','ai',uid),
    ('j07','Publish blog-site Article 3 (passive income) — deploy via GitHub Pages',         'high',    'in_progress','ai',uid),
    ('j07','Generate 20 articles this week using agent fleet (target: 4/agent/day)',          'high',    'pending','ai',uid),
    ('j07','Submit sitemap to Google Search Console — begin indexing all 3 cornerstone articles','medium','pending','ai',uid),

    -- J08: Cross-Market Arb + Edge-Entry Hedge
    ('j08','Execute BTC/Poly synthetic arb: long BTC spot + short Poly NO @ 49¢ (3.2% edge)','critical','pending','ai',uid),
    ('j08','Pair Polymarket 10¢ entries with inverse MT5 positions for hedged profit',        'high',    'pending','ai',uid),
    ('j08','Monitor Fed rate spread: if Poly YES drops below 55¢, increase MT5 EURUSD buy',  'medium',  'pending','ai',uid),

    -- J09: AI Consulting + Agent-as-a-Service
    ('j09','Deliver Meridian Tech monthly AI report — include agent fleet ROI dashboard',     'high',    'pending','ai',uid),
    ('j09','Package "AI Upskill Path" for consulting clients (curate 20 free courses, Post 2)','high',  'pending','ai',uid),
    ('j09','Pitch Meridian Capital: $8K/mo agent-as-a-service (6 parallel Claude agents)',    'high',    'pending','ai',uid),
    ('j09','Build case study: "How our agent fleet saves 47 hours/week" — use in proposals',  'medium',  'pending','ai',uid),

    -- J10: Auto-Distribution Swarm + SEO
    ('j10','Multi-agent blast: distribute 3 blog articles to 14 platforms simultaneously',    'high',    'pending','ai',uid),
    ('j10','Set up automated weekly distribution schedule — Agent Epsilon handles scheduling', 'medium',  'pending','ai',uid),
    ('j10','Optimize top 3 performing articles for featured snippets (schema + FAQ markup)',   'medium',  'pending','ai',uid);

  -- ════════════════════════════════════════════════════════════════════════
  -- UPGRADED DAILY BRIEFING — Revenue-focused action items
  -- ════════════════════════════════════════════════════════════════════════
  DELETE FROM daily_briefings WHERE user_id = uid AND date = CURRENT_DATE;

  INSERT INTO daily_briefings (
    date, summary, top_priorities, alerts,
    pnl_mt5, pnl_poly, pnl_total, user_id
  ) VALUES (
    CURRENT_DATE,
    'UPGRADED STRATEGY LIVE. Post insights applied to all 10 jobs. Projected monthly revenue now $276K (up from $150K). Key moves today: (1) Deploy Polymarket Claude script — edge-entry scanner targeting ≤10¢ contracts with >70% AI confidence. @swisstony copy-trading enabled. (2) Onboard FitCore Gym as ad-pack client #6 at $4K/mo. (3) Execute BTC/Poly synthetic arb — 3.2% edge window open NOW. (4) Launch 3-agent content pipeline for SEO Swarm — 20 articles this week. (5) Reframe all funnel proposals as "customer acquisition" not "content" — Post 1 insight. MT5 +$920 today. Total daily: $7,160 across 10 jobs.',
    ARRAY[
      'DEPLOY Polymarket Claude script — edge-entry scanner, buy contracts ≤10¢, >70% AI confidence [Post 3+4]',
      'EXECUTE BTC/Poly synthetic arb — 3.2% edge, hedged via MT5 BTCUSD position [Post 4]',
      'ONBOARD FitCore Gym — ad-pack client #6, $4K/mo recurring, 30-day content pack [Post 1]',
      'LAUNCH 3-agent SEO pipeline — target 20 articles this week, 5x previous throughput [Post 5]',
      'PITCH Meridian Capital — $8K/mo Agent-as-a-Service package [Post 5]',
      'REFRAME all proposals: sell CUSTOMERS not content — track weekly acquisition numbers [Post 1]'
    ],
    '[
      {"type":"opportunity","message":"Polymarket edge-entry: 3 markets have contracts ≤10¢ with AI confidence >70% — expected value +$0.60-0.68 per contract","urgency":"critical"},
      {"type":"opportunity","message":"FitCore Gym ready to sign — $4K/mo ad-pack retainer, 30-day content calendar prepped","urgency":"high"},
      {"type":"opportunity","message":"Meridian Capital CFO responded — pitch $8K/mo agent fleet package at call today","urgency":"high"},
      {"type":"action","message":"Deploy Claude script for automated Polymarket execution — @swisstony copy-trading at 0.5x","urgency":"critical"},
      {"type":"action","message":"Launch multi-agent content pipeline — 3 agents parallel, 4 articles/agent/day target","urgency":"high"},
      {"type":"risk","message":"XAUUSD margin approaching threshold — reduce Kelly fraction 15%, set trailing stop","urgency":"critical"},
      {"type":"info","message":"Q2 tax estimate $18,200 due June 15 — tax pot 32% funded, auto-allocation active","urgency":"low"}
    ]'::jsonb,
    920, 1200, 2120, uid
  );

  -- ════════════════════════════════════════════════════════════════════════
  -- NEW SYNERGY LINKS (discovered from post cross-referencing)
  -- ════════════════════════════════════════════════════════════════════════
  DELETE FROM synergy_links WHERE user_id = uid;

  INSERT INTO synergy_links (job_a, job_b, synergy_type, value, description, active, user_id) VALUES
    -- Existing synergies (kept)
    ('j02','j04','hedge',   4200,'MT5 Sniper auto-hedges Polymarket script positions — edge-entry amplified',true,uid),
    ('j01','j07','content', 2400,'UGC ad-pack creatives feed SEO Swarm — 40% cost cut + multi-agent distribution',true,uid),
    ('j03','j05','funnel',  3600,'Vibe-Code sites are acquisition funnels for Client Funnel — bundled at $7K/mo',true,uid),
    ('j08','j06','capital', 1800,'Arb Bridge profits auto-routed into Crypto Yield Stack compound',true,uid),
    ('j01','j05','upsell',  2800,'UGC ad-packs bundled with acquisition funnel — 35% higher close rate',true,uid),
    ('j04','j08','signal',  4500,'Polymarket edge-entry signals feed Arb Bridge — 10¢ contracts hedged via MT5',true,uid),
    -- NEW synergies from post insights
    ('j04','j02','script',  3200,'Claude script (Post 3) signals shared with MT5 Sniper for macro hedging',true,uid),
    ('j01','j03','bundle',  3400,'30-day ad packs (Post 1) paired with Vibe-Code landing pages = $7K bundle',true,uid),
    ('j09','j07','education',1600,'AI course curation (Post 2) feeds consulting clients + boosts SEO authority',true,uid),
    ('j07','j10','pipeline', 2200,'Multi-agent content (Post 5) auto-distributed to 14 platforms by Agent Epsilon',true,uid);

  -- ════════════════════════════════════════════════════════════════════════
  -- UPGRADED POLYMARKET — Add edge-entry positions (Post 3+4 strategy)
  -- ════════════════════════════════════════════════════════════════════════

  -- Add new low-entry markets for edge-entry strategy
  INSERT INTO poly_markets (id, question, slug, end_date, volume, liquidity, outcomes, category, active) VALUES
    ('pm006','Will Ethereum ETF be approved in Q2 2026?',
     'eth-etf-q2-2026','2026-06-30',3200000,780000,
     '[{"name":"YES","price":0.09,"clobTokenId":"0xabc011"},{"name":"NO","price":0.91,"clobTokenId":"0xabc012"}]'::jsonb,
     'crypto',true),
    ('pm007','Will US enter recession before July 2026?',
     'us-recession-july-2026','2026-07-01',4800000,1100000,
     '[{"name":"YES","price":0.12,"clobTokenId":"0xabc013"},{"name":"NO","price":0.88,"clobTokenId":"0xabc014"}]'::jsonb,
     'economics',true),
    ('pm008','Will AI regulation bill pass US Senate in 2026?',
     'ai-regulation-senate-2026','2026-12-31',2100000,420000,
     '[{"name":"YES","price":0.07,"clobTokenId":"0xabc015"},{"name":"NO","price":0.93,"clobTokenId":"0xabc016"}]'::jsonb,
     'politics',true)
  ON CONFLICT (id) DO UPDATE SET
    outcomes = EXCLUDED.outcomes,
    volume = EXCLUDED.volume;

  -- Add edge-entry positions (buying cheap contracts with high AI confidence)
  INSERT INTO poly_positions (market_id, question, outcome, shares, avg_price, current_price, unrealized_pnl, user_id) VALUES
    ('pm006','Will Ethereum ETF be approved in Q2 2026?',  'YES',5000,0.09,0.09,  0.00,uid),
    ('pm007','Will US enter recession before July 2026?',   'YES',3000,0.12,0.12,  0.00,uid),
    ('pm005','Will ETH flip BTC market cap in 2026?',       'YES',8000,0.08,0.08,  0.00,uid)
  ON CONFLICT (market_id, user_id) DO UPDATE SET
    shares = EXCLUDED.shares,
    avg_price = EXCLUDED.avg_price;

  -- ════════════════════════════════════════════════════════════════════════
  -- UPGRADED ARB SIGNALS — Edge-entry + hedged positions
  -- ════════════════════════════════════════════════════════════════════════
  DELETE FROM arbitrage_signals WHERE user_id = uid;

  INSERT INTO arbitrage_signals (
    type, description, expected_edge, confidence,
    required_capital, time_to_expiry, status,
    mt5_symbol, polymarket_id, user_id
  ) VALUES
    ('polymarket-mt5','Fed rate cut YES@62¢ vs EURUSD implied 66% — buy mismatch',           4.1,87,5000,21600,'live','EURUSD','pm001',uid),
    ('cross-market',  'BTC/Poly synthetic: long BTC spot + short Poly NO@49¢ (Post 4 edge)', 3.2,79,8000,18000,'live','BTCUSD','pm002',uid),
    ('synthetic',     'ETH ETF YES@9¢ — AI confidence 72%, EV +$0.63 per contract [EDGE-ENTRY]', 63.0,72,450,86400,'live',null,'pm006',uid),
    ('synthetic',     'Recession YES@12¢ — AI confidence 68%, EV +$0.56 per contract [EDGE-ENTRY]',56.0,68,360,86400,'live','US500','pm007',uid),
    ('synthetic',     'ETH flip BTC YES@8¢ — AI confidence 15%, long-shot hedge, EV +$0.07',  7.0,15,640,259200,'live','ETHUSD','pm005',uid);

  -- ════════════════════════════════════════════════════════════════════════
  -- UPDATED ALLOCATION RULES — Shift capital to highest-edge strategies
  -- ════════════════════════════════════════════════════════════════════════
  DELETE FROM allocation_rules WHERE user_id = uid;

  INSERT INTO allocation_rules (job_id, job_name, current_allocation, recommended_allocation, expected_return, constraint, user_id) VALUES
    ('j01','AI UGC + Ad Packs',         20, 22, 560,'max_25pct',    uid),
    ('j04','Polymarket Script Trader',   15, 22, 420,'edge_entry',   uid),
    ('j02','Liquidity Sniper',           22, 18, 310,'kelly_capped', uid),
    ('j03','Vibe-Code + Acquisition',    18, 14, 310,'none',         uid),
    ('j05','Client Acquisition Funnel',  10, 12, 440,'none',         uid),
    ('j08','Cross-Market Arb + Edge',    10, 12, 320,'hedged',       uid);

  RAISE NOTICE '
  ═══════════════════════════════════════════════════════════════
  UPGRADE v3 COMPLETE
  ═══════════════════════════════════════════════════════════════
  10 jobs upgraded with post insights
  35 revenue-focused tasks deployed
  10 synergy links (4 new from post cross-referencing)
  8 Polymarket markets (3 new edge-entry targets)
  6 positions (3 new edge-entry at ≤12¢)
  5 arb signals (2 new edge-entry with 56-63%% expected value)
  6 allocation rules shifted toward highest-edge strategies
  Daily briefing updated with 6 priority actions

  PROJECTED MONTHLY REVENUE: $276,000 (up from $150,360)
  NEW DAILY RUN RATE: $7,160
  ═══════════════════════════════════════════════════════════════
  ';

END $$;
