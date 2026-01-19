-- Tiered Access SmartCoach System Migration
-- Adds access_type, pricing, coach-gym affiliations, and instruction videos
-- This extends the existing SmartCoach system to support POS functionality

-- 1. Create access_type ENUM
DO $$
BEGIN
  CREATE TYPE access_type AS ENUM ('free', 'membership_required', 'paid_one_time');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add access_type column to workout_plans (replaces access_level for new plans)
-- Keep access_level for backward compatibility, but access_type takes precedence
ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS access_type access_type DEFAULT 'free' NOT NULL;

-- 3. Ensure price and currency columns exist and are properly configured
-- These should already exist from migration 20240101000031_smartcoach_system.sql
-- But we ensure they're set up correctly for Stripe integration
DO $$
BEGIN
  -- Update price column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workout_plans' 
    AND column_name = 'price'
  ) THEN
    ALTER TABLE public.workout_plans
      ALTER COLUMN price TYPE DECIMAL(10, 2),
      ALTER COLUMN price SET DEFAULT 0.00,
      ALTER COLUMN price SET NOT NULL;
  END IF;

  -- Drop constraint if it exists, then recreate it
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workout_plans_price_check' 
    AND conrelid = 'public.workout_plans'::regclass
  ) THEN
    ALTER TABLE public.workout_plans DROP CONSTRAINT workout_plans_price_check;
  END IF;

  -- Add constraint back
  ALTER TABLE public.workout_plans
    ADD CONSTRAINT workout_plans_price_check CHECK (price >= 0);

  -- Update currency column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workout_plans' 
    AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.workout_plans
      ALTER COLUMN currency TYPE TEXT,
      ALTER COLUMN currency SET DEFAULT 'USD',
      ALTER COLUMN currency SET NOT NULL;
  END IF;
END $$;

-- 4. Add Stripe integration fields for paid plans
ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT, -- Stripe Price ID for recurring subscriptions
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT, -- Stripe Product ID
  ADD COLUMN IF NOT EXISTS stripe_one_time_price_id TEXT; -- Stripe Price ID for one-time payments

-- 5. Create coach_gym_affiliations table
-- Allows freelance coaches to affiliate their plans with specific gyms
CREATE TABLE IF NOT EXISTS public.coach_gym_affiliations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.workout_plans(id) ON DELETE CASCADE NOT NULL,
  
  -- Affiliation status
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')) DEFAULT 'pending',
  
  -- Commission/revenue sharing (optional)
  commission_percentage DECIMAL(5, 2) DEFAULT 0.00 CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  
  -- Metadata
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Gym admin who approved
  approved_at TIMESTAMPTZ,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique affiliation per coach-gym-plan combination
  UNIQUE(coach_id, gym_id, plan_id)
);

-- 6. Add instruction_video_url to workout_plan_items
ALTER TABLE public.workout_plan_items
  ADD COLUMN IF NOT EXISTS instruction_video_url TEXT;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_plans_access_type ON public.workout_plans(access_type);
