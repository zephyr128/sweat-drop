-- Fix RLS Recursion for workout_plans, workout_plan_items, active_subscriptions, and live_sessions
-- This migration fixes infinite recursion issues in RLS policies

-- 1. Drop ALL existing policies to ensure clean recreation
-- Drop workout_plans policies
DROP POLICY IF EXISTS "Anyone can view public plans" ON public.workout_plans;
DROP POLICY IF EXISTS "Gym members can view gym plans" ON public.workout_plans;
DROP POLICY IF EXISTS "Subscribed users can view their plans" ON public.workout_plans;
DROP POLICY IF EXISTS "Coaches can manage own plans" ON public.workout_plans;
DROP POLICY IF EXISTS "Gym admins can manage gym plans" ON public.workout_plans;
DROP POLICY IF EXISTS "Gym owners can manage owned gym plans" ON public.workout_plans;
DROP POLICY IF EXISTS "Superadmins can manage all plans" ON public.workout_plans;

-- Drop workout_plan_items policies
DROP POLICY IF EXISTS "Anyone can view items for accessible plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Anyone can view items for public plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Gym members can view items for gym plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Subscribed users can view items for their plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Coaches can manage items for own plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Gym admins can manage items for gym plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Gym owners can manage items for owned gym plans" ON public.workout_plan_items;
DROP POLICY IF EXISTS "Superadmins can manage all items" ON public.workout_plan_items;

-- Drop active_subscriptions policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.active_subscriptions;
DROP POLICY IF EXISTS "Coaches can view subscriptions to own plans" ON public.active_subscriptions;
DROP POLICY IF EXISTS "Gym admins can view subscriptions to gym plans" ON public.active_subscriptions;
DROP POLICY IF EXISTS "Gym owners can view subscriptions to owned gym plans" ON public.active_subscriptions;
DROP POLICY IF EXISTS "Superadmins can view all subscriptions" ON public.active_subscriptions;
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.active_subscriptions;

-- Drop live_sessions policies
DROP POLICY IF EXISTS "Users can manage own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Coaches can view live sessions for own plans" ON public.live_sessions;
DROP POLICY IF EXISTS "Gym admins can view live sessions for gym plans" ON public.live_sessions;
DROP POLICY IF EXISTS "Gym owners can view live sessions for owned gym plans" ON public.live_sessions;
DROP POLICY IF EXISTS "Superadmins can view all live sessions" ON public.live_sessions;

-- 2. Ensure helper functions exist (some may have been dropped in previous migrations)
CREATE OR REPLACE FUNCTION public.is_gym_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'gym_owner' FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_gym_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT admin_gym_id FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_gym_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'gym_admin' FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'superadmin' FROM public.profiles WHERE id = p_user_id;
$$;

-- Note: get_owned_gym_ids(UUID) already exists from migration 20240101000014 (returns UUID[])
-- We use = ANY() in policies below to work with the array return type

-- 3. Recreate workout_plans policies (NO reference to active_subscriptions to avoid recursion)
-- Public plans: Anyone can view
CREATE POLICY "Anyone can view public plans"
  ON public.workout_plans FOR SELECT
  USING (is_active = true AND access_level = 'public');

-- Gym members can view gym_members_only plans from their gym
CREATE POLICY "Gym members can view gym plans"
  ON public.workout_plans FOR SELECT
  USING (
    is_active = true AND
    access_level = 'gym_members_only' AND
    gym_id = (SELECT home_gym_id FROM public.profiles WHERE id = auth.uid())
  );

-- Coaches can view and manage their own plans
CREATE POLICY "Coaches can manage own plans"
  ON public.workout_plans FOR ALL
  USING (coach_id = auth.uid());

-- Gym admins can view and manage their gym's plans
CREATE POLICY "Gym admins can manage gym plans"
  ON public.workout_plans FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Gym owners can view and manage plans for gyms they own
CREATE POLICY "Gym owners can manage owned gym plans"
  ON public.workout_plans FOR ALL
  USING (
    public.is_gym_owner(auth.uid()) AND
    gym_id = ANY(public.get_owned_gym_ids(auth.uid()))
  );

-- Superadmins can manage all plans
CREATE POLICY "Superadmins can manage all plans"
  ON public.workout_plans FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- NOTE: "Subscribed users can view their plans" policy removed to avoid recursion
-- Mobile app will check active_subscriptions separately if needed

-- 4. Recreate workout_plan_items policies (direct checks, no subquery to active_subscriptions)
-- Anyone can view items for public plans
CREATE POLICY "Anyone can view items for public plans"
  ON public.workout_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_plans
      WHERE id = workout_plan_items.plan_id
        AND is_active = true
        AND access_level = 'public'
    )
  );

-- Gym members can view items for gym_members_only plans
CREATE POLICY "Gym members can view items for gym plans"
  ON public.workout_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_plans wp
      WHERE wp.id = workout_plan_items.plan_id
        AND wp.is_active = true
        AND wp.access_level = 'gym_members_only'
        AND wp.gym_id IN (
          SELECT home_gym_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

-- Coaches can manage items for their plans
CREATE POLICY "Coaches can manage items for own plans"
  ON public.workout_plan_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_plans
      WHERE id = workout_plan_items.plan_id
        AND coach_id = auth.uid()
    )
  );

