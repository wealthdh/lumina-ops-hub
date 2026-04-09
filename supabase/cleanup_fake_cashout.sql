-- ─── Remove fake/test cashout transactions ────────────────────────────────────
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rjtxkjozlhvnxkzmqffk/sql/new
--
-- This deletes the phantom $4,962 BSC pending transaction that was never
-- initiated by the user, along with any other test/seed cashout rows.

-- 1. Preview what will be deleted (run this first to confirm)
SELECT id, amount, method, status, network, to_address, created_at
FROM cashout_transactions
ORDER BY created_at DESC;

-- 2. Delete ALL cashout_transactions (they are all test/fake data)
--    Comment this out if you have real completed withdrawals you want to keep.
DELETE FROM cashout_transactions
WHERE status IN ('pending', 'processing', 'needs_approval')
   OR amount = 4962
   OR (created_at < '2026-04-03'::timestamptz AND status != 'completed');

-- 3. Also clear the localStorage-queued fallback on the client side:
--    The app stores pending cashouts in localStorage key 'lumina_pending_cashouts'
--    Open browser console and run:
--      localStorage.removeItem('lumina_pending_cashouts')

-- 4. Verify clean state
SELECT COUNT(*) as remaining_transactions FROM cashout_transactions;
