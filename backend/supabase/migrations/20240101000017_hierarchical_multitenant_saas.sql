-- Hierarchical Multi-Tenant SaaS Model
-- Refactors the system to support: SuperAdmin > GymOwner > GymAdmin > Receptionist

-- 1. Ensure user_role enum has all required values
-- Note: If enum already exists, this will be a no-op
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('superadmin', 'gym_owner', 'gym_admin', 'receptionist', 'user');
  ELSE
    -- Add missing enum values if they don't exist
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gym_owner';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2. Drop all existing policies and functions that depend on admin_gym_id
-- Drop policies that reference admin_gym_id
DROP POLICY IF EXISTS "Gym admins can view challenge progress for their gym" ON public.user_challenge_progress;
DROP POLICY IF EXISTS "Gym staff can view gym redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Gym staff can update gym redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Gym owners can view their gym machines" ON public.machines;
DROP POLICY IF EXISTS "Gym owners can update their gym machines" ON public.machines;
DROP POLICY IF EXISTS "Gym admins can view their gym machines" ON public.machines;
DROP POLICY IF EXISTS "Gym admins can update their gym machines" ON public.machines;
DROP POLICY IF EXISTS "Gym admins can view assigned gym machines" ON public.machines;
DROP POLICY IF EXISTS "Gym admins can update assigned gym machines" ON public.machines;
DROP POLICY IF EXISTS "superadmin_all_gyms" ON public.gyms;
DROP POLICY IF EXISTS "gym_admin_own_gym" ON public.gyms;
DROP POLICY IF EXISTS "gym_admin_update_own_gym" ON public.gyms;
DROP POLICY IF EXISTS "receptionist_own_gym" ON public.gyms;
DROP POLICY IF EXISTS "superadmin_all_branding" ON public.gym_branding;
DROP POLICY IF EXISTS "gym_admin_own_branding" ON public.gym_branding;
DROP POLICY IF EXISTS "superadmin_all_leaderboard_rewards" ON public.leaderboard_rewards;
DROP POLICY IF EXISTS "gym_admin_own_leaderboard_rewards" ON public.leaderboard_rewards;
DROP POLICY IF EXISTS "superadmin_all_redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "gym_admin_own_redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "receptionist_manage_redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "superadmin_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "gym_admin_gym_profiles" ON public.profiles;
DROP POLICY IF EXISTS "receptionist_gym_profiles" ON public.profiles;
DROP POLICY IF EXISTS "superadmin_all_sessions" ON public.sessions;
DROP POLICY IF EXISTS "gym_admin_gym_sessions" ON public.sessions;
DROP POLICY IF EXISTS "receptionist_gym_sessions" ON public.sessions;

