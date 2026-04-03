-- ─────────────────────────────────────────────────────────────────────────────
-- fix_cashout_rls_insert.sql  ← RUN THIS NOW in Supabase SQL Editor
--
-- The original schema only allowed service_role to INSERT.
-- We switched to client-side "Request Payout" flow, so authenticated users
-- need INSERT permission on their own rows.
--
-- Steps:
--   1. Supabase Dashboard → SQL Editor → New Query → paste all → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old conflicting policies (safe — recreated below)
DROP POLICY IF EXISTS "Users own cashout_transactions"      ON public.cashout_transactions;
DROP POLICY IF EXISTS "Service role can manage cashout transactions" ON public.cashout_transactions;

-- ── 1. SELECT: users see only their own rows ──────────────────────────────────
DROP POLICY IF EXISTS "Users can read own cashout transactions" ON public.cashout_transactions;
CREATE POLICY "Users can read own cashout transactions"
  ON public.cashout_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. INSERT: authenticated users can create pending withdrawal requests ─────
CREATE POLICY "Users can insert own cashout requests"
  ON public.cashout_transactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id          -- must be your own row
    AND status = 'pending'        -- only 'pending' status allowed from client
    AND method IN ('crypto','bank','card')
  );

-- ── 3. UPDATE: only the backend (service_role) can update status ──────────────
CREATE POLICY "Service role can update cashout status"
  ON public.cashout_transactions FOR UPDATE
  USING (auth.role() = 'service_role');

-- ── 4. DELETE: nobody can delete audit records ───────────────────────────────
-- (no DELETE policy = delete is blocked for everyone including service_role via RLS)

-- ── Verify policies applied ───────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'cashout_transactions'
ORDER BY policyname;
