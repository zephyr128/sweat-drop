-- Migration: 20260304100002_create_gym_challenge_badges_bucket_rls.sql
-- Description: Creates RLS policies for gym-challenge-badges Storage bucket
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- CHANGES:
-- - Added RLS policies: Public read, Gym admins can upload/update/delete for their gym
-- 
-- IMPORTANT: Bucket must be created manually before running this migration!
-- 
-- To create the bucket:
-- 1. Go to Supabase Dashboard → Storage → Create a new bucket
-- 2. Name: 'gym-challenge-badges'
-- 3. Public: Yes (for public read access - allows mobile app to display badges)
-- 4. File size limit: 1MB (or as needed)
-- 5. Allowed MIME types: image/png, image/jpeg, image/jpg, image/webp, image/svg+xml
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym admins can upload badge images to gym-challenge-badges bucket
-- - Mobile App: Can access badge images via public URLs
-- 
-- BREAKING CHANGES:
-- - None (RLS policies only)
-- 
-- NEXT STEPS:
-- 1. Create bucket manually in Supabase Dashboard (see instructions above)
-- 2. Run: supabase db push
-- 3. Test: Upload badge image as gym admin
-- 4. Verify: Public URL access works

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Anyone can view gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can manage gym challenge badges" ON storage.objects;

-- Storage Policies for gym-challenge-badges bucket

-- Anyone can view gym challenge badges (public bucket)
CREATE POLICY "Anyone can view gym challenge badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-challenge-badges');

-- Gym admins and gym owners can upload badges for their gym
-- Path structure: {gym_id}/{filename}
-- The gym_id in the path must match the admin's admin_gym_id or owner's gym
CREATE POLICY "Gym admin can upload gym challenge badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    (
      -- Superadmin can upload to any gym folder
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      -- Gym admin can upload to their own gym folder
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_admin'
          AND admin_gym_id IS NOT NULL
        )
        AND
        -- Extract gym_id from path: {gym_id}/{filename}
        -- split_part(name, '/', 1) gets the first segment (gym_id)
        split_part(name, '/', 1) = (
          SELECT admin_gym_id::text FROM public.profiles
          WHERE id = auth.uid()
        )
      )
      OR
      -- Gym owner can upload to their owned gym folder
      -- Check both admin_gym_id (if set) and gyms.owner_id
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        (
          -- If admin_gym_id is set, use it
          (
            EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
              AND admin_gym_id IS NOT NULL
            )
            AND
            split_part(name, '/', 1) = (
              SELECT admin_gym_id::text FROM public.profiles
              WHERE id = auth.uid()
            )
          )
          OR
          -- Otherwise check if gym is owned by this user
          EXISTS (
            SELECT 1 FROM public.gyms
            WHERE owner_id = auth.uid()
            AND id::text = split_part(name, '/', 1)
          )
        )
      )
    )
  );

-- Gym admins and gym owners can update badges for their gym
CREATE POLICY "Gym admin can update gym challenge badges"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    (
      -- Superadmin can update any gym's badges
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      -- Gym admin can update their own gym's badges
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_admin'
          AND admin_gym_id IS NOT NULL
        )
        AND
        split_part(name, '/', 1) = (
          SELECT admin_gym_id::text FROM public.profiles
          WHERE id = auth.uid()
        )
      )
      OR
      -- Gym owner can update their owned gym's badges
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        (
          (
            EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
              AND admin_gym_id IS NOT NULL
            )
            AND
            split_part(name, '/', 1) = (
              SELECT admin_gym_id::text FROM public.profiles
              WHERE id = auth.uid()
            )
          )
          OR
          EXISTS (
            SELECT 1 FROM public.gyms
            WHERE owner_id = auth.uid()
            AND id::text = split_part(name, '/', 1)
          )
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_admin'
          AND admin_gym_id IS NOT NULL
        )
        AND
        split_part(name, '/', 1) = (
          SELECT admin_gym_id::text FROM public.profiles
          WHERE id = auth.uid()
        )
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        EXISTS (
          SELECT 1 FROM public.gyms
          WHERE owner_id = auth.uid()
          AND id::text = split_part(name, '/', 1)
        )
      )
    )
  );

-- Gym admins and gym owners can delete badges for their gym
CREATE POLICY "Gym admin can delete gym challenge badges"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    (
      -- Superadmin can delete any gym's badges
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      -- Gym admin can delete their own gym's badges
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_admin'
          AND admin_gym_id IS NOT NULL
        )
        AND
        split_part(name, '/', 1) = (
          SELECT admin_gym_id::text FROM public.profiles
          WHERE id = auth.uid()
        )
      )
      OR
      -- Gym owner can delete their owned gym's badges
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        EXISTS (
          SELECT 1 FROM public.gyms
          WHERE owner_id = auth.uid()
          AND id::text = split_part(name, '/', 1)
        )
      )
    )
  );

-- Note: Public URL format:
-- https://{supabase_project_id}.supabase.co/storage/v1/object/public/gym-challenge-badges/{gym_id}/{challenge_id}-badge.png
-- 
-- Path structure:
-- gym-challenge-badges/
--   ├── {gym_id}/
--   │   ├── {challenge_id}-badge.png
--   │   ├── {challenge_id}-badge.jpg
--   │   └── ...
--   └── ...
