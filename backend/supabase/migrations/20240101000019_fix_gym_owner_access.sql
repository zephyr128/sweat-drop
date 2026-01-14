-- Fix Gym Owner Access to Data
-- This migration adds RLS policies to allow gym owners to access their gym's data

-- 1. Add RLS policies for sessions table (gym owners)
DROP POLICY IF EXISTS "Gym owners can view owned gym sessions" ON public.sessions;

CREATE POLICY "Gym owners can view owned gym sessions"
  ON public.sessions FOR SELECT
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = sessions.gym_id
      AND owner_id = auth.uid()
    )
  );

-- 2. Add RLS policies for gym_memberships table (gym owners)
DROP POLICY IF EXISTS "Gym owners can view owned gym memberships" ON public.gym_memberships;

CREATE POLICY "Gym owners can view owned gym memberships"
  ON public.gym_memberships FOR SELECT
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = gym_memberships.gym_id
      AND owner_id = auth.uid()
    )
  );

-- 3. Add RLS policies for redemptions table (gym owners)
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

-- 4. Add RLS policies for user_challenge_progress table (gym owners)
DROP POLICY IF EXISTS "Gym owners can view owned gym challenge progress" ON public.user_challenge_progress;

CREATE POLICY "Gym owners can view owned gym challenge progress"
  ON public.user_challenge_progress FOR SELECT
  USING (
    public.is_gym_owner(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = user_challenge_progress.gym_id
      AND owner_id = auth.uid()
    )
  );

-- 5. Comments
COMMENT ON POLICY "Gym owners can view owned gym sessions" ON public.sessions IS 'Allows gym owners to view sessions from their owned gyms';
COMMENT ON POLICY "Gym owners can view owned gym memberships" ON public.gym_memberships IS 'Allows gym owners to view memberships in their owned gyms';
COMMENT ON POLICY "Gym owners can manage owned gym redemptions" ON public.redemptions IS 'Allows gym owners to view and manage redemptions in their owned gyms';
COMMENT ON POLICY "Gym owners can view owned gym challenge progress" ON public.user_challenge_progress IS 'Allows gym owners to view challenge progress in their owned gyms';
