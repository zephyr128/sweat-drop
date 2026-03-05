-- Migration: 20260304100007_simplify_gym_owner_bucket_access.sql
-- Description: Simplifies gym_owner bucket access by checking both owner_id and admin_gym_id
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: gym_owner cannot upload even though they should be able to
-- Solution: Check both gyms.owner_id AND profiles.admin_gym_id as fallback
-- 
-- CHANGES:
-- - Simplified gym_owner check to accept either owner_id match OR admin_gym_id match
-- - This handles cases where gym_owner might have admin_gym_id set
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
-- INSERT POLICY - Upload permissions (simplified)
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
      -- Gym owner: check if path starts with a gym_id where they are owner
      -- OR if they have admin_gym_id set and path matches it
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        (
          -- Option 1: Check gyms.owner_id
          EXISTS (
            SELECT 1 FROM public.gyms g
            WHERE g.owner_id = auth.uid()
            AND g.id::text = split_part(name, '/', 1)
          )
          OR
          -- Option 2: Fallback to admin_gym_id if set
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
        )
      )
    )
  );

-- ============================================================================
-- UPDATE POLICY - Update permissions (simplified)
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
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        (
          EXISTS (
            SELECT 1 FROM public.gyms g
            WHERE g.owner_id = auth.uid()
            AND g.id::text = split_part(name, '/', 1)
          )
          OR
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
          EXISTS (
            SELECT 1 FROM public.gyms g
            WHERE g.owner_id = auth.uid()
            AND g.id::text = split_part(name, '/', 1)
          )
          OR
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
        )
      )
    )
  );

-- ============================================================================
-- DELETE POLICY - Delete permissions (simplified)
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
      (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role = 'gym_owner'
        )
        AND
        (
          EXISTS (
            SELECT 1 FROM public.gyms g
            WHERE g.owner_id = auth.uid()
            AND g.id::text = split_part(name, '/', 1)
          )
          OR
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
        )
      )
    )
  );
