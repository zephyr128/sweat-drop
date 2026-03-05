-- Migration: 20260304100004_fix_gym_owner_bucket_access.sql
-- Description: Fixes RLS policies for gym-challenge-badges bucket to properly support gym_owner
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: gym_owner role cannot upload to gym-challenge-badges bucket
-- Solution: Simplify gym_owner check to use gyms.owner_id directly
-- 
-- CHANGES:
-- - Simplified gym_owner access check to use gyms.owner_id = auth.uid()
-- - Removed complex admin_gym_id check for gym_owner (gym_owner uses gyms.owner_id)
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners can now upload badge images to gym-challenge-badges bucket
-- 
-- BREAKING CHANGES:
-- - None (fix only)

-- Drop existing policies
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- Recreate policies with simplified gym_owner check

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
