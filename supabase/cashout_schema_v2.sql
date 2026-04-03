-- ─────────────────────────────────────────────────────────────────────────────
-- cashout_schema_v2.sql
-- Run AFTER cashout_schema.sql.  Paste into Supabase SQL editor → Run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Harden existing cashout_transactions table ───────────────────────────

ALTER TABLE public.cashout_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key      text UNIQUE,
  ADD COLUMN IF NOT EXISTS server_balance        numeric(12,2),   -- verified at request time
  ADD COLUMN IF NOT EXISTS daily_total_at_req    numeric(12,2),   -- daily sum before this tx
  ADD COLUMN IF NOT EXISTS approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason      text,
  ADD COLUMN IF NOT EXISTS hot_wallet_warned     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata              jsonb    NOT NULL DEFAULT '{}';

-- ─── 2. Approval queue (withdrawals > $500) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashout_approvals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid        NOT NULL REFERENCES public.cashout_transactions(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  method         text        NOT NULL CHECK (method IN ('bank','card','crypto')),
  job_id         uuid        REFERENCES public.ops_jobs(id) ON DELETE SET NULL,
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','approved','rejected','expired')),
  reason         text        NOT NULL DEFAULT '>$500 threshold',
  admin_notes    text,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  reviewed_by    text,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashout_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own approvals"
  ON public.cashout_approvals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages approvals"
  ON public.cashout_approvals FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER cashout_approvals_updated_at
  BEFORE UPDATE ON public.cashout_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS cashout_approvals_user_status_idx
  ON public.cashout_approvals (user_id, status, requested_at DESC);

-- ─── 3. 2FA codes table (crypto withdrawals) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashout_2fa_codes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash        text        NOT NULL,   -- SHA-256 hex of the 6-digit plaintext
  idempotency_key  text        NOT NULL,   -- tied to the specific withdrawal attempt
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used             boolean     NOT NULL DEFAULT false,
  attempts         smallint    NOT NULL DEFAULT 0,  -- max 5 attempts
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashout_2fa_codes ENABLE ROW LEVEL SECURITY;

-- Users cannot read their own codes (security: verification is server-side only)
CREATE POLICY "No direct reads on 2fa codes"
  ON public.cashout_2fa_codes FOR SELECT
  USING (false);

CREATE POLICY "Service role manages 2fa codes"
  ON public.cashout_2fa_codes FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS cashout_2fa_user_active_idx
  ON public.cashout_2fa_codes (user_id, used, expires_at)
  WHERE used = false;

-- ─── 4. Helper SQL functions ──────────────────────────────────────────────────

-- Returns the total USD withdrawn today (completed only) for a user
CREATE OR REPLACE FUNCTION public.get_daily_withdrawal_total(p_user_id uuid)
  RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
  SELECT COALESCE(SUM(amount), 0)
  FROM   public.cashout_transactions
  WHERE  user_id   = p_user_id
    AND  status    = 'completed'
    AND  created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- Returns total available balance (sum of active/scaling job monthly_profit)
CREATE OR REPLACE FUNCTION public.get_available_balance(p_user_id uuid)
  RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
  SELECT COALESCE(SUM(monthly_profit), 0)
  FROM   public.ops_jobs
  WHERE  user_id = p_user_id
    AND  status  IN ('active', 'scaling');
$$;

-- Returns total crypto withdrawn today
CREATE OR REPLACE FUNCTION public.get_daily_crypto_total(p_user_id uuid)
  RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
  SELECT COALESCE(SUM(amount), 0)
  FROM   public.cashout_transactions
  WHERE  user_id   = p_user_id
    AND  method    = 'crypto'
    AND  status    = 'completed'
    AND  created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- ─── 5. Realtime publications ─────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.cashout_approvals;

-- cashout_2fa_codes intentionally NOT added to realtime (security)

-- ─── 6. Grant execute on helper functions ────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_daily_withdrawal_total  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_balance        TO service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_crypto_total       TO service_role;