-- Gym admins can manage items for their gym's plans
CREATE POLICY "Gym admins can manage items for gym plans"
  ON public.workout_plan_items FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.workout_plans
      WHERE id = workout_plan_items.plan_id
        AND gym_id = public.get_admin_gym_id(auth.uid())
    )
  );

-- Gym owners can manage items for plans in gyms they own
CREATE POLICY "Gym owners can manage items for owned gym plans"
  ON public.workout_plan_items FOR ALL
  USING (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.workout_plans
      WHERE id = workout_plan_items.plan_id
        AND gym_id = ANY(public.get_owned_gym_ids(auth.uid()))
    )
  );

-- Superadmins can manage all items
CREATE POLICY "Superadmins can manage all items"
  ON public.workout_plan_items FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- 5. Recreate active_subscriptions policies (NO subquery to workout_plans that references active_subscriptions)
-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.active_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Coaches can view subscriptions to their plans (direct coach_id check, no workout_plans subquery)
-- This avoids recursion: we check plan_id's coach_id/gym_id through a separate helper approach
-- For now, coaches see subscriptions where plan_id matches their coach_id
-- We'll use a helper function that bypasses RLS for plan lookup
CREATE OR REPLACE FUNCTION public.get_plan_owner(plan_id UUID)
RETURNS TABLE(coach_id UUID, gym_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT coach_id, gym_id FROM public.workout_plans WHERE id = plan_id;
$$;

-- Coaches can view subscriptions to their plans (using SECURITY DEFINER function)
CREATE POLICY "Coaches can view subscriptions to own plans"
  ON public.workout_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.active_subscriptions
      WHERE plan_id = workout_plans.id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Wait, that's wrong. Let me fix active_subscriptions properly:
DROP POLICY IF EXISTS "Coaches can view subscriptions to own plans" ON public.workout_plans;

-- Coaches can view subscriptions to their plans (using helper function to avoid RLS recursion)
CREATE POLICY "Coaches can view subscriptions to own plans"
  ON public.active_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.get_plan_owner(active_subscriptions.plan_id) p
      WHERE p.coach_id = auth.uid()
    )
  );

-- Gym admins can view subscriptions to their gym's plans
CREATE POLICY "Gym admins can view subscriptions to gym plans"
  ON public.active_subscriptions FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.get_plan_owner(active_subscriptions.plan_id) p
      WHERE p.gym_id = public.get_admin_gym_id(auth.uid())
    )
  );

-- Gym owners can view subscriptions to plans in gyms they own
CREATE POLICY "Gym owners can view subscriptions to owned gym plans"
  ON public.active_subscriptions FOR SELECT
  USING (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.get_plan_owner(active_subscriptions.plan_id) p
      WHERE p.gym_id = ANY(public.get_owned_gym_ids(auth.uid()))
    )
  );

-- Superadmins can view all subscriptions
CREATE POLICY "Superadmins can view all subscriptions"
  ON public.active_subscriptions FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage own subscriptions"
  ON public.active_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- 6. Recreate live_sessions policies (using helper function to avoid recursion)
-- Users can view and manage their own live sessions
CREATE POLICY "Users can manage own live sessions"
  ON public.live_sessions FOR ALL
  USING (user_id = auth.uid());

-- Coaches can view live sessions for their plans
CREATE POLICY "Coaches can view live sessions for own plans"
  ON public.live_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.get_plan_owner(live_sessions.plan_id) p
      WHERE p.coach_id = auth.uid()
    )
  );

-- Gym admins can view live sessions for their gym's plans
CREATE POLICY "Gym admins can view live sessions for gym plans"
  ON public.live_sessions FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.get_plan_owner(live_sessions.plan_id) p
      WHERE p.gym_id = public.get_admin_gym_id(auth.uid())
    )
  );

-- Gym owners can view live sessions for plans in gyms they own
CREATE POLICY "Gym owners can view live sessions for owned gym plans"
  ON public.live_sessions FOR SELECT
  USING (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.get_plan_owner(live_sessions.plan_id) p
      WHERE p.gym_id = ANY(public.get_owned_gym_ids(auth.uid()))
    )
  );

-- Superadmins can view all live sessions
CREATE POLICY "Superadmins can view all live sessions"
  ON public.live_sessions FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- 7. Add "Subscribed users can view their plans" policy for workout_plans
-- This is for mobile app users, but we use a helper function to avoid recursion
CREATE OR REPLACE FUNCTION public.user_has_active_subscription(p_user_id UUID, p_plan_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.active_subscriptions
    WHERE plan_id = p_plan_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

-- Subscribed users can view their subscribed plans (using helper function to avoid recursion)
CREATE POLICY "Subscribed users can view their plans"
  ON public.workout_plans FOR SELECT
  USING (
    is_active = true AND
    public.user_has_active_subscription(auth.uid(), workout_plans.id)
  );

-- Also add for workout_plan_items
CREATE POLICY "Subscribed users can view items for their plans"
  ON public.workout_plan_items FOR SELECT
  USING (
    public.user_has_active_subscription(auth.uid(), workout_plan_items.plan_id)
  );

-- 8. Comments
COMMENT ON FUNCTION public.is_gym_owner IS 'Returns true if user is a gym_owner';
COMMENT ON FUNCTION public.get_plan_owner IS 'Returns coach_id and gym_id for a plan. Uses SECURITY DEFINER to bypass RLS and avoid recursion.';
COMMENT ON FUNCTION public.user_has_active_subscription IS 'Checks if user has active subscription to a plan. Uses SECURITY DEFINER to bypass RLS and avoid recursion.';
