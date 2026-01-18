-- SmartCoach System Migration
-- Unified Content Provider: Trainers and Gyms create workout plans
-- Users subscribe and follow plans in the mobile app with live monitoring

-- 0. Ensure admin_gym_id and role columns exist (required for RLS policies)
-- These columns should already exist from migration 20240101000004_admin_rbac_system.sql
-- But we add them as a safety net in case migrations run out of order

-- Create user_role enum if it doesn't exist
DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('superadmin', 'gym_admin', 'receptionist', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add admin_gym_id column if it doesn't exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;

-- Add role column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN role user_role DEFAULT 'user' NOT NULL;
  END IF;
END $$;

-- 1. Create coach_profiles table (extends profiles for trainers)
CREATE TABLE IF NOT EXISTS public.coach_profiles (
  id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  bio TEXT,
  specialty TEXT, -- e.g., "Strength Training", "Cardio", "Weight Loss"
  rate_per_session DECIMAL(10, 2), -- Hourly rate for freelance coaching
  is_active BOOLEAN DEFAULT true NOT NULL,
  rating DECIMAL(3, 2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
  total_sessions INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Create workout_plans table (polymorphic ownership: coach_id OR gym_id)
CREATE TABLE IF NOT EXISTS public.workout_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Polymorphic ownership: Either coach_id OR gym_id must be set
  coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE,
  
  -- Access control
  access_level TEXT NOT NULL CHECK (access_level IN ('public', 'private', 'gym_members_only')) DEFAULT 'private',
  
  -- Pricing (optional, for paid plans)
  price DECIMAL(10, 2) DEFAULT 0.00 CHECK (price >= 0),
  currency TEXT DEFAULT 'USD',
  
  -- Metadata
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  estimated_duration_minutes INTEGER, -- Total estimated time for the plan
  category TEXT, -- e.g., "Fat Burn", "Strength", "Endurance"
  thumbnail_url TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_featured BOOLEAN DEFAULT false NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraint: Either coach_id or gym_id must be set, but not both
  CONSTRAINT workout_plans_owner_check CHECK (
    (coach_id IS NOT NULL AND gym_id IS NULL) OR
    (coach_id IS NULL AND gym_id IS NOT NULL)
  )
);

-- 3. Create workout_plan_items table (steps/exercises in a plan)
CREATE TABLE IF NOT EXISTS public.workout_plan_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  plan_id UUID REFERENCES public.workout_plans(id) ON DELETE CASCADE NOT NULL,
  
  -- Ordering within the plan
  order_index INTEGER NOT NULL CHECK (order_index >= 0),
  
  -- Exercise metadata
  exercise_name TEXT NOT NULL, -- e.g., "Bike Warm-up", "Lat Pull-down"
  exercise_description TEXT,
  
  -- Target machine type (matches machines.type)
  target_machine_type TEXT CHECK (target_machine_type IN ('treadmill', 'bike')) NOT NULL,
  
  -- Target metrics
  target_metric TEXT NOT NULL CHECK (target_metric IN ('time', 'reps', 'distance', 'rpm', 'custom')),
  target_value DECIMAL(10, 2) NOT NULL, -- e.g., 10 (minutes), 4 (reps), 5.0 (km)
  target_unit TEXT, -- e.g., "minutes", "reps", "km", "rpm"
  
  -- Optional: Rest period after this exercise
  rest_seconds INTEGER DEFAULT 0 CHECK (rest_seconds >= 0),
  
  -- Optional: Sets (for rep-based exercises)
  sets INTEGER DEFAULT 1 CHECK (sets >= 1),
  
  -- Optional: Specific machine UUID if this exercise must be done on a specific machine
  -- If NULL, any machine of target_machine_type in the gym will work
  target_machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique order_index per plan
  UNIQUE(plan_id, order_index)
);

-- 4. Create active_subscriptions table (connects users to plans/coaches)
CREATE TABLE IF NOT EXISTS public.active_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Subscription target: either a plan or a coach (for ongoing coaching)
  plan_id UUID REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  
  -- Subscription type
  subscription_type TEXT NOT NULL CHECK (subscription_type IN ('plan', 'coach')) DEFAULT 'plan',
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
  
  -- Progress tracking
  current_exercise_index INTEGER DEFAULT 0 CHECK (current_exercise_index >= 0),
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_active_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Billing (for paid subscriptions)
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_amount DECIMAL(10, 2),
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraint: Either plan_id or coach_id must be set based on subscription_type
  CONSTRAINT active_subscriptions_target_check CHECK (
    (subscription_type = 'plan' AND plan_id IS NOT NULL AND coach_id IS NULL) OR
    (subscription_type = 'coach' AND plan_id IS NULL AND coach_id IS NOT NULL)
  )
);

