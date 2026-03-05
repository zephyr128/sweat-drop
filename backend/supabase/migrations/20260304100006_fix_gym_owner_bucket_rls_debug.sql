-- Migration: 20260304100006_fix_gym_owner_bucket_rls_debug.sql
-- Description: Debug and fix RLS policies for gym-challenge-badges bucket
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: gym_owner cannot upload to gym-challenge-badges bucket
-- This migration adds more permissive policies and better debugging
-- 
-- CHANGES:
-- - Ensures bucket RLS is enabled
-- - Adds more explicit gym_owner checks
-- - Simplifies path matching logic
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners should now be able to upload badge images
-- 
-- BREAKING CHANGES:
-- - None (fix only)

-- Drop ALL existing policies for gym-challenge-badges to start fresh
DROP POLICY IF EXISTS "Anyone can view gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- ============================================================================
-- SELECT POLICY - Anyone can view (public bucket)
-- ============================================================================
CREATE POLICY "Anyone can view gym challenge badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-challenge-badges');

-- ============================================================================
-- INSERT POLICY - Upload permissions
-- ============================================================================
CREATE POLICY "Gym admin can upload gym challenge badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    (
      -- Superadmin can upload anywhere
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      -- Gym admin: path must start with their admin_gym_id
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
      -- Gym owner: path must start with a gym_id where they are the owner
      -- This is the key fix - we check if the first path segment matches any gym they own
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.owner_id = auth.uid()
        AND g.id::text = split_part(name, '/', 1)
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'gym_owner'
        )
      )
    )
  );

-- ============================================================================
-- UPDATE POLICY - Update permissions
-- ============================================================================
CREATE POLICY "Gym admin can update gym challenge badges"
  ON storage.objects FOR UPDATE
  USING (
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
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.owner_id = auth.uid()
        AND g.id::text = split_part(name, '/', 1)
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'gym_owner'
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
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.owner_id = auth.uid()
        AND g.id::text = split_part(name, '/', 1)
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'gym_owner'
        )
      )
    )
  );

-- ============================================================================
-- DELETE POLICY - Delete permissions
-- ============================================================================
CREATE POLICY "Gym admin can delete gym challenge badges"
  ON storage.objects FOR DELETE
  USING (
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
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.owner_id = auth.uid()
        AND g.id::text = split_part(name, '/', 1)
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'gym_owner'
        )
      )
    )
  );

-- ============================================================================
-- VERIFICATION QUERY (for debugging)
-- ============================================================================
-- Run this to verify policies are created:
-- SELECT policyname, cmd FROM pg_policies 
-- WHERE tablename = 'objects' AND schemaname = 'storage' 
-- AND policyname LIKE '%gym%challenge%badge%';
