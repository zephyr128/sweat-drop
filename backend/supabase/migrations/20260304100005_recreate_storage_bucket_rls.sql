-- Migration: 20260304100005_recreate_storage_bucket_rls.sql
-- Description: Recreates RLS policies for both storage buckets
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- CHANGES:
-- - Recreates RLS policies for global-achievement-badges bucket
-- - Recreates RLS policies for gym-challenge-badges bucket
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Superadmin can upload to global-achievement-badges
-- - Admin Panel: Gym admin and gym owner can upload to gym-challenge-badges
-- - Mobile App: Can access badge images via public URLs
-- 
-- BREAKING CHANGES:
-- - None (recreation only)

-- ============================================================================
-- GLOBAL ACHIEVEMENT BADGES BUCKET
-- ============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Anyone can view global badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can upload global badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can update global badges" ON storage.objects;
DROP POLICY IF EXISTS "Superadmin can delete global badges" ON storage.objects;

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

-- ============================================================================
-- GYM CHALLENGE BADGES BUCKET
-- ============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Anyone can view gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- Anyone can view gym challenge badges (public bucket)
CREATE POLICY "Anyone can view gym challenge badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-challenge-badges');

-- Gym admins and gym owners can upload badges for their gym
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
      -- Gym admin can upload to their own gym folder (via admin_gym_id)
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
      -- Gym owner can upload to their owned gym folder (via gyms.owner_id)
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
        EXISTS (
          SELECT 1 FROM public.gyms
          WHERE owner_id = auth.uid()
          AND id::text = split_part(name, '/', 1)
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
