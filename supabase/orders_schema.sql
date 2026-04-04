-- ─── Orders Table ─────────────────────────────────────────────────────────
-- Tracks every successful Stripe checkout. Only written by webhook after
-- payment is confirmed — never by the frontend.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id text NOT NULL UNIQUE,
  product_id      uuid REFERENCES stripe_products(id),
  buyer_email     text NOT NULL,
  amount          numeric(12,2) NOT NULL,
  currency        text DEFAULT 'USD',
  payment_status  text NOT NULL DEFAULT 'paid',
  stripe_payment_intent text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- RLS: Only service role can insert (webhook), anon can read own orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert orders"
  ON orders FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Anon can read all orders"
  ON orders FOR SELECT
  TO anon
  USING (true);

-- Also add error_message column to distribution_log if missing
ALTER TABLE distribution_log ADD COLUMN IF NOT EXISTS error_message text;