-- 5. Create live_sessions table (real-time workout monitoring)
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.active_subscriptions(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.workout_plans(id) ON DELETE CASCADE NOT NULL,
  
  -- Current exercise tracking
  current_exercise_index INTEGER NOT NULL CHECK (current_exercise_index >= 0),
  current_item_id UUID REFERENCES public.workout_plan_items(id) ON DELETE SET NULL,
  
  -- Current machine (the one user is currently using)
  current_machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  
  -- Real-time metrics (JSONB for flexibility)
  current_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"rpm": 85, "heart_rate": 130, "distance_km": 2.5, "calories": 150, "drops": 45}
  
  -- Session status
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coach_profiles_active ON public.coach_profiles(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workout_plans_coach_id ON public.workout_plans(coach_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_gym_id ON public.workout_plans(gym_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_access_level ON public.workout_plans(access_level);
CREATE INDEX IF NOT EXISTS idx_workout_plans_active ON public.workout_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workout_plan_items_plan_id ON public.workout_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_workout_plan_items_order ON public.workout_plan_items(plan_id, order_index);
CREATE INDEX IF NOT EXISTS idx_workout_plan_items_machine_type ON public.workout_plan_items(target_machine_type);
CREATE INDEX IF NOT EXISTS idx_active_subscriptions_user_id ON public.active_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_subscriptions_plan_id ON public.active_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_active_subscriptions_coach_id ON public.active_subscriptions(coach_id);
CREATE INDEX IF NOT EXISTS idx_active_subscriptions_status ON public.active_subscriptions(status) WHERE status = 'active';

-- Partial unique indexes to prevent duplicate active subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_subscriptions_user_plan_unique 
  ON public.active_subscriptions(user_id, plan_id) 
  WHERE subscription_type = 'plan' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_subscriptions_user_coach_unique 
  ON public.active_subscriptions(user_id, coach_id) 
  WHERE subscription_type = 'coach' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_live_sessions_user_id ON public.live_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_subscription_id ON public.live_sessions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON public.live_sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_live_sessions_last_updated ON public.live_sessions(last_updated_at DESC);

-- 7. Enable RLS
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for coach_profiles
-- Anyone can view active coaches
CREATE POLICY "Anyone can view active coaches"
  ON public.coach_profiles FOR SELECT
  USING (is_active = true);

-- Coaches can update their own profile
CREATE POLICY "Coaches can update own profile"
  ON public.coach_profiles FOR UPDATE
  USING (id = auth.uid());

-- Coaches can insert their own profile
CREATE POLICY "Coaches can insert own profile"
  ON public.coach_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- 9. RLS Policies for workout_plans
-- Anyone can view public plans
CREATE POLICY "Anyone can view public plans"
  ON public.workout_plans FOR SELECT
  USING (
    is_active = true AND (
      access_level = 'public' OR
      -- Owner can always see their plans
      (coach_id = auth.uid()) OR
      (gym_id IN (
        SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid() AND role = 'gym_admin'
      ))
    )
  );

-- Gym members can view gym_members_only plans from their gym
CREATE POLICY "Gym members can view gym plans"
  ON public.workout_plans FOR SELECT
  USING (
    is_active = true AND
    access_level = 'gym_members_only' AND
    gym_id IN (
      SELECT home_gym_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Subscribed users can view their subscribed plans (even if private)
CREATE POLICY "Subscribed users can view their plans"
  ON public.workout_plans FOR SELECT
  USING (
    is_active = true AND
    id IN (
      SELECT plan_id FROM public.active_subscriptions
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Coaches can manage their own plans
CREATE POLICY "Coaches can manage own plans"
  ON public.workout_plans FOR ALL
  USING (coach_id = auth.uid());

-- Gym admins can manage their gym's plans
CREATE POLICY "Gym admins can manage gym plans"
  ON public.workout_plans FOR ALL
  USING (
    gym_id IN (
      SELECT admin_gym_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'gym_admin'
    )
  );

-- Superadmins can manage all plans
CREATE POLICY "Superadmins can manage all plans"
  ON public.workout_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- 10. RLS Policies for workout_plan_items
-- Anyone can view items for plans they can see
CREATE POLICY "Anyone can view items for accessible plans"
  ON public.workout_plan_items FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans
      WHERE is_active = true
    )
  );

-- Coaches can manage items for their plans
CREATE POLICY "Coaches can manage items for own plans"
  ON public.workout_plan_items FOR ALL
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans WHERE coach_id = auth.uid()
    )
  );

-- Gym admins can manage items for their gym's plans
CREATE POLICY "Gym admins can manage items for gym plans"
  ON public.workout_plan_items FOR ALL
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans
      WHERE gym_id IN (
        SELECT admin_gym_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'gym_admin'
      )
    )
  );

-- 11. RLS Policies for active_subscriptions
-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.active_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Coaches can view subscriptions to their plans
CREATE POLICY "Coaches can view subscriptions to own plans"
  ON public.active_subscriptions FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans WHERE coach_id = auth.uid()
    )
  );

