-- Migration: 20260304100011_create_bucket_and_fix_rls.sql
-- Description: Creates bucket if missing and fixes RLS using SECURITY DEFINER function
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: RLS policies might not work correctly because auth.uid() in storage context
--          might not have access to public.profiles or public.gyms tables
-- Solution: Create SECURITY DEFINER helper function to check ownership
-- 
-- CHANGES:
-- - Creates bucket if it doesn't exist
-- - Creates SECURITY DEFINER function to check gym ownership
-- - Updates RLS policies to use the helper function
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners can now upload badge images reliably
-- 
-- BREAKING CHANGES:
-- - None

-- ============================================================================
-- 1. Create bucket if it doesn't exist
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gym-challenge-badges',
  'gym-challenge-badges',
  true, -- Public bucket for badge images
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Create SECURITY DEFINER helper function to check gym ownership
-- ============================================================================
CREATE OR REPLACE FUNCTION public.can_upload_to_gym_challenge_bucket(
  p_user_id UUID,
  p_gym_id_text TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role user_role;
  v_admin_gym_id UUID;
  v_gym_id UUID;
BEGIN
  -- Get user role and admin_gym_id
  SELECT role, admin_gym_id INTO v_role, v_admin_gym_id
  FROM public.profiles
  WHERE id = p_user_id;
  
  -- If user doesn't exist, deny access
  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- Superadmin can upload anywhere
  IF v_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Try to parse gym_id from text
  BEGIN
    v_gym_id := p_gym_id_text::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- Invalid UUID format
    RETURN false;
  END;
  
  -- Gym admin: check if admin_gym_id matches
  IF v_role = 'gym_admin' THEN
    RETURN v_admin_gym_id = v_gym_id;
  END IF;
  
  -- Gym owner: check if they own this gym
  IF v_role = 'gym_owner' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = v_gym_id
      AND owner_id = p_user_id
    );
  END IF;
  
  -- All other roles: deny access
  RETURN false;
END;
$$;

-- ============================================================================
-- 3. Drop existing policies
-- ============================================================================
DROP POLICY IF EXISTS "Gym admin can upload gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can update gym challenge badges" ON storage.objects;
DROP POLICY IF EXISTS "Gym admin can delete gym challenge badges" ON storage.objects;

-- ============================================================================
-- 4. Create new policies using SECURITY DEFINER function
-- ============================================================================

-- INSERT POLICY
CREATE POLICY "Gym admin can upload gym challenge badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    public.can_upload_to_gym_challenge_bucket(
      auth.uid(),
      split_part(name, '/', 1)
    )
  );

-- UPDATE POLICY
CREATE POLICY "Gym admin can update gym challenge badges"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    public.can_upload_to_gym_challenge_bucket(
      auth.uid(),
      split_part(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    public.can_upload_to_gym_challenge_bucket(
      auth.uid(),
      split_part(name, '/', 1)
    )
  );

-- DELETE POLICY
CREATE POLICY "Gym admin can delete gym challenge badges"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    public.can_upload_to_gym_challenge_bucket(
      auth.uid(),
      split_part(name, '/', 1)
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION public.can_upload_to_gym_challenge_bucket IS 
  'SECURITY DEFINER function to check if a user can upload to gym-challenge-badges bucket. '
  'Uses SECURITY DEFINER to bypass RLS on profiles and gyms tables. '
  'Returns true if user is superadmin, gym_admin with matching admin_gym_id, '
  'or gym_owner who owns the gym specified in the path.';
