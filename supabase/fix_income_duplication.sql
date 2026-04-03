-- ─────────────────────────────────────────────────────────────────────────────
-- fix_income_duplication.sql
--
-- Run this ONCE in Supabase SQL Editor to remove duplicate seed entries.
-- Keeps the FIRST (oldest created_at) entry per (user_id, job_id, entry_date).
-- Safe to re-run — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Preview what will be deleted (run SELECT first to verify)
-- SELECT id, job_id, amount, entry_date, created_at
-- FROM income_entries ie
-- WHERE id NOT IN (
--   SELECT DISTINCT ON (user_id, job_id, entry_date) id
--   FROM income_entries
--   ORDER BY user_id, job_id, entry_date, created_at ASC
-- )
-- ORDER BY entry_date DESC;

-- 2. Delete duplicates — keeps earliest entry per (user_id, job_id, entry_date)
DELETE FROM income_entries
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, job_id, entry_date) id
  FROM income_entries
  ORDER BY user_id, job_id, entry_date, created_at ASC
);

-- 3. Verify result
SELECT
  COUNT(*)                                            AS total_entries,
  COUNT(DISTINCT job_id)                             AS distinct_jobs,
  MIN(entry_date)                                    AS earliest,
  MAX(entry_date)                                    AS latest,
  SUM(amount)                                        AS total_amount
FROM income_entries;
