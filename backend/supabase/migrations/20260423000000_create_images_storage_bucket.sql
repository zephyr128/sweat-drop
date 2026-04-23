-- Migration: 20260423000000_create_images_storage_bucket.sql
-- Description: Creates the 'images' storage bucket and sets up RLS policies for prod.
--
-- AGENT NOTE: [2026-04-23] - supabase-dba
--
-- CHANGES:
-- - Created storage bucket: images (public)
-- - Re-applied RLS policies for images bucket (idempotent)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Unblocks image upload/display (logo, backgrounds)
-- - Admin Panel: Unblocks branding asset uploads
--
-- BREAKING CHANGES:
-- - None
--
-- NEXT STEPS:
-- 1. Run: cd backend && supabase db push
-- 2. Verify bucket appears in Supabase Dashboard > Storage

-- 1. Create the bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  10485760,  -- 10 MB
  ARRAY['image/*']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policies (idempotent — drop first, then recreate)
DROP POLICY IF EXISTS "images_public_read"            ON storage.objects;
DROP POLICY IF EXISTS "images_authenticated_upload"   ON storage.objects;
DROP POLICY IF EXISTS "images_authenticated_update"   ON storage.objects;
DROP POLICY IF EXISTS "images_authenticated_delete"   ON storage.objects;

-- Anyone (including anon) can read from the images bucket
CREATE POLICY "images_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'images');

-- Only authenticated users can upload
CREATE POLICY "images_authenticated_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
  );

-- Only authenticated users can update
CREATE POLICY "images_authenticated_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
  );

-- Only authenticated users can delete
CREATE POLICY "images_authenticated_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
  );
