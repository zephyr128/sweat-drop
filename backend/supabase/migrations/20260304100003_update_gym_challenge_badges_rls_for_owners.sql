-- Migration: 20260304100003_update_gym_challenge_badges_rls_for_owners.sql
-- Description: Updates RLS policies for gym-challenge-badges bucket to include gym_owner role
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- CHANGES:
-- - Updated policies to allow gym_owner role in addition to gym_admin
-- - Gym owners can upload/update/delete badges for their gyms
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners can now upload badge images to gym-challenge-badges bucket
-- 
-- BREAKING CHANGES:
-- - None (additive only)

-- Drop existing policies
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- Recreate policies with gym_owner support

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
  );
