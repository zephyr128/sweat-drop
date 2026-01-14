-- SuperAdmin Exclusive Gym Control & Multi-Gym Owner Experience
-- This migration implements:
-- 1. SuperAdmin exclusive gym creation rights
-- 2. Gym Owner multi-gym switching
-- 3. Global branding per owner (not per gym)
-- 4. Gym suspension system

-- 1. Add columns to gyms table
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'Basic';

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_gyms_owner_id ON public.gyms(owner_id);
CREATE INDEX IF NOT EXISTS idx_gyms_is_suspended ON public.gyms(is_suspended);

-- 3. Update gym_branding table to link to owner_id instead of gym_id
-- First, create a new table structure
CREATE TABLE IF NOT EXISTS public.owner_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  primary_color TEXT DEFAULT '#00E5FF',
  logo_url TEXT,
  background_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Migrate existing branding data to owner_branding (if gym has owner)
INSERT INTO public.owner_branding (owner_id, primary_color, logo_url, background_url, created_at, updated_at)
SELECT DISTINCT
  g.owner_id,
  COALESCE(gb.primary_color, '#00E5FF'),
  gb.logo_url,
  gb.background_url,
  NOW(),
  NOW()
FROM public.gyms g
LEFT JOIN public.gym_branding gb ON g.id = gb.gym_id
WHERE g.owner_id IS NOT NULL
ON CONFLICT (owner_id) DO NOTHING;

-- 4. Helper function to check if user is gym owner
CREATE OR REPLACE FUNCTION public.is_gym_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gyms
    WHERE owner_id = p_user_id
  );
$$;

-- 5. Helper function to get all gym IDs owned by a user
CREATE OR REPLACE FUNCTION public.get_owned_gym_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ARRAY_AGG(id)::UUID[]
  FROM public.gyms
  WHERE owner_id = p_user_id AND is_suspended = false;
$$;

-- 6. Helper function to check if user owns a specific gym
CREATE OR REPLACE FUNCTION public.owns_gym(p_user_id UUID, p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gyms
    WHERE id = p_gym_id AND owner_id = p_user_id AND is_suspended = false
  );
$$;

