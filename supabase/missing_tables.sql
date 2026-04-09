-- UGC Creatives Table
-- Stores UGC video content library for campaigns
CREATE TABLE IF NOT EXISTS ugc_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  platform text DEFAULT 'TikTok',
  status text DEFAULT 'draft' CHECK (status IN ('live', 'testing', 'draft', 'paused')),
  views integer DEFAULT 0,
  ctr numeric(5,2) DEFAULT 0,
  roas numeric(6,2) DEFAULT 0,
  tool text DEFAULT 'Kling',
  video_url text,
  thumbnail_url text,
  caption text,
  platform_ready boolean DEFAULT false,
  distributed_to text[] DEFAULT '{}',
  generation_prompt text,
  api_provider text DEFAULT 'kling',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Distribution Log Table
-- Tracks content distribution across platforms
CREATE TABLE IF NOT EXISTS distribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creative_id uuid NOT NULL REFERENCES ugc_creatives(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  post_url text,
  post_id text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Platform Connections Table
-- Stores OAuth connections to social/platform accounts
CREATE TABLE IF NOT EXISTS platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  platform_user_id text,
  platform_username text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  scopes text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- SEO Keywords Table
-- Tracks SEO keyword positions and metrics
CREATE TABLE IF NOT EXISTS seo_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  position integer,
  volume integer,
  difficulty integer,
  url text,
  updated_at timestamptz DEFAULT now()
);

-- MT5 Snapshots Table
-- Stores historical snapshots of MT5 account data
CREATE TABLE IF NOT EXISTS mt5_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text,
  balance numeric(12,2),
  equity numeric(12,2),
  margin numeric(12,2),
  free_margin numeric(12,2),
  profit numeric(12,2),
  open_trades integer DEFAULT 0,
  snapshot_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE ugc_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ugc_creatives
CREATE POLICY "Allow users to view their own ugc_creatives"
  ON ugc_creatives
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to insert their own ugc_creatives"
  ON ugc_creatives
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to update their own ugc_creatives"
  ON ugc_creatives
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to delete their own ugc_creatives"
  ON ugc_creatives
  FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- RLS Policies for distribution_log
CREATE POLICY "Allow users to view their own distribution_log"
  ON distribution_log
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to insert their own distribution_log"
  ON distribution_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to update their own distribution_log"
  ON distribution_log
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to delete their own distribution_log"
  ON distribution_log
  FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- RLS Policies for platform_connections
CREATE POLICY "Allow users to view their own platform_connections"
  ON platform_connections
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to insert their own platform_connections"
  ON platform_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to update their own platform_connections"
  ON platform_connections
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to delete their own platform_connections"
  ON platform_connections
  FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- RLS Policies for seo_keywords
CREATE POLICY "Allow users to view their own seo_keywords"
  ON seo_keywords
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to insert their own seo_keywords"
  ON seo_keywords
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to update their own seo_keywords"
  ON seo_keywords
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to delete their own seo_keywords"
  ON seo_keywords
  FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- RLS Policies for mt5_snapshots
CREATE POLICY "Allow users to view their own mt5_snapshots"
  ON mt5_snapshots
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to insert their own mt5_snapshots"
  ON mt5_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to update their own mt5_snapshots"
  ON mt5_snapshots
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow users to delete their own mt5_snapshots"
  ON mt5_snapshots
  FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Create indexes for performance optimization
CREATE INDEX idx_ugc_creatives_user_id ON ugc_creatives(user_id);
CREATE INDEX idx_ugc_creatives_created_at ON ugc_creatives(created_at);

CREATE INDEX idx_distribution_log_user_id ON distribution_log(user_id);
CREATE INDEX idx_distribution_log_created_at ON distribution_log(created_at);
CREATE INDEX idx_distribution_log_creative_id ON distribution_log(creative_id);

CREATE INDEX idx_platform_connections_user_id ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_created_at ON platform_connections(created_at);

CREATE INDEX idx_seo_keywords_user_id ON seo_keywords(user_id);
CREATE INDEX idx_seo_keywords_updated_at ON seo_keywords(updated_at);

CREATE INDEX idx_mt5_snapshots_user_id ON mt5_snapshots(user_id);
CREATE INDEX idx_mt5_snapshots_snapshot_at ON mt5_snapshots(snapshot_at);

-- Enable Realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE ugc_creatives;
ALTER PUBLICATION supabase_realtime ADD TABLE distribution_log;
