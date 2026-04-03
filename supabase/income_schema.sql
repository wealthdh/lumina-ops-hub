-- ============================================================
-- Lumina Ops Hub — Real Income Tracking Schema
-- Run this in Supabase SQL Editor to enable live earnings
-- ============================================================

-- ── income_entries: Every real dollar earned per job ─────────────────────────
CREATE TABLE IF NOT EXISTS income_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          TEXT NOT NULL,          -- matches ops_jobs.id
  amount_usd      NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  source          TEXT NOT NULL,          -- 'stripe', 'mt5', 'polymarket', 'manual', 'crypto', 'affiliate'
  source_ref      TEXT,                   -- Stripe charge ID, MT5 ticket, Polymarket trade ID, etc.
  description     TEXT,
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── daily_job_pnl: Materialized view updated by Edge Functions ───────────────
-- Auto-computed from income_entries; use this for dashboard display
CREATE TABLE IF NOT EXISTS daily_job_pnl (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id      TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  total_usd   NUMERIC(12,2) NOT NULL DEFAULT 0,
  entry_count INT  NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id, date)
);

-- ── stripe_events: Idempotent Stripe webhook log ──────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_events (
  id          TEXT PRIMARY KEY,           -- Stripe event ID (idempotency)
  type        TEXT NOT NULL,
  amount_usd  NUMERIC(12,2),
  customer_id TEXT,
  job_id      TEXT,                       -- mapped from Stripe metadata.job_id
  payload     JSONB,
  processed   BOOLEAN DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── polymarket_trades: Live trade results ────────────────────────────────────
CREATE TABLE IF NOT EXISTS polymarket_trades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id   TEXT NOT NULL,
  market_name TEXT,
  side        TEXT CHECK (side IN ('yes','no')),
  size_usd    NUMERIC(12,2),
  avg_price   NUMERIC(6,4),
  pnl_usd     NUMERIC(12,2),
  status      TEXT DEFAULT 'open' CHECK (status IN ('open','won','lost','resolved')),
  opened_at   TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_income_entries_user_date     ON income_entries(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_income_entries_job           ON income_entries(job_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_job_pnl_user_date      ON daily_job_pnl(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_polymarket_trades_user       ON polymarket_trades(user_id, opened_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE income_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_job_pnl     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE polymarket_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own income_entries"    ON income_entries    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own daily_job_pnl"    ON daily_job_pnl     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role only stripe"   ON stripe_events     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users own poly trades"      ON polymarket_trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Function: upsert_daily_pnl (called after each income_entries INSERT) ─────
CREATE OR REPLACE FUNCTION upsert_daily_pnl()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO daily_job_pnl(user_id, job_id, date, total_usd, entry_count)
  VALUES (
    NEW.user_id,
    NEW.job_id,
    NEW.earned_at::DATE,
    NEW.amount_usd,
    1
  )
  ON CONFLICT (user_id, job_id, date) DO UPDATE SET
    total_usd   = daily_job_pnl.total_usd   + NEW.amount_usd,
    entry_count = daily_job_pnl.entry_count + 1,
    updated_at  = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_daily_pnl ON income_entries;
CREATE TRIGGER trg_upsert_daily_pnl
  AFTER INSERT ON income_entries
  FOR EACH ROW EXECUTE FUNCTION upsert_daily_pnl();

-- ── Function: get_job_earnings_summary (for dashboard) ───────────────────────
CREATE OR REPLACE FUNCTION get_job_earnings_summary(p_user_id UUID)
RETURNS TABLE(
  job_id           TEXT,
  today_usd        NUMERIC,
  week_usd         NUMERIC,
  month_usd        NUMERIC,
  all_time_usd     NUMERIC,
  last_entry_at    TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    job_id,
    COALESCE(SUM(amount_usd) FILTER (WHERE earned_at >= CURRENT_DATE),                                    0) AS today_usd,
    COALESCE(SUM(amount_usd) FILTER (WHERE earned_at >= CURRENT_DATE - INTERVAL '7 days'),                 0) AS week_usd,
    COALESCE(SUM(amount_usd) FILTER (WHERE earned_at >= date_trunc('month', CURRENT_DATE)),                0) AS month_usd,
    COALESCE(SUM(amount_usd),                                                                              0) AS all_time_usd,
    MAX(earned_at)                                                                                           AS last_entry_at
  FROM income_entries
  WHERE user_id = p_user_id
  GROUP BY job_id;
$$;

GRANT EXECUTE ON FUNCTION get_job_earnings_summary TO authenticated;

-- ── job_goals: Per-job daily/weekly revenue targets ──────────────────────────
CREATE TABLE IF NOT EXISTS job_goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       TEXT NOT NULL,
  daily_goal   NUMERIC(12,2) NOT NULL DEFAULT 0,
  weekly_goal  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE job_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own job_goals" ON job_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_job_goals_user ON job_goals(user_id);