CREATE INDEX IF NOT EXISTS idx_workout_plans_price ON public.workout_plans(price) WHERE price > 0;
CREATE INDEX IF NOT EXISTS idx_workout_plans_stripe_product_id ON public.workout_plans(stripe_product_id) WHERE stripe_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_gym_affiliations_coach_id ON public.coach_gym_affiliations(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_gym_affiliations_gym_id ON public.coach_gym_affiliations(gym_id);
CREATE INDEX IF NOT EXISTS idx_coach_gym_affiliations_plan_id ON public.coach_gym_affiliations(plan_id);
CREATE INDEX IF NOT EXISTS idx_coach_gym_affiliations_status ON public.coach_gym_affiliations(status) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_workout_plan_items_video_url ON public.workout_plan_items(instruction_video_url) WHERE instruction_video_url IS NOT NULL;

-- 8. Enable RLS for coach_gym_affiliations
ALTER TABLE public.coach_gym_affiliations ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for coach_gym_affiliations
-- Anyone can view approved affiliations
CREATE POLICY "Anyone can view approved affiliations"
  ON public.coach_gym_affiliations FOR SELECT
  USING (status = 'approved');

-- Coaches can view their own affiliations
CREATE POLICY "Coaches can view own affiliations"
  ON public.coach_gym_affiliations FOR SELECT
  USING (coach_id = auth.uid());

-- Gym admins can view affiliations for their gym
CREATE POLICY "Gym admins can view gym affiliations"
  ON public.coach_gym_affiliations FOR SELECT
  USING (
    gym_id IN (
      SELECT admin_gym_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'gym_admin'
    )
  );

-- Coaches can create affiliations (pending approval)
CREATE POLICY "Coaches can create affiliations"
  ON public.coach_gym_affiliations FOR INSERT
  WITH CHECK (
    coach_id = auth.uid() AND
    status = 'pending'
  );

-- Coaches can update their own pending affiliations
CREATE POLICY "Coaches can update own pending affiliations"
  ON public.coach_gym_affiliations FOR UPDATE
  USING (
    coach_id = auth.uid() AND
    status = 'pending'
  );

-- Gym admins can approve/reject affiliations for their gym
CREATE POLICY "Gym admins can manage gym affiliations"
  ON public.coach_gym_affiliations FOR UPDATE
  USING (
    gym_id IN (
      SELECT admin_gym_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'gym_admin'
    )
  )
  WITH CHECK (
    gym_id IN (
      SELECT admin_gym_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'gym_admin'
    )
  );

-- Superadmins can manage all affiliations
CREATE POLICY "Superadmins can manage all affiliations"
  ON public.coach_gym_affiliations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- 10. Function to check user access to a plan
-- Returns true if user has access (free, has membership, or has paid)
CREATE OR REPLACE FUNCTION public.user_has_plan_access(
  p_user_id UUID,
  p_plan_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_plan_access_type access_type;
  v_plan_gym_id UUID;
  v_user_has_membership BOOLEAN;
  v_user_has_paid BOOLEAN;
BEGIN
  -- Get plan access type and gym_id
  SELECT access_type, gym_id INTO v_plan_access_type, v_plan_gym_id
  FROM public.workout_plans
  WHERE id = p_plan_id AND is_active = true;

  -- If plan doesn't exist or is inactive, no access
  IF v_plan_access_type IS NULL THEN
    RETURN false;
  END IF;

  -- Free plans: everyone has access
  IF v_plan_access_type = 'free' THEN
    RETURN true;
  END IF;

  -- Membership required: check if user has active membership in the gym
  IF v_plan_access_type = 'membership_required' THEN
    -- Check if user has gym_membership for this gym
    SELECT EXISTS (
      SELECT 1 FROM public.gym_memberships
      WHERE user_id = p_user_id AND gym_id = v_plan_gym_id
    ) INTO v_user_has_membership;
    
    RETURN v_user_has_membership;
  END IF;

  -- Paid one-time: check if user has active subscription or one-time payment
  IF v_plan_access_type = 'paid_one_time' THEN
    -- Check if user has active subscription to this plan
    SELECT EXISTS (
      SELECT 1 FROM public.active_subscriptions
      WHERE user_id = p_user_id 
        AND plan_id = p_plan_id
        AND status = 'active'
        AND payment_status = 'paid'
    ) INTO v_user_has_paid;
    
    RETURN v_user_has_paid;
  END IF;

  -- Default: no access
  RETURN false;
END;
$$;

-- 11. Function to get next machine in plan sequence
-- Returns the next workout_plan_item that requires a different machine
CREATE OR REPLACE FUNCTION public.get_next_machine_in_plan(
  p_plan_id UUID,
  p_current_index INTEGER
)
RETURNS TABLE (
  item_id UUID,
  order_index INTEGER,
  exercise_name TEXT,
  target_machine_type TEXT,
  target_machine_id UUID,
  machine_name TEXT,
  instruction_video_url TEXT
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
    i.target_machine_id,
    m.name AS machine_name,
    i.instruction_video_url
  FROM public.workout_plan_items i
  LEFT JOIN public.machines m ON i.target_machine_id = m.id
  WHERE i.plan_id = p_plan_id
    AND i.order_index > p_current_index
  ORDER BY i.order_index ASC
  LIMIT 1;
$$;

-- 12. Update get_plan_item_for_machine to include instruction_video_url
-- Drop existing function first (if it exists) to allow return type change
DROP FUNCTION IF EXISTS public.get_plan_item_for_machine(UUID, UUID, INTEGER);

CREATE FUNCTION public.get_plan_item_for_machine(
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
  sets INTEGER,
  instruction_video_url TEXT
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
    i.sets,
    i.instruction_video_url
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

-- 13. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.user_has_plan_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_machine_in_plan(UUID, INTEGER) TO authenticated;

-- 14. Comments
COMMENT ON COLUMN public.workout_plans.access_type IS 'Access control type: free (anyone), membership_required (gym members only), paid_one_time (requires payment)';
COMMENT ON COLUMN public.workout_plans.stripe_price_id IS 'Stripe Price ID for recurring subscription plans';
COMMENT ON COLUMN public.workout_plans.stripe_product_id IS 'Stripe Product ID';
COMMENT ON COLUMN public.workout_plans.stripe_one_time_price_id IS 'Stripe Price ID for one-time payment';
COMMENT ON TABLE public.coach_gym_affiliations IS 'Links freelance coaches plans to specific gyms. Allows coaches to tag plans for gym-specific availability.';
COMMENT ON COLUMN public.workout_plan_items.instruction_video_url IS 'URL to instructional video for this exercise/machine';
COMMENT ON FUNCTION public.user_has_plan_access IS 'Checks if a user has access to a plan based on access_type (free, membership, or payment)';
COMMENT ON FUNCTION public.get_next_machine_in_plan IS 'Returns the next machine/exercise in the plan sequence after current_index. Used for guided workout flow.';