-- Drop functions that reference admin_gym_id
DROP FUNCTION IF EXISTS public.get_admin_gym_id(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.has_gym_access(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_access_gym(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_gym_admin(TEXT, TEXT, TEXT, UUID) CASCADE;

-- Drop constraints that reference admin_gym_id
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS check_gym_admin_has_gym_id,
  DROP CONSTRAINT IF EXISTS check_superadmin_no_gym_id;

-- 3. Update profiles table structure
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS admin_gym_id,
  ADD COLUMN IF NOT EXISTS assigned_gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL; -- For gym_owner role

-- Note: gyms table updates are handled in step 7 below
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS branding_id UUID; -- Will reference owner_branding or gym_branding

-- 7. Update gyms table to ensure owner_id exists and add status
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS branding_id UUID; -- Will reference owner_branding or gym_branding

-- 8. Create index for owner_id in gyms
CREATE INDEX IF NOT EXISTS idx_gyms_owner_id ON public.gyms(owner_id);
CREATE INDEX IF NOT EXISTS idx_gyms_status ON public.gyms(status);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_gym_id ON public.profiles(assigned_gym_id);
CREATE INDEX IF NOT EXISTS idx_profiles_owner_id ON public.profiles(owner_id);

-- 9. Update owner_branding to support global branding per owner
-- If owner_branding doesn't exist, create it
CREATE TABLE IF NOT EXISTS public.owner_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  primary_color TEXT DEFAULT '#00E5FF',
  logo_url TEXT,
  background_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 10. Helper functions for role checking
-- These functions use SECURITY DEFINER to bypass RLS and avoid recursion
-- CRITICAL: These functions query profiles, so they MUST use SECURITY DEFINER
-- and the policies that call them must be on DIFFERENT tables, not profiles
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
  -- SECURITY DEFINER bypasses RLS, so this query won't trigger policies
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

-- 11. Function to get owned gym IDs for a gym owner
CREATE OR REPLACE FUNCTION public.get_owned_gym_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ARRAY_AGG(id)
  FROM public.gyms
  WHERE owner_id = p_user_id
  AND status = 'active';
$$;

-- 12. Function to check if user owns a gym
CREATE OR REPLACE FUNCTION public.owns_gym(p_user_id UUID, p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gyms
    WHERE id = p_gym_id
    AND owner_id = p_user_id
  );
$$;

-- 13. Function to check if gym is active
CREATE OR REPLACE FUNCTION public.is_gym_active(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gyms
    WHERE id = p_gym_id
    AND status = 'active'
  );
$$;

-- Function to get assigned_gym_id (bypasses RLS to avoid recursion)
-- This function must use SECURITY DEFINER to bypass RLS when called from policies
-- IMPORTANT: This function queries profiles, so it must be SECURITY DEFINER
-- and must be called from policies that don't recursively call it
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

-- 14. Drop existing RLS policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Superadmins can view all profiles" ON public.profiles;

-- 15. New RLS policies for profiles
-- IMPORTANT: Keep policies simple to avoid recursion
-- Functions with SECURITY DEFINER should bypass RLS, but we'll keep policies minimal

-- Users can view their own profile (no function calls, avoids recursion)
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Superadmins can view all profiles
-- is_superadmin uses SECURITY DEFINER so it bypasses RLS
-- If recursion still occurs, the function itself needs to be fixed
CREATE POLICY "Superadmins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Gym owners can view profiles of users in their gyms
-- Query gyms directly (not profiles) to avoid recursion
-- Note: We check gyms.owner_id = auth.uid() which doesn't query profiles
CREATE POLICY "Gym owners can view their gym profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms
        WHERE gyms.owner_id = auth.uid()
        AND (
          profiles.assigned_gym_id = gyms.id
          OR profiles.home_gym_id = gyms.id
        )
    )
  );

-- Gym admins can view profiles of users in their assigned gym
-- Use get_assigned_gym_id function (SECURITY DEFINER) to avoid recursion
-- Note: WITH CHECK is only for INSERT/UPDATE, not SELECT
CREATE POLICY "Gym admins can view their gym profiles"
  ON public.profiles FOR SELECT
  USING (
    public.get_assigned_gym_id(auth.uid()) IS NOT NULL
    AND (
      profiles.assigned_gym_id = public.get_assigned_gym_id(auth.uid())
      OR profiles.home_gym_id = public.get_assigned_gym_id(auth.uid())
    )
  );

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Superadmins can update any profile
CREATE POLICY "Superadmins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_superadmin(auth.uid()));

-- 16. Update RLS policies for gyms
DROP POLICY IF EXISTS "Superadmins can manage all gyms" ON public.gyms;
DROP POLICY IF EXISTS "Gym admins can manage their gym" ON public.gyms;
DROP POLICY IF EXISTS "Anyone can view active gyms" ON public.gyms;

-- Superadmins can do everything with gyms
CREATE POLICY "Superadmins can manage all gyms"
  ON public.gyms FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym owners can view and update their owned gyms
CREATE POLICY "Gym owners can manage owned gyms"
  ON public.gyms FOR SELECT
  USING (
    public.is_gym_owner(auth.uid())
    AND owner_id = auth.uid()
  );

CREATE POLICY "Gym owners can update owned gyms"
  ON public.gyms FOR UPDATE
  USING (
    public.is_gym_owner(auth.uid())
    AND owner_id = auth.uid()
  );

-- Gym admins can view their assigned gym
CREATE POLICY "Gym admins can view assigned gym"
  ON public.gyms FOR SELECT
  USING (
    public.is_gym_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = gyms.id
    )
  );

-- Anyone can view active gyms (for mobile app)
CREATE POLICY "Anyone can view active gyms"
  ON public.gyms FOR SELECT
  USING (status = 'active');

