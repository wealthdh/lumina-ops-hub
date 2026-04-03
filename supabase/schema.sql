-- ============================================================
-- Lumina Ops Hub — Complete Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── MT5 Accounts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mt5_accounts (
  account_id    TEXT        PRIMARY KEY,
  balance       NUMERIC     NOT NULL DEFAULT 0,
  equity        NUMERIC     NOT NULL DEFAULT 0,
  margin        NUMERIC     NOT NULL DEFAULT 0,
  free_margin   NUMERIC     NOT NULL DEFAULT 0,
  margin_level  NUMERIC     NOT NULL DEFAULT 0,
  profit        NUMERIC     NOT NULL DEFAULT 0,
  day_pnl       NUMERIC     NOT NULL DEFAULT 0,
  week_pnl      NUMERIC     NOT NULL DEFAULT 0,
  month_pnl     NUMERIC     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── MT5 Open Trades ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mt5_trades (
  ticket        BIGINT      PRIMARY KEY,
  symbol        TEXT        NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('buy','sell')),
  volume        NUMERIC     NOT NULL,
  open_price    NUMERIC     NOT NULL,
  current_price NUMERIC     NOT NULL DEFAULT 0,
  profit        NUMERIC     NOT NULL DEFAULT 0,
  open_time     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sl            NUMERIC     NOT NULL DEFAULT 0,
  tp            NUMERIC     NOT NULL DEFAULT 0,
  account_id    TEXT        NOT NULL REFERENCES mt5_accounts(account_id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Ops Jobs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_jobs (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT        NOT NULL,
  category          TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','scaling','paused','killed','pending')),
  daily_profit      NUMERIC     NOT NULL DEFAULT 0,
  monthly_profit    NUMERIC     NOT NULL DEFAULT 0,
  projected_monthly NUMERIC     NOT NULL DEFAULT 0,
  synergy_score     NUMERIC     NOT NULL DEFAULT 0,
  risk_score        NUMERIC     NOT NULL DEFAULT 0,
  roi               NUMERIC     NOT NULL DEFAULT 0,
  cash_out_url      TEXT,
  clone_url         TEXT,
  last_activity     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Auto Tasks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_tasks (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- ─── Polymarket Markets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poly_markets (
  id          TEXT        PRIMARY KEY,
  question    TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  end_date    TEXT        NOT NULL,
  volume      NUMERIC     NOT NULL DEFAULT 0,
  liquidity   NUMERIC     NOT NULL DEFAULT 0,
  category    TEXT        NOT NULL DEFAULT '',
  active      BOOLEAN     NOT NULL DEFAULT true,
  outcomes    JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Polymarket Positions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poly_positions (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id      TEXT        NOT NULL REFERENCES poly_markets(id),
  question       TEXT        NOT NULL,
  outcome        TEXT        NOT NULL,
  shares         NUMERIC     NOT NULL DEFAULT 0,
  avg_price      NUMERIC     NOT NULL DEFAULT 0,
  current_price  NUMERIC     NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Arbitrage Signals ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arbitrage_signals (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type             TEXT        NOT NULL CHECK (type IN ('polymarket-mt5','cross-market','synthetic')),
  description      TEXT        NOT NULL,
  expected_edge    NUMERIC     NOT NULL DEFAULT 0,
  confidence       NUMERIC     NOT NULL DEFAULT 0,
  required_capital NUMERIC     NOT NULL DEFAULT 0,
  time_to_expiry   INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'live' CHECK (status IN ('live','executed','expired')),
  mt5_symbol       TEXT,
  polymarket_id    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Tax Entries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_entries (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  date                DATE        NOT NULL,
  amount              NUMERIC     NOT NULL,
  description         TEXT        NOT NULL,
  category            TEXT        NOT NULL,
  source              TEXT        NOT NULL,
  deductible          BOOLEAN     NOT NULL DEFAULT false,
  tax_pot_contribution NUMERIC    NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Tax Pot ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_pot (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  balance           NUMERIC     NOT NULL DEFAULT 0,
  target_rate       NUMERIC     NOT NULL DEFAULT 32,
  quarterly_estimate NUMERIC    NOT NULL DEFAULT 0,
  next_due_date     DATE        NOT NULL,
  ytd_income        NUMERIC     NOT NULL DEFAULT 0,
  ytd_set_aside     NUMERIC     NOT NULL DEFAULT 0,
  projected_tax_bill NUMERIC    NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (user_id)
);

-- ─── Leads (CRM) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  company        TEXT,
  source         TEXT        NOT NULL DEFAULT 'manual',
  score          NUMERIC     NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  stage          TEXT        NOT NULL DEFAULT 'new'
                             CHECK (stage IN ('new','qualified','proposal','negotiation','won','lost')),
  estimated_value NUMERIC    NOT NULL DEFAULT 0,
  proposal_url   TEXT,
  contract_url   TEXT,
  invoice_url    TEXT,
  loom_url       TEXT,
  last_contact   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Daily Briefings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_briefings (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  date            DATE        NOT NULL,
  summary         TEXT        NOT NULL,
  audio_url       TEXT,
  top_priorities  TEXT[]      NOT NULL DEFAULT '{}',
  alerts          JSONB       NOT NULL DEFAULT '[]',
  pnl_mt5         NUMERIC     NOT NULL DEFAULT 0,
  pnl_poly        NUMERIC     NOT NULL DEFAULT 0,
  pnl_total       NUMERIC     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (user_id, date)
);

-- ─── Allocation Rules (PuLP output) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocation_rules (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                 UUID        NOT NULL REFERENCES ops_jobs(id) ON DELETE CASCADE,
  job_name               TEXT        NOT NULL,
  current_allocation     NUMERIC     NOT NULL DEFAULT 0,
  recommended_allocation NUMERIC     NOT NULL DEFAULT 0,
  expected_return        NUMERIC     NOT NULL DEFAULT 0,
  constraint             TEXT        NOT NULL DEFAULT 'none',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Synergy Links ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synergy_links (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_a        UUID        NOT NULL REFERENCES ops_jobs(id) ON DELETE CASCADE,
  job_b        UUID        NOT NULL REFERENCES ops_jobs(id) ON DELETE CASCADE,
  synergy_type TEXT        NOT NULL,
  value        NUMERIC     NOT NULL DEFAULT 0,
  description  TEXT        NOT NULL,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Monte Carlo Results ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montecarlo_results (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario     TEXT        NOT NULL,
  p10          NUMERIC     NOT NULL,
  p25          NUMERIC     NOT NULL,
  p50          NUMERIC     NOT NULL,
  p75          NUMERIC     NOT NULL,
  p90          NUMERIC     NOT NULL,
  max_drawdown NUMERIC     NOT NULL,
  sharpe       NUMERIC     NOT NULL,
  runs         INT         NOT NULL DEFAULT 1000,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Realtime ticks (broadcast only, no persistence needed) ──────────────────
-- Ticks are pushed via Supabase Realtime broadcast — no table required.

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ops_jobs_user            ON ops_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_tasks_job           ON auto_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_auto_tasks_priority      ON auto_tasks(priority) WHERE status != 'done';
CREATE INDEX IF NOT EXISTS idx_arbitrage_signals_status ON arbitrage_signals(status);
CREATE INDEX IF NOT EXISTS idx_tax_entries_user_date    ON tax_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_leads_stage              ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_score              ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_trades_account       ON mt5_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date     ON daily_briefings(user_id, date DESC);

-- ─── Updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mt5_accounts_updated') THEN
    CREATE TRIGGER trg_mt5_accounts_updated BEFORE UPDATE ON mt5_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tax_pot_updated') THEN
    CREATE TRIGGER trg_tax_pot_updated BEFORE UPDATE ON tax_pot FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_allocation_rules_updated') THEN
    CREATE TRIGGER trg_allocation_rules_updated BEFORE UPDATE ON allocation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
