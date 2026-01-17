-- Fix RLS for owner_branding table to allow all users to read branding
-- Branding is public information needed for mobile app theming

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "superadmin_all_owner_branding" ON public.owner_branding;
DROP POLICY IF EXISTS "gym_owner_own_branding" ON public.owner_branding;

-- Allow all authenticated users to read owner_branding (public branding info)
CREATE POLICY "users_can_read_owner_branding" ON public.owner_branding
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Superadmin can manage all branding
CREATE POLICY "superadmin_all_owner_branding" ON public.owner_branding
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym owners can update their own branding
CREATE POLICY "gym_owner_own_branding" ON public.owner_branding
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Gym owners can insert their own branding
CREATE POLICY "gym_owner_insert_own_branding" ON public.owner_branding
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
