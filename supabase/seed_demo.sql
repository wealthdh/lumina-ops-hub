-- ============================================================
-- Demo seed data — run after schema.sql + rls_policies.sql
-- Replace 'YOUR_USER_UUID' with your actual Supabase user ID
-- (find it in Auth → Users in your Supabase dashboard)
-- ============================================================

DO $$
DECLARE
  uid UUID := 'YOUR_USER_UUID';  -- ← Replace this
  job1 UUID := uuid_generate_v4();
  job2 UUID := uuid_generate_v4();
  job3 UUID := uuid_generate_v4();
BEGIN

-- MT5 Account
INSERT INTO mt5_accounts VALUES (
  '100023891', 48250, 49880.32, 1200, 48680.32, 4156.69,
  1630.32, 842.50, 3210.00, 12450.00, now(), uid
) ON CONFLICT (account_id) DO NOTHING;

-- Jobs
INSERT INTO ops_jobs (id, name, category, status, daily_profit, monthly_profit, projected_monthly, synergy_score, risk_score, roi, user_id) VALUES
  (job1, 'AI UGC Factory',        'ai-ugc',   'active',  1240, 37200, 42000, 92, 22, 480, uid),
  (job2, 'Liquidity Sniper (MT5)','trading',  'active',  842,  25260, 28000, 88, 45, 310, uid),
  (job3, 'Vibe-Code Website Agency','dev',    'active',  620,  18600, 22000, 74, 18, 240, uid)
ON CONFLICT (id) DO NOTHING;

-- Tasks
INSERT INTO auto_tasks (job_id, title, priority, status, assigned_to, user_id) VALUES
  (job1, 'Launch 3 new UGC ad creatives (Arcads)', 'high',     'in_progress', 'ai', uid),
  (job2, 'Optimize XAUUSD Kelly fraction',          'critical', 'pending',     'ai', uid),
  (job3, 'Deliver RevolutionFit.com build',         'critical', 'in_progress', 'ai', uid);

-- Tax pot
INSERT INTO tax_pot (balance, target_rate, quarterly_estimate, next_due_date, ytd_income, ytd_set_aside, projected_tax_bill, user_id)
VALUES (28400, 32, 18200, '2026-04-15', 89000, 28480, 26800, uid)
ON CONFLICT (user_id) DO NOTHING;

-- Today's briefing
INSERT INTO daily_briefings (date, summary, top_priorities, alerts, pnl_mt5, pnl_poly, pnl_total, user_id)
VALUES (
  CURRENT_DATE,
  'Strong week. MT5 up $842 today. Polymarket Fed position in profit. BrightEdge proposal ready. Tax pot 32% funded.',
  ARRAY[
    'Execute BTC/Poly cross-market arb (3.2% edge)',
    'Send BrightEdge LLC proposal + Loom video',
    'Review XAUUSD Kelly fraction'
  ],
  '[{"type":"opportunity","message":"Fed rate cut market: 4.1% edge","urgency":"high"},{"type":"action","message":"Q2 tax estimate due in 14 days","urgency":"high"}]'::jsonb,
  842, 1240, 2082, uid
) ON CONFLICT (user_id, date) DO NOTHING;

END $$;
