-- Migration: 20260424000000_create_user_avatars_storage_bucket.sql
-- Description: Creates RLS policies for user-avatars Storage bucket (sport avatar catalog)
-- 
-- AGENT NOTE: [2026-04-24] - supabase-dba
-- 
-- CHANGES:
-- - Added RLS policies: Superadmin can upload/update/delete, Anyone can view
-- 
-- IMPORTANT: Bucket must be created manually before running this migration!
-- (Same caveat as global-achievement-badges bucket — Supabase CLI bucket INSERT
--  via SQL is unreliable on hosted instances; Dashboard creation is required.)
-- 
-- To create the bucket:
-- 1. Go to Supabase Dashboard → Storage → Create a new bucket
-- 2. Name: 'user-avatars'
-- 3. Public: Yes (avatar URLs appear on leaderboards and friend lists)
-- 4. File size limit: 512 KB (524288 bytes — each sport avatar PNG is ~30–60 KB)
-- 5. Allowed MIME types: image/png, image/webp, image/svg+xml
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Phase 3 onboarding avatar picker reads from this bucket
-- - Admin Panel: No direct changes needed (superadmin uploads via Phase 2 script)
-- 
-- BREAKING CHANGES:
-- - None (RLS policies only; bucket is new)
-- 
-- NEXT STEPS:
-- 1. Create bucket manually in Supabase Dashboard (see instructions above)
-- 2. Run: supabase db push
-- 3. Phase 2: run pnpm avatars:generate, review 48 PNGs, then pnpm avatars:upload
-- 4. Phase 3: mobile-coder refactors onboarding avatar picker

-- Drop existing policies if they exist (idempotent re-runs)
DROP POLICY IF EXISTS "Anyone can view user avatars" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can upload user avatars" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can update user avatars" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can delete user avatars" ON storage.objects;

-- Storage Policies for user-avatars bucket

-- Anyone (anon + authenticated) can read sport avatar catalog files
CREATE POLICY "Anyone can view user avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-avatars');

-- Only superadmin can upload sport avatar PNGs
CREATE POLICY "Superadmin can upload user avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-avatars' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Only superadmin can replace / re-generate sport avatar PNGs
CREATE POLICY "Superadmin can update user avatars"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-avatars' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Only superadmin can remove sport avatar PNGs
CREATE POLICY "Superadmin can delete user avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-avatars' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Note: Public URL format:
-- https://{supabase_project_id}.supabase.co/storage/v1/object/public/user-avatars/{activity}_{color}.png
--
-- Catalog path structure (48 files — 12 activities × 4 color schemes):
-- user-avatars/
--   ├── weightlifting_cyan.png
--   ├── weightlifting_amber.png
--   ├── weightlifting_emerald.png
--   ├── weightlifting_crimson.png
--   ├── running_cyan.png
--   ├── ... (44 more)
--   └── crossfit_crimson.png
