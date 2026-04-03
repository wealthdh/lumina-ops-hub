-- ══════════════════════════════════════════════════════════════════════════════
-- LUMINA OPS HUB — FIX_ALL.sql
-- Run this ONCE in Supabase Dashboard → SQL Editor → Run All
-- Fixes every broken table, RPC, and missing column that blocks withdrawals.
-- Safe to run multiple times (all CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Fix cashout_transactions — add all missing columns ─────────────────────

CREATE TABLE IF NOT EXISTS cashout_transactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  method              TEXT        NOT NULL DEFAULT 'crypto',
  amount              NUMERIC(12,2),
  status              TEXT        NOT NULL DEFAULT 'pending',
  tx_id               TEXT,
  job_id              TEXT,
  network             TEXT,
  to_address          TEXT,
  error_msg           TEXT,
  idempotency_key     TEXT        UNIQUE,
  server_balance      NUMERIC(12,2),
  daily_total_at_req  NUMERIC(12,2),
  hot_wallet_warned   BOOLEAN     DEFAULT false,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cashout_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key    TEXT        UNIQUE,
  ADD COLUMN IF NOT EXISTS server_balance     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS daily_total_at_req NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS hot_wallet_warned  BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata           JSONB;

-- Fix status constraint to include all used values
ALTER TABLE cashout_transactions DROP CONSTRAINT IF EXISTS cashout_transactions_status_check;
ALTER TABLE cashout_transactions ADD CONSTRAINT cashout_transactions_status_check
  CHECK (status IN ('pending','processing','completed','failed','needs_approval'));

ALTER TABLE cashout_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cashout_transactions' AND policyname = 'Users own cashout_transactions fix') THEN
    CREATE POLICY "Users own cashout_transactions fix"
      ON cashout_transactions FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 2. Create cashout_2fa_codes table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cashout_2fa_codes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash        TEXT        NOT NULL,
  idempotency_key  TEXT        NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used             BOOLEAN     NOT NULL DEFAULT false,
  attempts         INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_2fa_user_key
  ON cashout_2fa_codes(user_id, idempotency_key)
  WHERE used = false;

ALTER TABLE cashout_2fa_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cashout_2fa_codes' AND policyname = 'Users own 2fa codes') THEN
    CREATE POLICY "Users own 2fa codes"
      ON cashout_2fa_codes FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 3. Create cashout_approvals table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cashout_approvals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  method         TEXT        NOT NULL,
  job_id         TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','approved','rejected','expired')),
  reason         TEXT        NOT NULL DEFAULT '',
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cashout_approvals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cashout_approvals' AND policyname = 'Users own approvals') THEN
    CREATE POLICY "Users own approvals"
      ON cashout_approvals FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 4. Create income_entries table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS income_entries (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       TEXT          NOT NULL,
  source       TEXT          NOT NULL DEFAULT 'manual',
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description  TEXT,
  reference_id TEXT,
  entry_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_income_user_date ON income_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_job       ON income_entries(job_id, entry_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_ref ON income_entries(reference_id) WHERE reference_id IS NOT NULL;

ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_entries' AND policyname = 'Users own income') THEN
    CREATE POLICY "Users own income"
      ON income_entries FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 5. THE THREE MISSING RPCs THAT BLOCK EVERY WITHDRAWAL ─────────────────────

-- 5a. get_available_balance: total income minus completed payouts
CREATE OR REPLACE FUNCTION get_available_balance(p_user_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT GREATEST(0,
    COALESCE((
      SELECT SUM(amount) FROM income_entries WHERE user_id = p_user_id
    ), 0)
    -
    COALESCE((
      SELECT SUM(amount) FROM cashout_transactions
      WHERE user_id = p_user_id
        AND status IN ('completed', 'processing', 'pending', 'needs_approval')
    ), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION get_available_balance TO authenticated;

-- 5b. get_daily_withdrawal_total: completed withdrawals today
CREATE OR REPLACE FUNCTION get_daily_withdrawal_total(p_user_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM cashout_transactions
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

GRANT EXECUTE ON FUNCTION get_daily_withdrawal_total TO authenticated;

-- 5c. get_daily_crypto_total: completed crypto withdrawals today
CREATE OR REPLACE FUNCTION get_daily_crypto_total(p_user_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM cashout_transactions
  WHERE user_id = p_user_id
    AND method = 'crypto'
    AND status = 'completed'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

GRANT EXECUTE ON FUNCTION get_daily_crypto_total TO authenticated;

-- ── 6. get_job_earnings_summary RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_job_earnings_summary(p_user_id UUID)
RETURNS TABLE(
  job_id         TEXT,
  today_total    NUMERIC,
  week_total     NUMERIC,
  month_total    NUMERIC,
  all_time_total NUMERIC,
  last_entry_at  DATE
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    job_id,
    COALESCE(SUM(amount) FILTER (WHERE entry_date = CURRENT_DATE),                            0),
    COALESCE(SUM(amount) FILTER (WHERE entry_date >= CURRENT_DATE - INTERVAL '7 days'),        0),
    COALESCE(SUM(amount) FILTER (WHERE entry_date >= date_trunc('month', CURRENT_DATE)::DATE), 0),
    COALESCE(SUM(amount), 0),
    MAX(entry_date)
  FROM income_entries
  WHERE user_id = p_user_id
  GROUP BY job_id;
$$;

GRANT EXECUTE ON FUNCTION get_job_earnings_summary TO authenticated;

-- ── 7. Ensure ops_jobs and auto_tasks exist ───────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_jobs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  category          TEXT        NOT NULL DEFAULT 'other',
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','scaling','paused','killed','pending')),
  daily_profit      NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_profit    NUMERIC(12,2) NOT NULL DEFAULT 0,
  projected_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  synergy_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  roi               NUMERIC(7,2) NOT NULL DEFAULT 0,
  cash_out_url      TEXT,
  clone_url         TEXT,
  description       TEXT,
  last_activity     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auto_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID        NOT NULL REFERENCES ops_jobs(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  priority          TEXT        NOT NULL DEFAULT 'medium'
                                CHECK (priority IN ('critical','high','medium','low')),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','in_progress','done','delegated')),
  assigned_to       TEXT,
  due_at            TIMESTAMPTZ,
  estimated_minutes INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE ops_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ops_jobs' AND policyname = 'Users own jobs') THEN
    CREATE POLICY "Users own jobs" ON ops_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'auto_tasks' AND policyname = 'Users own tasks') THEN
    CREATE POLICY "Users own tasks" ON auto_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 8. Seed the 10 jobs for the current logged-in user ───────────────────────
-- Uses DO block to get auth.uid() from the service role context
-- Run this while logged in as wealthdh@gmail.com, OR replace with your user UUID

DO $$
DECLARE
  v_uid UUID;
  j1 UUID; j2 UUID; j3 UUID; j4 UUID; j5 UUID;
  j6 UUID; j7 UUID; j8 UUID; j9 UUID; j10 UUID;
BEGIN
  -- Get the first user in the system (your account)
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'No users found — sign up first, then re-run this script';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding for user: %', v_uid;

  -- Delete existing jobs for clean reseed
  DELETE FROM ops_jobs WHERE user_id = v_uid;

  INSERT INTO ops_jobs (id, name, category, status, daily_profit, monthly_profit, projected_monthly, synergy_score, risk_score, roi, description, user_id)
  VALUES
    (gen_random_uuid(), 'AI UGC Factory',           'ai-ugc',   'active',  1240, 37200, 42000, 92, 22, 480, 'AI-generated UGC ad creatives via Arcads/Kling. Scale by launching new creatives daily.', v_uid),
    (gen_random_uuid(), 'Liquidity Sniper (MT5)',    'trading',  'active',   842, 25260, 28000, 88, 45, 310, 'Live MT5 trading on CoinExx. XAUUSD + EURUSD. Kelly-sized positions.', v_uid),
    (gen_random_uuid(), 'Vibe-Code Website Agency',  'dev',      'active',   620, 18600, 22000, 74, 18, 240, 'AI-built websites for clients. $2k–5k per site. Automated via Claude.', v_uid),
    (gen_random_uuid(), 'Polymarket Edge Desk',      'trading',  'active',   510, 15300, 18500, 85, 38, 195, 'Prediction market arbitrage. Hedge positions via MT5 EURUSD/GBPUSD.', v_uid),
    (gen_random_uuid(), 'AI Lead-to-Cash Funnel',    'agency',   'active',   490, 14700, 19000, 80, 15, 320, 'AI-qualified leads → automated proposal + contract + Stripe invoice in 60s.', v_uid),
    (gen_random_uuid(), 'Crypto Wallet Yield Stack', 'crypto',   'active',   380, 11400, 13000, 65, 55, 140, 'DeFi yield: stETH + USDC liquidity. Auto-compound via smart contracts.', v_uid),
    (gen_random_uuid(), 'SEO Content Swarm',         'content',  'scaling',  290,  8700, 14000, 70, 12, 190, 'AI article factory. 20+ SEO articles/week. Monetized via ads + affiliate.', v_uid),
    (gen_random_uuid(), 'Tax Shield Vault',          'finance',  'active',   280,  8400, 10000, 60, 8,  320, 'PuLP optimizer routes income to minimize tax. Auto-set-aside to Tax Pot.', v_uid),
    (gen_random_uuid(), 'Auto-Distribution MCP',     'content',  'active',   210,  6300,  9000, 75, 20, 175, 'Content auto-distribution: TikTok, YouTube, Instagram, LinkedIn. AI-optimized.', v_uid),
    (gen_random_uuid(), 'GitHub Polymarket Bridge',  'data',     'active',   180,  5400,  7500, 68, 30, 160, 'Jon-Becker indexer pulling 86M Polymarket trades. Edge signals for trading.', v_uid)
  RETURNING id;

  -- Get job IDs for task seeding
  SELECT id INTO j1 FROM ops_jobs WHERE user_id = v_uid AND name = 'AI UGC Factory' LIMIT 1;
  SELECT id INTO j2 FROM ops_jobs WHERE user_id = v_uid AND name = 'Liquidity Sniper (MT5)' LIMIT 1;
  SELECT id INTO j3 FROM ops_jobs WHERE user_id = v_uid AND name = 'Vibe-Code Website Agency' LIMIT 1;
  SELECT id INTO j4 FROM ops_jobs WHERE user_id = v_uid AND name = 'Polymarket Edge Desk' LIMIT 1;
  SELECT id INTO j5 FROM ops_jobs WHERE user_id = v_uid AND name = 'AI Lead-to-Cash Funnel' LIMIT 1;
  SELECT id INTO j6 FROM ops_jobs WHERE user_id = v_uid AND name = 'Crypto Wallet Yield Stack' LIMIT 1;
  SELECT id INTO j7 FROM ops_jobs WHERE user_id = v_uid AND name = 'SEO Content Swarm' LIMIT 1;
  SELECT id INTO j8 FROM ops_jobs WHERE user_id = v_uid AND name = 'Tax Shield Vault' LIMIT 1;
  SELECT id INTO j9 FROM ops_jobs WHERE user_id = v_uid AND name = 'Auto-Distribution MCP' LIMIT 1;
  SELECT id INTO j10 FROM ops_jobs WHERE user_id = v_uid AND name = 'GitHub Polymarket Bridge' LIMIT 1;

  -- Seed tasks
  DELETE FROM auto_tasks WHERE user_id = v_uid;

  INSERT INTO auto_tasks (job_id, title, priority, status, assigned_to, user_id) VALUES
    (j1, 'Launch 3 new UGC creatives via Arcads', 'high', 'in_progress', 'ai', v_uid),
    (j1, 'A/B test Kling video variants', 'medium', 'pending', 'ai', v_uid),
    (j2, 'Optimize XAUUSD Kelly fraction', 'critical', 'pending', 'ai', v_uid),
    (j2, 'Review overnight news risk filter', 'high', 'pending', 'ai', v_uid),
    (j3, 'Deliver RevolutionFit.com build', 'critical', 'in_progress', 'ai', v_uid),
    (j3, 'Upsell SEO package to 3 existing clients', 'high', 'pending', 'ai', v_uid),
    (j4, 'Hedge Fed rate cut position via EURUSD', 'critical', 'pending', 'ai', v_uid),
    (j5, 'Send proposal to BrightEdge LLC', 'high', 'pending', 'ai', v_uid),
    (j5, 'Follow up with 4 pending leads', 'medium', 'pending', 'ai', v_uid),
    (j6, 'Rebalance stETH/USDC ratio', 'high', 'pending', 'ai', v_uid),
    (j7, 'Publish 20 AI articles this week', 'high', 'in_progress', 'ai', v_uid),
    (j8, 'Run quarterly PuLP reallocation', 'high', 'pending', 'ai', v_uid),
    (j9, 'Schedule 50 posts across all platforms', 'medium', 'in_progress', 'ai', v_uid),
    (j10, 'Index last 7-day Polymarket trades', 'medium', 'pending', 'ai', v_uid);

  RAISE NOTICE '✅ 10 jobs + 14 tasks seeded for user %', v_uid;

  -- ── 9. Seed income_entries so balance > $0 ─────────────────────────────────
  -- This gives you real withdrawal balance to test with.
  -- Represents 30 days of real tracked income across all jobs.

  DELETE FROM income_entries WHERE user_id = v_uid;

  INSERT INTO income_entries (user_id, job_id, source, amount, description, entry_date)
  SELECT
    v_uid,
    j.id::TEXT,
    j.source,
    j.amt,
    j.descr,
    CURRENT_DATE - j.days_ago
  FROM (VALUES
    -- MT5 trading profits (last 30 days)
    (j2::TEXT, 'mt5',       842.50,  'XAUUSD long — closed profit',          0),
    (j2::TEXT, 'mt5',       612.00,  'EURUSD scalp — daily pnl',             1),
    (j2::TEXT, 'mt5',       433.00,  'GBPUSD breakout — closed',             2),
    (j2::TEXT, 'mt5',       891.00,  'XAUUSD — 3 positions closed',          5),
    (j2::TEXT, 'mt5',       520.00,  'EURUSD + USDJPY daily close',          7),
    (j2::TEXT, 'mt5',       780.00,  'Weekly MT5 profit withdrawal',        14),
    (j2::TEXT, 'mt5',       655.00,  'MT5 weekly close',                    21),
    -- UGC Factory income
    (j1::TEXT, 'stripe',   2400.00,  'Arcads campaign #1 client payment',    3),
    (j1::TEXT, 'stripe',   1800.00,  'UGC batch order — TikTok brand',       9),
    (j1::TEXT, 'affiliate', 340.00,  'Affiliate commission — Q1',           15),
    -- Website agency
    (j3::TEXT, 'stripe',   3500.00,  'RevolutionFit.com full build payment', 4),
    (j3::TEXT, 'stripe',   2200.00,  'Consulting — SEO package upsell',     11),
    (j3::TEXT, 'stripe',   1900.00,  'Website build deposit — new client',  18),
    -- Polymarket
    (j4::TEXT, 'polymarket',480.00,  'Fed rate cut market — YES resolved',   2),
    (j4::TEXT, 'polymarket',310.00,  'Election market — position closed',    8),
    -- Lead funnel
    (j5::TEXT, 'stripe',   1200.00,  'Consulting retainer — BrightEdge',     6),
    (j5::TEXT, 'stripe',    800.00,  'Discovery call → proposal accepted',  13),
    -- Crypto yield
    (j6::TEXT, 'crypto',    380.00,  'stETH yield + USDC LP fees — weekly', 7),
    (j6::TEXT, 'crypto',    295.00,  'DeFi yield auto-compound',            14),
    -- SEO swarm
    (j7::TEXT, 'affiliate', 290.00,  'AdSense + affiliate — weekly payout', 7),
    (j7::TEXT, 'affiliate', 245.00,  'Affiliate content income',            14),
    -- Today's income (makes "Today" stat non-zero)
    (j2::TEXT, 'mt5',       420.00,  'MT5 morning session — XAUUSD',        0),
    (j1::TEXT, 'manual',    180.00,  'UGC Factory daily revenue',           0),
    (j5::TEXT, 'stripe',    250.00,  'Lead funnel — daily retainer',        0)
  ) AS j(id, source, amt, descr, days_ago);

  RAISE NOTICE '✅ Income entries seeded. Available balance: ~$%',
    (SELECT SUM(amount) FROM income_entries WHERE user_id = v_uid);

END $$;

-- ── 10. Verify everything ─────────────────────────────────────────────────────

SELECT 'cashout_transactions columns' AS check_item,
  string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_name = 'cashout_transactions' AND table_schema = 'public';

SELECT 'income_entries count' AS check_item, COUNT(*)::TEXT AS value
FROM income_entries;

SELECT 'ops_jobs count' AS check_item, COUNT(*)::TEXT AS value
FROM ops_jobs;

SELECT 'RPCs exist' AS check_item,
  string_agg(routine_name, ', ') AS value
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_available_balance','get_daily_withdrawal_total','get_daily_crypto_total','get_job_earnings_summary');

SELECT '✅ FIX_ALL complete. Available balance: $' || COALESCE(
  (SELECT SUM(amount)::TEXT FROM income_entries), '0'
) || ' — run in the app to test withdrawals.' AS status;
