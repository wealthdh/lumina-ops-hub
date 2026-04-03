-- ============================================================
-- LUMINA OPS HUB — Income Schema v2 (matches live DB)
--
-- IMPORTANT: This file reflects the ACTUAL live DB column names.
-- income_schema.sql (v1) was written with different names —
-- they were corrected here and in all TypeScript hooks.
--
-- Actual live DB column names (verified):
--   income_entries: amount, entry_date (DATE), reference_id
--   get_job_earnings_summary returns: today_total, week_total, month_total, all_time_total
--
-- Run this to set up a fresh environment OR to fix a v1 deployment.
-- Safe to run multiple times (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ── income_entries ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_entries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       TEXT        NOT NULL,
  source       TEXT        NOT NULL CHECK (source IN ('stripe','mt5','polymarket','manual','crypto','affiliate','consulting')),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description  TEXT,
  reference_id TEXT,                    -- Stripe charge ID, MT5 ticket, etc.
  entry_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Migrate v1 → v2 column names (if v1 schema was applied) ──────────────────
DO $$
BEGIN
  -- Rename amount_usd → amount
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'income_entries' AND column_name = 'amount_usd') THEN
    ALTER TABLE income_entries RENAME COLUMN amount_usd TO amount;
    RAISE NOTICE 'Renamed: amount_usd → amount';
  END IF;

  -- Rename source_ref → reference_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'income_entries' AND column_name = 'source_ref') THEN
    ALTER TABLE income_entries RENAME COLUMN source_ref TO reference_id;
    RAISE NOTICE 'Renamed: source_ref → reference_id';
  END IF;

  -- Rename earned_at → entry_date (also change type to DATE)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'income_entries' AND column_name = 'earned_at') THEN
    ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS entry_date DATE;
    UPDATE income_entries SET entry_date = earned_at::DATE WHERE entry_date IS NULL;
    ALTER TABLE income_entries ALTER COLUMN entry_date SET NOT NULL;
    ALTER TABLE income_entries ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE;
    ALTER TABLE income_entries DROP COLUMN earned_at;
    RAISE NOTICE 'Renamed + converted: earned_at (TIMESTAMPTZ) → entry_date (DATE)';
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_income_entries_user_date  ON income_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_entries_job        ON income_entries(job_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_entries_source     ON income_entries(user_id, source);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'income_entries' AND policyname = 'Users own income_entries v2') THEN
    CREATE POLICY "Users own income_entries v2"
      ON income_entries FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── job_goals ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_goals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id      TEXT        NOT NULL,
  daily_goal  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE job_goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'job_goals' AND policyname = 'Users own job_goals v2') THEN
    CREATE POLICY "Users own job_goals v2"
      ON job_goals FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_goals_user ON job_goals(user_id);

-- ── get_job_earnings_summary RPC ──────────────────────────────────────────────
-- Returns today_total, week_total, month_total, all_time_total (not *_usd)
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
    COALESCE(SUM(amount) FILTER (WHERE entry_date = CURRENT_DATE),                              0) AS today_total,
    COALESCE(SUM(amount) FILTER (WHERE entry_date >= CURRENT_DATE - INTERVAL '7 days'),          0) AS week_total,
    COALESCE(SUM(amount) FILTER (WHERE entry_date >= date_trunc('month', CURRENT_DATE)::DATE),   0) AS month_total,
    COALESCE(SUM(amount),                                                                        0) AS all_time_total,
    MAX(entry_date)                                                                                 AS last_entry_at
  FROM income_entries
  WHERE user_id = p_user_id
  GROUP BY job_id;
$$;

GRANT EXECUTE ON FUNCTION get_job_earnings_summary TO authenticated;

-- ── cashout_transactions (verify correct columns exist) ───────────────────────
CREATE TABLE IF NOT EXISTS cashout_transactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  method     TEXT        NOT NULL DEFAULT 'crypto',
  amount     NUMERIC(12,2),
  status     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  tx_id      TEXT,
  job_id     TEXT,
  network    TEXT,
  to_address TEXT,
  error_msg  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cashout_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'cashout_transactions' AND policyname = 'Users own cashout_transactions') THEN
    CREATE POLICY "Users own cashout_transactions"
      ON cashout_transactions FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

SELECT 'income_schema_v2 applied successfully. RPC get_job_earnings_summary returns today_total/week_total/month_total/all_time_total.' AS status;
