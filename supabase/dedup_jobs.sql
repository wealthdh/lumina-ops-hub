-- ──────────────────────────────────────────────────────────────────────────────
-- dedup_jobs.sql
-- Removes duplicate rows from ops_jobs, keeping the OLDEST row per job name
-- (the one with the smallest created_at, i.e. the original insert).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run All
-- Safe to run multiple times — only deletes true duplicates.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Preview what will be deleted (run this first to confirm)
SELECT
  id,
  name,
  status,
  monthly_profit,
  created_at,
  'WILL BE DELETED' AS action
FROM ops_jobs
WHERE id NOT IN (
  -- Keep only the oldest row per (user_id, name) pair
  SELECT DISTINCT ON (user_id, name) id
  FROM ops_jobs
  ORDER BY user_id, name, created_at ASC
)
ORDER BY name, created_at;

-- 2. Delete the duplicates (comment out the SELECT above and uncomment this)
-- DELETE FROM ops_jobs
-- WHERE id NOT IN (
--   SELECT DISTINCT ON (user_id, name) id
--   FROM ops_jobs
--   ORDER BY user_id, name, created_at ASC
-- );

-- 3. Verify — should show 1 row per job name
-- SELECT name, COUNT(*) as count, MIN(created_at) as created
-- FROM ops_jobs
-- GROUP BY name
-- ORDER BY name;
