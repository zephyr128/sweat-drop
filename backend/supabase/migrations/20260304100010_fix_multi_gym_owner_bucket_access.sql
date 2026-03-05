-- Migration: 20260304100010_fix_multi_gym_owner_bucket_access.sql
-- Description: Fixes RLS policies to support gym_owner with multiple gyms
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: gym_owner can own multiple gyms, but admin_gym_id only stores one
--          RLS policy fails when trying to upload to a gym that's not in admin_gym_id
-- Solution: Check gyms.owner_id directly for gym_owner, don't rely on admin_gym_id
-- 
-- CHANGES:
-- - Simplified gym_owner check to ONLY use gyms.owner_id (not admin_gym_id)
-- - This allows gym_owner to upload to ANY gym they own
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners can now upload badge images to any gym they own
-- 
-- BREAKING CHANGES:
-- - None (more permissive)

-- Drop existing policies
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- ============================================================================
-- INSERT POLICY - Upload permissions (multi-gym owner support)
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
      -- Gym owner: path must start with ANY gym_id where they are owner
      -- This is the key fix - check gyms.owner_id directly, not admin_gym_id
      (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_owner'
        AND EXISTS (
          SELECT 1 FROM public.gyms
          WHERE owner_id = auth.uid()
          AND id::text = split_part(name, '/', 1)
        )
      )
    )
  );

-- ============================================================================
-- UPDATE POLICY - Update permissions (multi-gym owner support)
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
        AND EXISTS (
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
        AND EXISTS (
          SELECT 1 FROM public.gyms
          WHERE owner_id = auth.uid()
          AND id::text = split_part(name, '/', 1)
        )
      )
    )
  );

-- ============================================================================
-- DELETE POLICY - Delete permissions (multi-gym owner support)
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
        AND EXISTS (
          SELECT 1 FROM public.gyms
          WHERE owner_id = auth.uid()
          AND id::text = split_part(name, '/', 1)
        )
      )
    )
  );
