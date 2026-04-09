-- ============================================================
-- ⚠️  WARNING: THIS FILE CONTAINS FABRICATED TEST DATA
-- ⚠️  DO NOT RUN IN PRODUCTION — for testing only
--
-- LUMINA OPS HUB — Inject Today's Income for All 10 Jobs
--
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ONLY for testing the UI. Delete seed data before going live.
--
-- Uses ACTUAL UUID job IDs from the live ops_jobs table.
-- Column names match live DB: amount, entry_date (DATE), reference_id
--
-- UUID → Job mapping (verified from live DB 2026-04-01):
--   69db5463-8a7f-4638-93bd-1eb576bd79f1  AI UGC Factory
--   376dcb4f-baf5-47b8-8e17-eeb0452f6978  Liquidity Sniper (MT5)
--   61818d52-9389-43d5-b950-29b987888773  Vibe-Code Website Agency
--   47e07a86-e062-4c9b-bccb-23e2d2662297  Polymarket Edge Trader
--   e6a33a97-01be-4ff5-8b5d-54e459d26423  AI Lead-to-Cash Funnel
--   68a344e7-a27d-4df4-939f-289450723182  Cross-Market Arb Bridge
--   150b3863-e7f1-4e1d-885f-f98089c7c285  Tax Shield Vault
--   7a74e473-39d4-4ebc-b78c-cc1939836515  Content SEO Swarm
--   d22d8482-a226-4921-9dd7-bd16f8b46a3b  Consulting Sprint Retainer
--   ab2ac10b-8cd3-4c65-b679-a06442b18bf9  Synergy Brain Optimizer
--
-- Safe to re-run — deletes today's entries first, then re-inserts.
-- 7-day history uses ON CONFLICT DO NOTHING (idempotent).
-- ============================================================

DO $$
DECLARE
  uid UUID;
