-- ─────────────────────────────────────────────────────────────────────────────
-- fix_rpc_30day_window.sql
-- Run in Supabase SQL Editor → replaces calendar-month with 30-day rolling window
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_job_earnings_summary(p_user_id UUID)
RETURNS TABLE (
  job_id        UUID,
  today_total   NUMERIC,
  week_total    NUMERIC,
  month_total   NUMERIC,
  all_time_total NUMERIC
) LANGUAGE sql STABLE AS $$
  SELECT
    job_id,
    SUM(amount) FILTER (WHERE entry_date = CURRENT_DATE)                        AS today_total,
    SUM(amount) FILTER (WHERE entry_date >= CURRENT_DATE - INTERVAL '7 days')   AS week_total,
    SUM(amount) FILTER (WHERE entry_date >= CURRENT_DATE - INTERVAL '30 days')  AS month_total,
    SUM(amount)                                                                  AS all_time_total
  FROM income_entries
  WHERE user_id = p_user_id
  GROUP BY job_id
$$;