-- 7. Function to suspend a gym (SuperAdmin only)
CREATE OR REPLACE FUNCTION public.suspend_gym(p_gym_id UUID, p_suspended_by UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is superadmin
  IF NOT public.is_superadmin(p_suspended_by) THEN
    RAISE EXCEPTION 'Only superadmin can suspend gyms';
  END IF;
  
  -- Update gym status
  UPDATE public.gyms
  SET is_suspended = true
  WHERE id = p_gym_id;
END;
$$;

-- 8. Function to activate a gym (SuperAdmin only)
CREATE OR REPLACE FUNCTION public.activate_gym(p_gym_id UUID, p_activated_by UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is superadmin
  IF NOT public.is_superadmin(p_activated_by) THEN
    RAISE EXCEPTION 'Only superadmin can activate gyms';
  END IF;
  
  -- Update gym status
  UPDATE public.gyms
  SET is_suspended = false
  WHERE id = p_gym_id;
END;
$$;

-- 9. Function to get gyms with owner info (for SuperAdmin dashboard)
CREATE OR REPLACE FUNCTION public.get_gyms_with_owner_info()
RETURNS TABLE (
  gym_id UUID,
  gym_name TEXT,
  city TEXT,
  country TEXT,
  owner_id UUID,
  owner_email TEXT,
  owner_name TEXT,
  is_suspended BOOLEAN,
  subscription_type TEXT,
  active_machines BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    g.id AS gym_id,
    g.name AS gym_name,
    g.city,
    g.country,
    g.owner_id,
    p.email AS owner_email,
    p.full_name AS owner_name,
    g.is_suspended,
    g.subscription_type,
    COUNT(DISTINCT m.id) AS active_machines
  FROM public.gyms g
  LEFT JOIN public.profiles p ON g.owner_id = p.id
  LEFT JOIN public.machines m ON g.id = m.gym_id AND m.is_under_maintenance = false
  GROUP BY g.id, g.name, g.city, g.country, g.owner_id, p.email, p.full_name, g.is_suspended, g.subscription_type
  ORDER BY g.name;
$$;

-- 10. Function to get network overview stats for a gym owner
CREATE OR REPLACE FUNCTION public.get_network_overview_stats(p_owner_id UUID)
RETURNS TABLE (
  total_gyms BIGINT,
  active_gyms BIGINT,
  suspended_gyms BIGINT,
  total_members BIGINT,
  total_drops_earned BIGINT,
  total_machines BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    COUNT(DISTINCT g.id) AS total_gyms,
    COUNT(DISTINCT CASE WHEN g.is_suspended = false THEN g.id END) AS active_gyms,
    COUNT(DISTINCT CASE WHEN g.is_suspended = true THEN g.id END) AS suspended_gyms,
    COUNT(DISTINCT gm.user_id) AS total_members,
    COALESCE(SUM(s.drops_earned), 0) AS total_drops_earned,
    COUNT(DISTINCT m.id) AS total_machines
  FROM public.gyms g
  LEFT JOIN public.gym_memberships gm ON g.id = gm.gym_id
  LEFT JOIN public.sessions s ON g.id = s.gym_id
  LEFT JOIN public.machines m ON g.id = m.gym_id
  WHERE g.owner_id = p_owner_id;
$$;

-- 11. Enable RLS on owner_branding table
ALTER TABLE public.owner_branding ENABLE ROW LEVEL SECURITY;

-- 12. RLS Policies for owner_branding
-- Superadmin can see all branding
CREATE POLICY "superadmin_all_owner_branding" ON public.owner_branding
  FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Gym owners can see and update their own branding
CREATE POLICY "gym_owner_own_branding" ON public.owner_branding
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 13. Update RLS policies for gyms table
-- Only superadmin can create gyms
DROP POLICY IF EXISTS "superadmin_create_gyms" ON public.gyms;
CREATE POLICY "superadmin_create_gyms" ON public.gyms
  FOR INSERT
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Only superadmin can update owner_id and is_suspended
-- Gym owners can update other fields of their gyms (if not suspended)
DROP POLICY IF EXISTS "gym_owner_update_own_gyms" ON public.gyms;
CREATE POLICY "gym_owner_update_own_gyms" ON public.gyms
  FOR UPDATE
  USING (
    public.is_superadmin(auth.uid()) OR
    (auth.uid() = owner_id AND is_suspended = false)
  )
  WITH CHECK (
    public.is_superadmin(auth.uid()) OR
    (auth.uid() = owner_id AND is_suspended = false)
  );

-- Gym owners can see their own gyms (if not suspended)
DROP POLICY IF EXISTS "gym_owner_see_own_gyms" ON public.gyms;
CREATE POLICY "gym_owner_see_own_gyms" ON public.gyms
  FOR SELECT
  USING (
    public.is_superadmin(auth.uid()) OR
    (auth.uid() = owner_id AND is_suspended = false)
  );

-- 14. Update RLS policies for machines (only active gyms)
DROP POLICY IF EXISTS "active_gym_machines_only" ON public.machines;
CREATE POLICY "active_gym_machines_only" ON public.machines
  FOR SELECT
  USING (
    public.is_superadmin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = machines.gym_id AND is_suspended = false
    )
  );

-- 15. Update RLS policies for challenges (only active gyms)
DROP POLICY IF EXISTS "active_gym_challenges_only" ON public.challenges;
CREATE POLICY "active_gym_challenges_only" ON public.challenges
  FOR SELECT
  USING (
    public.is_superadmin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = challenges.gym_id AND is_suspended = false
    )
  );

-- 16. Add index for owner_branding
CREATE INDEX IF NOT EXISTS idx_owner_branding_owner_id ON public.owner_branding(owner_id);

-- 17. Comments for documentation
COMMENT ON COLUMN public.gyms.owner_id IS 'Gym owner (user_id). Only SuperAdmin can assign owners when creating gyms.';
COMMENT ON COLUMN public.gyms.is_suspended IS 'If true, gym owner loses dashboard access and users cannot scan machines. SuperAdmin can toggle this.';
COMMENT ON COLUMN public.gyms.subscription_type IS 'Subscription plan type (e.g., Basic, Premium).';
COMMENT ON TABLE public.owner_branding IS 'Global branding settings per owner. Applies to all gyms owned by that owner.';
COMMENT ON FUNCTION public.suspend_gym IS 'SuperAdmin function to suspend a gym, making it inaccessible to owner and users';
COMMENT ON FUNCTION public.activate_gym IS 'SuperAdmin function to activate a suspended gym';
COMMENT ON FUNCTION public.get_network_overview_stats IS 'Get aggregated stats across all gyms owned by a user';
