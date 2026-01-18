-- Fix RLS for gyms table to allow regular users to view gyms
-- This ensures users can view gym details when accessing workout plans

-- Drop existing "Anyone can view gyms" policies if they exist
DROP POLICY IF EXISTS "Anyone can view gyms" ON public.gyms;
DROP POLICY IF EXISTS "Anyone can view active gyms" ON public.gyms;

-- Create a policy that allows anyone (including regular users) to view gyms
-- This is needed for SmartCoach feature where users need to see gym details
CREATE POLICY "Anyone can view gyms"
  ON public.gyms FOR SELECT
  USING (true);

-- Note: Other policies (superadmin, gym_admin, gym_owner) will still apply
-- This policy ensures that regular users can also view gyms
