-- ─── Supabase Storage — Lead Documents bucket ─────────────────────────────────
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rjtxkjozlhvnxkzmqffk/sql/new
--
-- Creates the public 'lead-documents' bucket for proposals & contracts.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-documents',
  'lead-documents',
  true,   -- public so lead can view proposal without auth
  5242880, -- 5MB limit
  ARRAY['text/html', 'application/pdf', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can read public bucket files
CREATE POLICY "Public read lead-documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lead-documents');

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Auth users upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lead-documents'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
