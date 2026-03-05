-- Migration: 20260304100008_fix_gym_owner_bucket_final.sql
-- Description: Final fix for gym_owner bucket access - more permissive check
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: gym_owner cannot upload even with correct ownership
-- Solution: Make the check more permissive and add explicit role check
-- 
-- CHANGES:
-- - Simplified EXISTS checks to avoid nested subqueries
-- - Added explicit role check first, then gym ownership
-- - Made the logic more straightforward
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners should now be able to upload badge images
-- 
-- BREAKING CHANGES:
-- - None (more permissive)

-- Drop existing policies
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- ============================================================================
-- INSERT POLICY - Upload permissions (final simplified version)
-- ============================================================================
CREATE POLICY "Gym admin can upload gym challenge badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    (
      -- Superadmin can upload anywhere
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
      OR
      -- Gym admin: path must start with their admin_gym_id
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_admin'
        AND (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
        AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
      )
      OR
      -- Gym owner: check if path starts with a gym_id where they are owner
      -- OR if they have admin_gym_id set and path matches it
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_owner'
        AND
        (
          -- Check if any gym has this user as owner and the path matches
          EXISTS (
            SELECT 1 FROM public.gyms
            WHERE owner_id = auth.uid()
            AND id::text = split_part(name, '/', 1)
          )
          OR
          -- Fallback: check admin_gym_id if set
          (
            (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
            AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
          )
        )
      )
    )
  );

-- ============================================================================
-- UPDATE POLICY - Update permissions (final simplified version)
-- ============================================================================
CREATE POLICY "Gym admin can update gym challenge badges"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
      OR
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_admin'
        AND (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
        AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
      )
      OR
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_owner'
        AND
        (
          EXISTS (
            SELECT 1 FROM public.gyms
            WHERE owner_id = auth.uid()
            AND id::text = split_part(name, '/', 1)
          )
          OR
          (
            (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
            AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
          )
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
      OR
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_admin'
        AND (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
        AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
      )
      OR
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_owner'
        AND
        (
          EXISTS (
            SELECT 1 FROM public.gyms
            WHERE owner_id = auth.uid()
            AND id::text = split_part(name, '/', 1)
          )
          OR
          (
            (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
            AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
          )
        )
      )
    )
  );

-- ============================================================================
-- DELETE POLICY - Delete permissions (final simplified version)
-- ============================================================================
CREATE POLICY "Gym admin can delete gym challenge badges"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
      OR
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_admin'
        AND (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
        AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
      )
      OR
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_owner'
        AND
        (
          EXISTS (
            SELECT 1 FROM public.gyms
            WHERE owner_id = auth.uid()
            AND id::text = split_part(name, '/', 1)
          )
          OR
          (
            (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
            AND split_part(name, '/', 1) = (SELECT admin_gym_id::text FROM public.profiles WHERE id = auth.uid())
          )
        )
      )
    )
  );
