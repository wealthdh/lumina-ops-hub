-- ─── cashout_transactions ────────────────────────────────────────────────────
-- Run this in your Supabase SQL editor (or via supabase db push).
-- Stores an immutable audit trail of every withdrawal.

create table if not exists public.cashout_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  method      text not null check (method in ('bank','card','crypto')),
  amount      numeric(12,2) not null check (amount > 0),
  status      text not null default 'pending' check (status in ('pending','completed','failed')),
  tx_id       text,                          -- Plaid transfer id / Stripe payout id / tx hash
  job_id      uuid references public.ops_jobs(id) on delete set null,
  network     text,                          -- crypto only: 'ethereum' | 'polygon' | 'bsc' | 'base'
  to_address  text,                          -- crypto only
  error_msg   text,                          -- populated on failure
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Row level security
alter table public.cashout_transactions enable row level security;

-- Users can only see their own transactions
create policy "Users can read own cashout transactions"
  on public.cashout_transactions for select
  using (auth.uid() = user_id);

-- Only backend (service role) can insert/update — front-end calls edge functions
create policy "Service role can manage cashout transactions"
  on public.cashout_transactions for all
  using (auth.role() = 'service_role');

-- Auto-update updated_at
create trigger cashout_transactions_updated_at
  before update on public.cashout_transactions
  for each row execute function update_updated_at();

-- Index for fast user lookups
create index if not exists cashout_transactions_user_id_idx
  on public.cashout_transactions (user_id, created_at desc);

-- Add to realtime publication so the UI can subscribe
alter publication supabase_realtime add table public.cashout_transactions;
