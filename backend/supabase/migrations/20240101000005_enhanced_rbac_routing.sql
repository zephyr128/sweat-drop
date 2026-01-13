-- Enhanced RBAC System with Gym Admin Update Permissions
-- This migration enhances the existing RBAC system to support proper multi-tenant routing

-- 1. Update gyms RLS policies to allow gym_admin UPDATE
DROP POLICY IF EXISTS "gym_admin_own_gym" ON public.gyms;

-- Gym admins can SELECT and UPDATE their own gym
CREATE POLICY "gym_admin_own_gym" ON public.gyms
  FOR SELECT
  USING (
    public.get_admin_gym_id(auth.uid()) = id
  );

CREATE POLICY "gym_admin_update_own_gym" ON public.gyms
  FOR UPDATE
  USING (
    public.is_gym_admin(auth.uid()) AND
    public.get_admin_gym_id(auth.uid()) = id
  )
  WITH CHECK (
    public.is_gym_admin(auth.uid()) AND
    public.get_admin_gym_id(auth.uid()) = id
  );

-- 2. Ensure gym_id is properly indexed for performance
CREATE INDEX IF NOT EXISTS idx_challenges_gym_id ON public.challenges(gym_id);
CREATE INDEX IF NOT EXISTS idx_rewards_gym_id ON public.rewards(gym_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_gym_id ON public.redemptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_sessions_gym_id ON public.sessions(gym_id);

-- 3. Function to create gym admin user (for server actions)
CREATE OR REPLACE FUNCTION public.create_gym_admin(
  p_email TEXT,
  p_password TEXT,
  p_username TEXT,
  p_gym_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_profile_id UUID;
BEGIN
  -- This function should be called from a server action that creates the auth user first
  -- For now, we'll just create the profile entry
  -- The actual auth user creation must happen in Next.js server action
  
  -- Check if gym exists
  IF NOT EXISTS (SELECT 1 FROM public.gyms WHERE id = p_gym_id) THEN
    RAISE EXCEPTION 'Gym with id % does not exist', p_gym_id;
  END IF;
  
  -- Check if user already exists (by email in profiles)
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE email = p_email;
  
  IF v_profile_id IS NOT NULL THEN
    -- Update existing profile
    UPDATE public.profiles
    SET 
      role = 'gym_admin',
      admin_gym_id = p_gym_id,
      username = COALESCE(p_username, username)
    WHERE id = v_profile_id;
    
    RETURN v_profile_id;
  ELSE
    -- Profile will be created by trigger or manually
    -- This function assumes the auth user already exists
    RAISE EXCEPTION 'User with email % does not exist in auth.users. Create auth user first.', p_email;
  END IF;
END;
$$;

-- 4. Function to check if user can access a specific gym (for routing)
CREATE OR REPLACE FUNCTION public.can_access_gym(p_user_id UUID, p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    CASE 
      WHEN public.is_superadmin(p_user_id) THEN true
      WHEN public.get_admin_gym_id(p_user_id) = p_gym_id THEN true
      ELSE false
    END;
$$;

-- 5. Add constraint to ensure gym_admin has admin_gym_id
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS check_gym_admin_has_gym_id;

ALTER TABLE public.profiles
  ADD CONSTRAINT check_gym_admin_has_gym_id
  CHECK (
    (role = 'gym_admin' AND admin_gym_id IS NOT NULL) OR
    (role != 'gym_admin')
  );

-- 6. Add constraint to ensure superadmin has NULL admin_gym_id
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS check_superadmin_no_gym_id;

ALTER TABLE public.profiles
  ADD CONSTRAINT check_superadmin_no_gym_id
  CHECK (
    (role = 'superadmin' AND admin_gym_id IS NULL) OR
    (role != 'superadmin')
  );

-- 7. Comments
COMMENT ON FUNCTION public.create_gym_admin IS 'Helper function to assign gym_admin role to a user. Auth user must be created first via Supabase Auth API.';
COMMENT ON FUNCTION public.can_access_gym IS 'Check if a user can access a specific gym (superadmin can access all, gym_admin only their own)';
