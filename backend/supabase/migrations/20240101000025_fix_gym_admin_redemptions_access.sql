-- Fix gym_admin access to redemptions table
-- The previous migration dropped gym_admin_own_redemptions but didn't recreate it with assigned_gym_id

-- Ensure helper functions exist (in case migration 20240101000017 wasn't run)
-- These functions are needed for RLS policies

CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN v_role = 'superadmin';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_gym_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN v_role = 'gym_owner';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_gym_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN v_role = 'gym_admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_receptionist(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN v_role = 'receptionist';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assigned_gym_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- SECURITY DEFINER functions bypass RLS, so this won't cause recursion
  SELECT assigned_gym_id FROM public.profiles WHERE id = p_user_id;
$$;

-- Drop old policy if it exists (shouldn't exist, but safe)
DROP POLICY IF EXISTS "gym_admin_own_redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Gym admins can view assigned gym redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Gym admins can manage assigned gym redemptions" ON public.redemptions;

-- Gym admins can view and update redemptions in their assigned gym
CREATE POLICY "Gym admins can manage assigned gym redemptions"
  ON public.redemptions FOR ALL
  USING (
    public.is_gym_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = redemptions.gym_id
    )
  );

-- Also ensure superadmin policy exists
DROP POLICY IF EXISTS "superadmin_all_redemptions" ON public.redemptions;

CREATE POLICY "superadmin_all_redemptions"
  ON public.redemptions FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym owners can view and update redemptions in their owned gyms
DROP POLICY IF EXISTS "Gym owners can manage owned gym redemptions" ON public.redemptions;

CREATE POLICY "Gym owners can manage owned gym redemptions"
  ON public.redemptions FOR ALL
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = redemptions.gym_id
      AND owner_id = auth.uid()
    )
  );

-- NOTE: We cannot add policies on profiles table that query profiles or redemptions
-- because it causes infinite recursion. Instead, we'll use service role client
-- in the application code to fetch profiles when loading redemptions.
-- The existing "Gym admins can view their gym profiles" policy already allows
-- gym admins to see profiles where home_gym_id matches their assigned_gym_id.
-- For users who made redemptions but don't have home_gym_id set, the application
-- will use service role client to fetch those profiles.