-- 17. Update RLS policies for machines
-- Keep existing policies but update to use new role functions
DROP POLICY IF EXISTS "Gym owners can view their gym machines" ON public.machines;
DROP POLICY IF EXISTS "Gym owners can update their gym machines" ON public.machines;

-- Gym owners can view machines in their gyms
CREATE POLICY "Gym owners can view owned gym machines"
  ON public.machines FOR SELECT
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = machines.gym_id
      AND owner_id = auth.uid()
    )
  );

-- Gym owners can update machines in their gyms (name/type only enforced in app)
CREATE POLICY "Gym owners can update owned gym machines"
  ON public.machines FOR UPDATE
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = machines.gym_id
      AND owner_id = auth.uid()
    )
  );

-- Gym admins can view machines in their assigned gym
CREATE POLICY "Gym admins can view assigned gym machines"
  ON public.machines FOR SELECT
  USING (
    public.is_gym_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = machines.gym_id
    )
  );

-- Gym admins can update machines in their assigned gym (name/type only)
CREATE POLICY "Gym admins can update assigned gym machines"
  ON public.machines FOR UPDATE
  USING (
    public.is_gym_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = machines.gym_id
    )
  );

-- 18. Update RLS policies for challenges
-- Drop existing policies first
DROP POLICY IF EXISTS "Gym owners can manage owned gym challenges" ON public.challenges;
DROP POLICY IF EXISTS "Gym admins can manage assigned gym challenges" ON public.challenges;

-- Gym owners can manage challenges in their gyms
CREATE POLICY "Gym owners can manage owned gym challenges"
  ON public.challenges FOR ALL
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = challenges.gym_id
      AND owner_id = auth.uid()
    )
  );

-- Gym admins can manage challenges in their assigned gym
CREATE POLICY "Gym admins can manage assigned gym challenges"
  ON public.challenges FOR ALL
  USING (
    public.is_gym_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = challenges.gym_id
    )
  );

-- 19. Update RLS policies for rewards (store items)
-- Drop existing policies first
DROP POLICY IF EXISTS "Gym owners can manage owned gym rewards" ON public.rewards;
DROP POLICY IF EXISTS "Gym admins can manage assigned gym rewards" ON public.rewards;
DROP POLICY IF EXISTS "Receptionists can view assigned gym rewards" ON public.rewards;

-- Gym owners can manage rewards in their gyms
CREATE POLICY "Gym owners can manage owned gym rewards"
  ON public.rewards FOR ALL
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = rewards.gym_id
      AND owner_id = auth.uid()
    )
  );

-- Gym admins can manage rewards in their assigned gym
CREATE POLICY "Gym admins can manage assigned gym rewards"
  ON public.rewards FOR ALL
  USING (
    public.is_gym_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = rewards.gym_id
    )
  );

-- Receptionists can only view rewards (for redemptions)
CREATE POLICY "Receptionists can view assigned gym rewards"
  ON public.rewards FOR SELECT
  USING (
    public.is_receptionist(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = rewards.gym_id
    )
  );

-- 20. Update RLS policies for redemptions
-- Drop existing policies first
DROP POLICY IF EXISTS "Receptionists can manage assigned gym redemptions" ON public.redemptions;

-- Receptionists can view and update redemptions in their assigned gym
CREATE POLICY "Receptionists can manage assigned gym redemptions"
  ON public.redemptions FOR ALL
  USING (
    public.is_receptionist(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND assigned_gym_id = redemptions.gym_id
    )
  );

-- 21. Comments
COMMENT ON COLUMN public.profiles.assigned_gym_id IS 'Gym assigned to gym_admin or receptionist (null for superadmin/gym_owner)';
COMMENT ON COLUMN public.profiles.owner_id IS 'For gym_owner role: references the primary gym they own';
COMMENT ON COLUMN public.gyms.owner_id IS 'Gym owner (gym_owner role user) who manages this gym';
COMMENT ON COLUMN public.gyms.status IS 'Gym status: active or suspended (kill-switch)';
COMMENT ON FUNCTION public.get_owned_gym_ids(UUID) IS 'Returns array of gym IDs owned by a gym owner';
COMMENT ON FUNCTION public.owns_gym(UUID, UUID) IS 'Checks if user owns a specific gym';
