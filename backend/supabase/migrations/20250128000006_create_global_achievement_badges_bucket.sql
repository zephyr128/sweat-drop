-- Migration: 20250128000006_create_global_achievement_badges_bucket.sql
-- Description: Creates RLS policies for global-achievement-badges Storage bucket
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Added RLS policies: Superadmin can upload, Anyone can view
-- 
-- IMPORTANT: Bucket must be created manually before running this migration!
-- 
-- To create the bucket:
-- 1. Go to Supabase Dashboard → Storage → Create a new bucket
-- 2. Name: 'global-achievement-badges'
-- 3. Public: Yes (for public read access)
-- 4. File size limit: 1MB (or as needed)
-- 5. Allowed MIME types: image/png, image/jpeg, image/jpg, image/webp, image/svg+xml
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Superadmin can upload badge images to global-achievement-badges bucket
-- - Mobile App: Can access badge images via public URLs
-- 
-- BREAKING CHANGES:
-- - None (RLS policies only)
-- 
-- NEXT STEPS:
-- 1. Create bucket manually in Supabase Dashboard (see instructions above)
-- 2. Run: supabase db reset (or apply migration)
-- 3. Test: Upload badge image as superadmin
-- 4. Verify: Public URL access works

-- Note: Bucket must be created manually in Supabase Dashboard before running this migration
-- This migration only creates RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Anyone can view global badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can upload global badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can update global badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can delete global badges" ON storage.objects;

-- Storage Policies for global-achievement-badges bucket

-- Anyone can view global badges (public bucket)
CREATE POLICY "Anyone can view global badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'global-achievement-badges');

-- Only superadmin can upload global achievement badges
CREATE POLICY "Superadmin can upload global badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'global-achievement-badges' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Only superadmin can update global achievement badges
CREATE POLICY "Superadmin can update global badges"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'global-achievement-badges' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Only superadmin can delete global achievement badges
CREATE POLICY "Superadmin can delete global badges"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'global-achievement-badges' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Comments
COMMENT ON TABLE storage.buckets IS 'Storage buckets for Supabase Storage. global-achievement-badges bucket stores badge images for global achievements.';

-- Note: Public URL format:
-- https://{supabase_project_id}.supabase.co/storage/v1/object/public/global-achievement-badges/{achievement_code}-badge.png
-- 
-- Path structure:
-- global-achievement-badges/
--   ├── first_workout-badge.png
--   ├── thousand_drops-badge.png
--   ├── ten_day_streak-badge.png
--   └── ...