BEGIN
  -- Auto-detect first user (Darrell's account)
  SELECT id INTO uid FROM auth.users ORDER BY created_at ASC LIMIT 1;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user found. Create an account first via the app, then re-run this script.';
  END IF;

  RAISE NOTICE 'Seeding income for user: %', uid;

  -- ─── Delete all seed entries for this user (idempotent re-run) ──────────
  -- Matches by reference_id prefix 'seed-' so re-running is safe
  DELETE FROM income_entries
  WHERE user_id = uid
    AND reference_id LIKE 'seed-%';

  -- ─── Insert today's income for all 10 jobs (UUID job IDs) ────────────────
  INSERT INTO income_entries
    (user_id, job_id, amount, source, reference_id, description, entry_date)
  VALUES
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1240.00, 'manual',     'seed-ugc-today',      'AI UGC Factory — today earnings',           CURRENT_DATE),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  842.00, 'mt5',        'seed-liq-today',      'Liquidity Sniper MT5 — daily P&L',          CURRENT_DATE),
    (uid, '61818d52-9389-43d5-b950-29b987888773',  620.00, 'consulting', 'seed-vibe-today',     'Vibe-Code Website Agency — client payment', CURRENT_DATE),
    (uid, '47e07a86-e062-4c9b-bccb-23e2d2662297',  510.00, 'polymarket', 'seed-poly-today',     'Polymarket Edge Trader — settled markets',  CURRENT_DATE),
    (uid, 'e6a33a97-01be-4ff5-8b5d-54e459d26423',  490.00, 'stripe',     'seed-funnel-today',   'AI Lead-to-Cash Funnel — retainer',         CURRENT_DATE),
    (uid, '68a344e7-a27d-4df4-939f-289450723182',  380.00, 'crypto',     'seed-arb-today',      'Cross-Market Arb Bridge — settled arb',     CURRENT_DATE),
    (uid, '150b3863-e7f1-4e1d-885f-f98089c7c285',  290.00, 'crypto',     'seed-tax-today',      'Tax Shield Vault — yield rewards',          CURRENT_DATE),
    (uid, '7a74e473-39d4-4ebc-b78c-cc1939836515',  260.00, 'affiliate',  'seed-seo-today',      'Content SEO Swarm — affiliate commissions', CURRENT_DATE),
    (uid, 'd22d8482-a226-4921-9dd7-bd16f8b46a3b',  200.00, 'consulting', 'seed-consult-today',  'Consulting Sprint Retainer — Meridian Tech',CURRENT_DATE),
    (uid, 'ab2ac10b-8cd3-4c65-b679-a06442b18bf9',  180.00, 'manual',     'seed-synergy-today',  'Synergy Brain Optimizer — auto-tasks',      CURRENT_DATE);

  -- ─── 7-day history (ON CONFLICT DO NOTHING — idempotent) ─────────────────
  INSERT INTO income_entries
    (user_id, job_id, amount, source, reference_id, description, entry_date)
  VALUES
    -- Yesterday (D-1)
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1180.00, 'manual',     'seed-ugc-d1',     'AI UGC Factory — D-1',           CURRENT_DATE - 1),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  796.00, 'mt5',        'seed-liq-d1',     'Liquidity Sniper MT5 — D-1',      CURRENT_DATE - 1),
    (uid, '61818d52-9389-43d5-b950-29b987888773',  590.00, 'consulting', 'seed-vibe-d1',    'Vibe-Code Agency — D-1',          CURRENT_DATE - 1),
    (uid, '47e07a86-e062-4c9b-bccb-23e2d2662297',  480.00, 'polymarket', 'seed-poly-d1',    'Polymarket Edge Trader — D-1',    CURRENT_DATE - 1),
    (uid, 'e6a33a97-01be-4ff5-8b5d-54e459d26423',  460.00, 'stripe',     'seed-funnel-d1',  'AI Funnel — D-1',                 CURRENT_DATE - 1),
    -- D-2
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1310.00, 'manual',     'seed-ugc-d2',     'AI UGC Factory — D-2',           CURRENT_DATE - 2),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  880.00, 'mt5',        'seed-liq-d2',     'Liquidity Sniper MT5 — D-2',     CURRENT_DATE - 2),
    (uid, '61818d52-9389-43d5-b950-29b987888773',  640.00, 'consulting', 'seed-vibe-d2',    'Vibe-Code Agency — D-2',         CURRENT_DATE - 2),
    -- D-3
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1090.00, 'manual',     'seed-ugc-d3',     'AI UGC Factory — D-3',           CURRENT_DATE - 3),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  720.00, 'mt5',        'seed-liq-d3',     'Liquidity Sniper MT5 — D-3',     CURRENT_DATE - 3),
    (uid, '47e07a86-e062-4c9b-bccb-23e2d2662297',  530.00, 'polymarket', 'seed-poly-d3',    'Polymarket Edge Trader — D-3',   CURRENT_DATE - 3),
    -- D-4
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1150.00, 'manual',     'seed-ugc-d4',     'AI UGC Factory — D-4',           CURRENT_DATE - 4),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  810.00, 'mt5',        'seed-liq-d4',     'Liquidity Sniper MT5 — D-4',     CURRENT_DATE - 4),
    (uid, '68a344e7-a27d-4df4-939f-289450723182',  360.00, 'crypto',     'seed-arb-d4',     'Cross-Market Arb Bridge — D-4',  CURRENT_DATE - 4),
    -- D-5
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1200.00, 'manual',     'seed-ugc-d5',     'AI UGC Factory — D-5',           CURRENT_DATE - 5),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  830.00, 'mt5',        'seed-liq-d5',     'Liquidity Sniper MT5 — D-5',     CURRENT_DATE - 5),
    (uid, '61818d52-9389-43d5-b950-29b987888773',  600.00, 'consulting', 'seed-vibe-d5',    'Vibe-Code Agency — D-5',         CURRENT_DATE - 5),
    -- D-6
    (uid, '69db5463-8a7f-4638-93bd-1eb576bd79f1', 1270.00, 'manual',     'seed-ugc-d6',     'AI UGC Factory — D-6',           CURRENT_DATE - 6),
    (uid, '376dcb4f-baf5-47b8-8e17-eeb0452f6978',  860.00, 'mt5',        'seed-liq-d6',     'Liquidity Sniper MT5 — D-6',     CURRENT_DATE - 6)
  ;  -- Historical entries already cleared above — simple INSERT, no conflict needed

  RAISE NOTICE 'Income seeded! Today: $5,012 across 10 jobs. 7-day history injected.';
  RAISE NOTICE 'Refresh the dashboard — live earnings should now show across all job cards.';

END $$;
