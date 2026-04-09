-- ──────────────────────────────────────────────────────────────────────────────
-- cashout_schema_v3.sql
-- Add per-job withdrawal limits + crypto cap + approval flag to allocation_rules.
-- Safe to run multiple times (all ADD COLUMN IF NOT EXISTS).
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run All
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add safety columns to allocation_rules ────────────────────────────────
ALTER TABLE public.allocation_rules
  ADD COLUMN IF NOT EXISTS daily_withdrawal_limit  numeric(12,2) NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS daily_crypto_limit      numeric(12,2) NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS requires_approval       boolean       NOT NULL DEFAULT true;

-- ─── 2. Set elevated limits for Vibe-Code Website Agency ─────────────────────
UPDATE public.allocation_rules
SET    daily_withdrawal_limit = 5000,
       daily_crypto_limit     = 2000,
       requires_approval      = false
WHERE  job_name ILIKE '%vibe%code%website%';

-- ─── 3. Verify ────────────────────────────────────────────────────────────────
-- Should return 1 row with the new values:
SELECT job_name, daily_withdrawal_limit, daily_crypto_limit, requires_approval
FROM   public.allocation_rules
WHERE  job_name ILIKE '%vibe%code%website%';

-- ─── 4. Optional: view all jobs with their limits ────────────────────────────
-- SELECT job_name, daily_withdrawal_limit, daily_crypto_limit, requires_approval
-- FROM   public.allocation_rules
-- ORDER BY job_name;
