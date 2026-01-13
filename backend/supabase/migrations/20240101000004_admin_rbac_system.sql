-- SweatDrop Admin RBAC System
-- Multi-tenant admin dashboard with three access levels: superadmin, gym_admin, receptionist

-- 1. Create role enum
CREATE TYPE user_role AS ENUM ('superadmin', 'gym_admin', 'receptionist', 'user');

-- 2. Add role and admin_gym_id to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user' NOT NULL,
  ADD COLUMN IF NOT EXISTS admin_gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;

-- 3. Create gym_branding table (if not exists from previous migration)
CREATE TABLE IF NOT EXISTS public.gym_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE UNIQUE NOT NULL,
  primary_color TEXT DEFAULT '#00E5FF', -- Default cyan
  logo_url TEXT,
  background_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Create leaderboard_rewards table (rewards for top 3 users)
CREATE TABLE IF NOT EXISTS public.leaderboard_rewards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  rank_position INTEGER NOT NULL CHECK (rank_position IN (1, 2, 3)),
  reward_name TEXT NOT NULL,
  reward_description TEXT,
  reward_type TEXT NOT NULL, -- 'coffee', 'protein', 'discount', 'merch', 'cash'
  value TEXT, -- e.g., "Free Coffee", "$50 Gift Card"
  is_active BOOLEAN DEFAULT true,
  period leaderboard_period DEFAULT 'monthly' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(gym_id, rank_position, period)
);

-- 5. Helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = p_user_id;
$$;

-- 6. Helper function to get user's admin gym_id
CREATE OR REPLACE FUNCTION public.get_admin_gym_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT admin_gym_id FROM public.profiles WHERE id = p_user_id;
$$;

-- 7. Helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'superadmin' FROM public.profiles WHERE id = p_user_id;
$$;

-- 8. Helper function to check if user is gym_admin
CREATE OR REPLACE FUNCTION public.is_gym_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'gym_admin' FROM public.profiles WHERE id = p_user_id;
$$;

-- 9. Helper function to check if user is receptionist
CREATE OR REPLACE FUNCTION public.is_receptionist(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'receptionist' FROM public.profiles WHERE id = p_user_id;
$$;

-- 10. Helper function to check if user has access to a gym
CREATE OR REPLACE FUNCTION public.has_gym_access(p_user_id UUID, p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    CASE 
      WHEN (SELECT role FROM public.profiles WHERE id = p_user_id) = 'superadmin' THEN true
      WHEN (SELECT admin_gym_id FROM public.profiles WHERE id = p_user_id) = p_gym_id THEN true
      ELSE false
    END;
$$;

-- 11. RLS Policies for gyms table
ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;

-- Superadmin can see all gyms
CREATE POLICY "superadmin_all_gyms" ON public.gyms
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can see their own gym
CREATE POLICY "gym_admin_own_gym" ON public.gyms
  FOR SELECT
  USING (
    public.get_admin_gym_id(auth.uid()) = id
  );

-- Receptionists can see their gym (read-only)
CREATE POLICY "receptionist_own_gym" ON public.gyms
  FOR SELECT
  USING (
    public.get_admin_gym_id(auth.uid()) = id
  );

-- 12. RLS Policies for gym_branding table
ALTER TABLE public.gym_branding ENABLE ROW LEVEL SECURITY;

-- Superadmin can manage all branding
CREATE POLICY "superadmin_all_branding" ON public.gym_branding
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can manage their gym's branding
CREATE POLICY "gym_admin_own_branding" ON public.gym_branding
  FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists can view their gym's branding (read-only)
CREATE POLICY "receptionist_view_branding" ON public.gym_branding
  FOR SELECT
  USING (
    public.is_receptionist(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- 13. RLS Policies for challenges table
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- Superadmin can manage all challenges
CREATE POLICY "superadmin_all_challenges" ON public.challenges
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can manage their gym's challenges
CREATE POLICY "gym_admin_own_challenges" ON public.challenges
  FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists cannot access challenges (no policy = no access)

-- 14. RLS Policies for rewards table (store items)
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- Superadmin can manage all rewards
CREATE POLICY "superadmin_all_rewards" ON public.rewards
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can manage their gym's rewards
CREATE POLICY "gym_admin_own_rewards" ON public.rewards
  FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists can view their gym's rewards (read-only)
CREATE POLICY "receptionist_view_rewards" ON public.rewards
  FOR SELECT
  USING (
    public.is_receptionist(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- 15. RLS Policies for leaderboard_rewards table
ALTER TABLE public.leaderboard_rewards ENABLE ROW LEVEL SECURITY;

-- Superadmin can manage all leaderboard rewards
CREATE POLICY "superadmin_all_leaderboard_rewards" ON public.leaderboard_rewards
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can manage their gym's leaderboard rewards
CREATE POLICY "gym_admin_own_leaderboard_rewards" ON public.leaderboard_rewards
  FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists cannot access leaderboard rewards (no policy = no access)

-- 16. RLS Policies for redemptions table
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Superadmin can see all redemptions
CREATE POLICY "superadmin_all_redemptions" ON public.redemptions
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can see their gym's redemptions
CREATE POLICY "gym_admin_own_redemptions" ON public.redemptions
  FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists can view and update their gym's redemptions
CREATE POLICY "receptionist_manage_redemptions" ON public.redemptions
  FOR ALL
  USING (
    public.is_receptionist(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- 17. RLS Policies for profiles table (admin access)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Superadmin can see all profiles
CREATE POLICY "superadmin_all_profiles" ON public.profiles
  FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can see profiles of users in their gym
CREATE POLICY "gym_admin_gym_profiles" ON public.profiles
  FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    home_gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists can see profiles of users in their gym (read-only)
CREATE POLICY "receptionist_gym_profiles" ON public.profiles
  FOR SELECT
  USING (
    public.is_receptionist(auth.uid()) AND
    home_gym_id = public.get_admin_gym_id(auth.uid())
  );

-- 18. RLS Policies for sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Superadmin can see all sessions
CREATE POLICY "superadmin_all_sessions" ON public.sessions
  FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can see sessions in their gym
CREATE POLICY "gym_admin_gym_sessions" ON public.sessions
  FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Receptionists can see sessions in their gym (read-only)
CREATE POLICY "receptionist_gym_sessions" ON public.sessions
  FOR SELECT
  USING (
    public.is_receptionist(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- 19. Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_admin_gym_id ON public.profiles(admin_gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_branding_gym_id ON public.gym_branding(gym_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rewards_gym_id ON public.leaderboard_rewards(gym_id);

-- 20. Comments for documentation
COMMENT ON TYPE user_role IS 'User role enum: superadmin (global access), gym_admin (single gym management), receptionist (check-in and redemptions), user (regular app user)';
COMMENT ON COLUMN public.profiles.role IS 'User role for RBAC access control';
COMMENT ON COLUMN public.profiles.admin_gym_id IS 'Gym ID that this admin/receptionist manages (NULL for superadmin and regular users)';
COMMENT ON TABLE public.gym_branding IS 'Gym branding settings (colors, logos, backgrounds) that affect mobile app theme';
COMMENT ON TABLE public.leaderboard_rewards IS 'Rewards for top 3 users in monthly leaderboard per gym';
