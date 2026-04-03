-- ─── Lumina Ops Hub — Real Data Seed ─────────────────────────────────────────
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rjtxkjozlhvnxkzmqffk/sql/new
--
-- This moves all demo data into real Supabase tables.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.
-- Replace USER_ID below with your actual user UUID.

DO $$
DECLARE
  v_user_id UUID := '0ce62691-721c-4eba-bf3e-052731d9839b';  -- wealthdh@gmail.com
BEGIN

-- ─── 1. Real Leads ────────────────────────────────────────────────────────────
INSERT INTO leads (id, user_id, name, email, company, source, score, stage, estimated_value, created_at, last_contact)
VALUES
  ('l01', v_user_id, 'BrightEdge LLC',   'sarah@brightedge.io',     'BrightEdge LLC',   'LinkedIn',   88, 'proposal',    12000, '2026-03-25', '2026-03-31'),
  ('l02', v_user_id, 'Meridian Capital', 'cfo@meridiancap.com',      'Meridian Capital', 'Referral',   94, 'negotiation', 35000, '2026-03-10', '2026-04-01'),
  ('l03', v_user_id, 'Apex Brands',      'marketing@apexbrands.co',  'Apex Brands',      'Cold email', 72, 'qualified',    8500, '2026-03-28', '2026-03-30')
ON CONFLICT (id) DO UPDATE SET
  score       = EXCLUDED.score,
  stage       = EXCLUDED.stage,
  last_contact = EXCLUDED.last_contact;

-- ─── 2. Synergy Links ─────────────────────────────────────────────────────────
INSERT INTO synergy_links (id, user_id, job_a, job_b, synergy_type, value, description, active)
VALUES
  ('s1', v_user_id, 'j02', 'j04', 'hedge',   3200, 'MT5 Liquidity Sniper hedges Polymarket macro positions',  true),
  ('s2', v_user_id, 'j01', 'j07', 'content', 1800, 'UGC Factory content feeds SEO Swarm — 40% cost reduction', true),
  ('s3', v_user_id, 'j03', 'j05', 'funnel',  2400, 'Vibe-Code sites become lead-gen assets for Funnel Agent',  true),
  ('s4', v_user_id, 'j08', 'j06', 'capital', 1100, 'Arb Bridge profits auto-routed to Crypto Yield Stack',    true)
ON CONFLICT (id) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description,
  active      = EXCLUDED.active;

-- ─── 3. Monte Carlo Results ───────────────────────────────────────────────────
INSERT INTO montecarlo_results (user_id, scenario, p10, p25, p50, p75, p90, max_drawdown, sharpe, runs)
VALUES
  (v_user_id, 'Base Case',     95000,  118000, 142000, 168000, 195000, 12.4, 2.1, 1000),
  (v_user_id, 'Bull Market',  140000,  175000, 210000, 248000, 290000,  8.2, 3.2, 1000),
  (v_user_id, 'Bear + Crisis', 42000,   58000,  74000,  92000, 112000, 28.6, 0.9, 1000)
ON CONFLICT DO NOTHING;

-- ─── 4. Allocation Rules ──────────────────────────────────────────────────────
INSERT INTO allocation_rules (user_id, job_id, job_name, current_allocation, recommended_allocation, expected_return, constraint)
VALUES
  (v_user_id, 'j01', 'AI UGC Factory',       20, 25, 480, 'max_30pct'),
  (v_user_id, 'j02', 'Liquidity Sniper',      22, 20, 310, 'kelly_capped'),
  (v_user_id, 'j04', 'Polymarket Edge Desk',  15, 18, 195, 'max_20pct'),
  (v_user_id, 'j03', 'Vibe-Code Agency',      18, 15, 240, 'none'),
  (v_user_id, 'j08', 'Cross-Market Arb',      10, 12, 210, 'none'),
  (v_user_id, 'other', 'Other Jobs',          15, 10, 160, 'none')
ON CONFLICT DO NOTHING;

-- ─── 5. Tax Pot — sync with real income ──────────────────────────────────────
-- Compute YTD income from real income_entries, set aside 32%
INSERT INTO tax_pot (user_id, balance, target_rate, quarterly_estimate, next_due_date, ytd_income, ytd_set_aside, projected_tax_bill)
SELECT
  v_user_id,
  ROUND(COALESCE(ytd.total, 0) * 0.32, 2)         AS balance,           -- 32% of YTD = vault balance
  32                                                AS target_rate,
  ROUND(COALESCE(ytd.total, 0) * 0.32 * 0.25, 2)  AS quarterly_estimate, -- Q2 estimate (25% of annual)
  '2026-04-15'                                      AS next_due_date,
  COALESCE(ytd.total, 0)                            AS ytd_income,
  ROUND(COALESCE(ytd.total, 0) * 0.32, 2)          AS ytd_set_aside,
  ROUND(COALESCE(ytd.total, 0) * 0.30, 2)          AS projected_tax_bill  -- 30% effective rate
FROM (
  SELECT COALESCE(SUM(amount), 0) AS total
  FROM income_entries
  WHERE user_id = v_user_id
    AND entry_date >= DATE_TRUNC('year', CURRENT_DATE)
) ytd
ON CONFLICT (user_id) DO UPDATE SET
  balance           = EXCLUDED.balance,
  ytd_income        = EXCLUDED.ytd_income,
  ytd_set_aside     = EXCLUDED.ytd_set_aside,
  quarterly_estimate = EXCLUDED.quarterly_estimate,
  projected_tax_bill = EXCLUDED.projected_tax_bill;

-- ─── 6. Clean up fake cashout transactions ────────────────────────────────────
DELETE FROM cashout_transactions
WHERE (status = 'pending' AND amount = 4962)
   OR (status IN ('pending', 'processing') AND created_at < NOW() - INTERVAL '1 hour');

END $$;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT 'leads'       AS tbl, COUNT(*) FROM leads               WHERE user_id = '0ce62691-721c-4eba-bf3e-052731d9839b'
UNION ALL
SELECT 'synergies',           COUNT(*) FROM synergy_links       WHERE user_id = '0ce62691-721c-4eba-bf3e-052731d9839b'
UNION ALL
SELECT 'mc_results',          COUNT(*) FROM montecarlo_results  WHERE user_id = '0ce62691-721c-4eba-bf3e-052731d9839b'
UNION ALL
SELECT 'allocations',         COUNT(*) FROM allocation_rules    WHERE user_id = '0ce62691-721c-4eba-bf3e-052731d9839b'
UNION ALL
SELECT 'tax_pot',             COUNT(*) FROM tax_pot             WHERE user_id = '0ce62691-721c-4eba-bf3e-052731d9839b'
UNION ALL
SELECT 'cashout_pending',     COUNT(*) FROM cashout_transactions WHERE status = 'pending';