-- Gym admins can view subscriptions to their gym's plans
CREATE POLICY "Gym admins can view subscriptions to gym plans"
  ON public.active_subscriptions FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans
      WHERE gym_id IN (
        SELECT admin_gym_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'gym_admin'
      )
    )
  );

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage own subscriptions"
  ON public.active_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- 12. RLS Policies for live_sessions
-- Users can view and manage their own live sessions
CREATE POLICY "Users can manage own live sessions"
  ON public.live_sessions FOR ALL
  USING (user_id = auth.uid());

-- Coaches can view live sessions for their plans
CREATE POLICY "Coaches can view live sessions for own plans"
  ON public.live_sessions FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans WHERE coach_id = auth.uid()
    )
  );

-- Gym admins can view live sessions for their gym's plans
CREATE POLICY "Gym admins can view live sessions for gym plans"
  ON public.live_sessions FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans
      WHERE gym_id IN (
        SELECT admin_gym_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'gym_admin'
      )
    )
  );

-- 13. Function to update last_updated_at for live_sessions
CREATE OR REPLACE FUNCTION public.update_live_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_updated_at
CREATE TRIGGER update_live_sessions_timestamp
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_live_session_timestamp();

-- 14. Function to get current active workout plan for a user
CREATE OR REPLACE FUNCTION public.get_user_active_plan(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_id UUID,
  plan_name TEXT,
  current_exercise_index INTEGER,
  owner_type TEXT,
  owner_id UUID,
  owner_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    s.id AS subscription_id,
    p.id AS plan_id,
    p.name AS plan_name,
    s.current_exercise_index,
    CASE 
      WHEN p.coach_id IS NOT NULL THEN 'coach'
      WHEN p.gym_id IS NOT NULL THEN 'gym'
    END AS owner_type,
    COALESCE(p.coach_id, p.gym_id) AS owner_id,
    CASE 
      WHEN p.coach_id IS NOT NULL THEN pr.full_name
      WHEN p.gym_id IS NOT NULL THEN g.name
    END AS owner_name
  FROM public.active_subscriptions s
  INNER JOIN public.workout_plans p ON s.plan_id = p.id
  LEFT JOIN public.profiles pr ON p.coach_id = pr.id
  LEFT JOIN public.gyms g ON p.gym_id = g.id
  WHERE s.user_id = p_user_id 
    AND s.status = 'active'
    AND s.subscription_type = 'plan'
  ORDER BY s.started_at DESC
  LIMIT 1;
$$;

-- 15. Function to get plan item for a specific machine UUID
-- This is crucial for mapping: when user scans QR, we find which exercise in their plan uses that machine
CREATE OR REPLACE FUNCTION public.get_plan_item_for_machine(
  p_plan_id UUID,
  p_machine_id UUID,
  p_current_index INTEGER DEFAULT 0
)
RETURNS TABLE (
  item_id UUID,
  order_index INTEGER,
  exercise_name TEXT,
  target_machine_type TEXT,
  target_metric TEXT,
  target_value DECIMAL,
  target_unit TEXT,
  rest_seconds INTEGER,
  sets INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    i.id AS item_id,
    i.order_index,
    i.exercise_name,
    i.target_machine_type,
    i.target_metric,
    i.target_value,
    i.target_unit,
    i.rest_seconds,
    i.sets
  FROM public.workout_plan_items i
  INNER JOIN public.machines m ON (
    -- Match if machine type matches AND (no specific machine required OR this specific machine)
    (i.target_machine_type = m.type) AND
    (i.target_machine_id IS NULL OR i.target_machine_id = m.id)
  )
  WHERE i.plan_id = p_plan_id
    AND m.id = p_machine_id
    AND i.order_index >= p_current_index
  ORDER BY i.order_index ASC
  LIMIT 1;
$$;

-- 16. Function to automatically close stale live_sessions (no update for 2+ minutes)
-- This ensures that sessions are automatically closed if the mobile app crashes or disconnects
CREATE OR REPLACE FUNCTION public.close_stale_live_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.live_sessions
  SET 
    status = 'completed',
    completed_at = NOW(),
    last_updated_at = NOW()
  WHERE 
    status = 'active'
    AND (
      last_updated_at IS NULL 
      OR last_updated_at < NOW() - INTERVAL '2 minutes'
    );
END;
$$;

-- 17. Function to ensure live_session is updated (call this from mobile app)
-- If session doesn't exist or is stale (>2 min), it creates a new one
CREATE OR REPLACE FUNCTION public.upsert_live_session(
  p_user_id UUID,
  p_subscription_id UUID,
  p_plan_id UUID,
  p_current_exercise_index INTEGER,
  p_current_item_id UUID,
  p_current_machine_id UUID,
  p_current_metrics JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Try to find existing active session for this subscription that's not stale
  SELECT id INTO v_session_id
  FROM public.live_sessions
  WHERE subscription_id = p_subscription_id
    AND status = 'active'
    AND last_updated_at > NOW() - INTERVAL '2 minutes'
  ORDER BY last_updated_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    -- Update existing active session
    UPDATE public.live_sessions
    SET
      current_exercise_index = p_current_exercise_index,
      current_item_id = p_current_item_id,
      current_machine_id = p_current_machine_id,
      current_metrics = p_current_metrics,
      last_updated_at = NOW()
    WHERE id = v_session_id;
    
    RETURN v_session_id;
  ELSE
    -- Close any stale active sessions for this subscription
    UPDATE public.live_sessions
    SET 
      status = 'completed',
      completed_at = NOW(),
      last_updated_at = NOW()
    WHERE subscription_id = p_subscription_id
      AND status = 'active'
      AND (last_updated_at IS NULL OR last_updated_at <= NOW() - INTERVAL '2 minutes');

    -- Create new session
    INSERT INTO public.live_sessions (
      user_id,
      subscription_id,
      plan_id,
      current_exercise_index,
      current_item_id,
      current_machine_id,
      current_metrics,
      status,
      started_at,
      last_updated_at
    )
    VALUES (
      p_user_id,
      p_subscription_id,
      p_plan_id,
      p_current_exercise_index,
      p_current_item_id,
      p_current_machine_id,
      p_current_metrics,
      'active',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
  END IF;
END;
$$;

-- 18. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_active_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_item_for_machine(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_live_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_live_session(UUID, UUID, UUID, INTEGER, UUID, UUID, JSONB) TO authenticated;

-- 19. Scheduled execution setup (optional - requires pg_cron extension)
-- To enable automatic cleanup of stale sessions, run this after enabling pg_cron:
-- 
-- Step 1: Enable pg_cron extension in Supabase Dashboard:
--   Database > Extensions > Enable "pg_cron"
--
-- Step 2: Schedule the cleanup function (run every 2 minutes):
--   SELECT cron.schedule(
--     'close-stale-live-sessions',
--     '*/2 * * * *', -- Cron expression: every 2 minutes
--     $$SELECT public.close_stale_live_sessions();$$
--   );
--
-- To unschedule:
--   SELECT cron.unschedule('close-stale-live-sessions');
--
-- Alternatively, call close_stale_live_sessions() from your backend service
-- (Supabase Edge Function, API route, scheduled task, etc.) every 2 minutes

-- 20. Comments
COMMENT ON TABLE public.coach_profiles IS 'Extended profiles for freelance trainers/coaches';
COMMENT ON TABLE public.workout_plans IS 'Workout plans created by coaches or gyms. Supports polymorphic ownership.';
COMMENT ON TABLE public.workout_plan_items IS 'Individual exercises/steps within a workout plan, mapped to machine types';
COMMENT ON TABLE public.active_subscriptions IS 'User subscriptions to workout plans or coaches';
COMMENT ON TABLE public.live_sessions IS 'Real-time workout sessions for live monitoring. Updated every 5 seconds from mobile app. Automatically closed if no update for 2+ minutes via close_stale_live_sessions() function.';
COMMENT ON FUNCTION public.get_user_active_plan IS 'Returns the current active workout plan for a user with subscription details.';
COMMENT ON FUNCTION public.get_plan_item_for_machine IS 'Maps a scanned machine UUID to the corresponding plan item. Key function for QR code → exercise mapping.';
COMMENT ON FUNCTION public.close_stale_live_sessions IS 'Automatically closes live_sessions that have not been updated for 2+ minutes. Should be called periodically (via pg_cron every 2 minutes or from backend service).';
COMMENT ON FUNCTION public.upsert_live_session IS 'Creates or updates a live session. If existing session is stale (>2 min), closes it and creates a new one. Use this function from mobile app instead of direct INSERT/UPDATE. Automatically handles stale session cleanup.';
