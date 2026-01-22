-- Workout Plan Templates System
-- Adds categorization fields and template support to workout_plans

-- 1. Add template categorization columns to workout_plans
ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS template_goal TEXT CHECK (template_goal IN (
    'Strength', 'Hypertrophy', 'Fat loss', 'Conditioning', 'Rehab', 
    'Beginner', 'Advanced', 'Powerlifting', 'Functional'
  )),
  ADD COLUMN IF NOT EXISTS template_structure TEXT CHECK (template_structure IN (
    'Full body', 'Upper/Lower', 'Push Pull Legs', '4-day split', '5-day split'
  )),
  ADD COLUMN IF NOT EXISTS template_equipment TEXT CHECK (template_equipment IN (
    'Machines only (Smart machines)', 'Free weights', 'Mixed'
  )),
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS template_source_id UUID REFERENCES public.workout_plans(id) ON DELETE SET NULL;

-- 2. Add index for template queries
CREATE INDEX IF NOT EXISTS idx_workout_plans_template_goal ON public.workout_plans(template_goal) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_workout_plans_template_structure ON public.workout_plans(template_structure) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_workout_plans_template_equipment ON public.workout_plans(template_equipment) WHERE is_template = true;

-- 3. Update workout_plan_items to support Smart Machine type
-- Allow 'Smart' as a target_machine_type (in addition to 'treadmill', 'bike')
ALTER TABLE public.workout_plan_items
  DROP CONSTRAINT IF EXISTS workout_plan_items_target_machine_type_check;

ALTER TABLE public.workout_plan_items
  ADD CONSTRAINT workout_plan_items_target_machine_type_check
  CHECK (target_machine_type IN ('treadmill', 'bike', 'Smart'));

-- 4. Add SmartCoach progression tracking columns to workout_plan_items
ALTER TABLE public.workout_plan_items
  ADD COLUMN IF NOT EXISTS smart_progression_enabled BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS base_target_value DECIMAL(10, 2), -- Original target value before SmartCoach adjustments
  ADD COLUMN IF NOT EXISTS progression_increment DECIMAL(10, 2) DEFAULT 2.5; -- Default 2.5kg increment

-- 5. Create table for tracking SmartCoach progress per user per plan item
CREATE TABLE IF NOT EXISTS public.smartcoach_user_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.workout_plans(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES public.workout_plan_items(id) ON DELETE CASCADE NOT NULL,
  
  -- Session data
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  
  -- Actual performance metrics
  actual_reps INTEGER,
  actual_weight DECIMAL(10, 2), -- For weight-based exercises
  actual_value DECIMAL(10, 2), -- Generic value (time, distance, etc.)
  tempo_consistency DECIMAL(5, 2), -- 0-100, consistency score
  
  -- Target values (what was expected)
  target_reps INTEGER,
  target_weight DECIMAL(10, 2),
  target_value DECIMAL(10, 2),
  
  -- Progression decision
  progression_applied BOOLEAN DEFAULT false,
  progression_type TEXT CHECK (progression_type IN ('increase', 'maintain', 'decrease', 'rest_increase')),
  new_target_value DECIMAL(10, 2), -- Updated target after progression
  
  -- Metadata
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_id, plan_id, item_id, session_id)
);

-- 6. Create indexes for SmartCoach progress
CREATE INDEX IF NOT EXISTS idx_smartcoach_progress_user_plan ON public.smartcoach_user_progress(user_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_smartcoach_progress_item ON public.smartcoach_user_progress(item_id);
CREATE INDEX IF NOT EXISTS idx_smartcoach_progress_session ON public.smartcoach_user_progress(session_id);

-- 7. Enable RLS for smartcoach_user_progress
ALTER TABLE public.smartcoach_user_progress ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for smartcoach_user_progress
-- Users can view their own progress
CREATE POLICY "Users can view own SmartCoach progress"
  ON public.smartcoach_user_progress FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own progress (via mobile app)
CREATE POLICY "Users can insert own SmartCoach progress"
  ON public.smartcoach_user_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Coaches and gym admins can view progress for their plans
CREATE POLICY "Coaches can view progress for own plans"
  ON public.smartcoach_user_progress FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans WHERE coach_id = auth.uid()
    )
  );

CREATE POLICY "Gym admins can view progress for gym plans"
  ON public.smartcoach_user_progress FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.workout_plans
      WHERE gym_id IN (
        SELECT admin_gym_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'gym_admin'
      )
    )
  );

-- 9. Function to process SmartCoach progression
CREATE OR REPLACE FUNCTION public.process_smartcoach_progress(
  p_user_id UUID,
  p_plan_id UUID,
  p_item_id UUID,
  p_session_id UUID,
  p_actual_reps INTEGER,
  p_actual_weight DECIMAL,
  p_actual_value DECIMAL,
  p_tempo_consistency DECIMAL,
  p_target_reps INTEGER,
  p_target_weight DECIMAL,
  p_target_value DECIMAL
)
RETURNS TABLE (
  progression_type TEXT,
  new_target_value DECIMAL,
  new_rest_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_progression_type TEXT;
  v_new_target_value DECIMAL(10, 2);
  v_new_rest_seconds INTEGER;
  v_performance_ratio DECIMAL(5, 2);
BEGIN
  -- Get the plan item
  SELECT 
    *,
    COALESCE(base_target_value, target_value) as base_target,
    progression_increment,
    rest_seconds
  INTO v_item
  FROM public.workout_plan_items
  WHERE id = p_item_id AND plan_id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan item not found';
  END IF;

  -- Calculate performance ratio (actual vs target)
  IF p_target_reps > 0 THEN
    v_performance_ratio := (p_actual_reps::DECIMAL / p_target_reps::DECIMAL) * 100;
  ELSIF p_target_value > 0 THEN
    v_performance_ratio := (p_actual_value / p_target_value) * 100;
  ELSE
    v_performance_ratio := 100; -- Default to 100% if no target
  END IF;

  -- SmartCoach Progression Logic
  -- Case 1: Goal achieved (100% reps) with consistent tempo -> Increase weight by 2.5kg
  IF p_actual_reps >= p_target_reps AND p_tempo_consistency >= 80 THEN
    v_progression_type := 'increase';
    IF v_item.target_metric = 'reps' AND p_target_weight > 0 THEN
      v_new_target_value := p_target_weight + v_item.progression_increment;
    ELSE
      -- For non-weight exercises, increase target value by 5%
      v_new_target_value := v_item.base_target * 1.05;
    END IF;
    v_new_rest_seconds := v_item.rest_seconds; -- Keep rest the same

  -- Case 2: Performance < 80% of target -> Maintain or decrease weight, increase rest
  ELSIF v_performance_ratio < 80 THEN
    v_progression_type := 'rest_increase';
    v_new_target_value := COALESCE(p_target_weight, v_item.base_target);
    -- If already at base, decrease by 5%
    IF v_new_target_value > v_item.base_target THEN
      v_new_target_value := v_new_target_value * 0.95;
    END IF;
    v_new_rest_seconds := v_item.rest_seconds + 30; -- Add 30 seconds rest

  -- Case 3: Performance between 80-100% -> Maintain current level
  ELSE
    v_progression_type := 'maintain';
    v_new_target_value := COALESCE(p_target_weight, v_item.base_target);
    v_new_rest_seconds := v_item.rest_seconds;
  END IF;

  -- Insert progress record
  INSERT INTO public.smartcoach_user_progress (
    user_id,
    plan_id,
    item_id,
    session_id,
    actual_reps,
    actual_weight,
    actual_value,
    tempo_consistency,
    target_reps,
    target_weight,
    target_value,
    progression_applied,
    progression_type,
    new_target_value
  )
  VALUES (
    p_user_id,
    p_plan_id,
    p_item_id,
    p_session_id,
    p_actual_reps,
    p_actual_weight,
    p_actual_value,
    p_tempo_consistency,
    p_target_reps,
    p_target_weight,
    p_target_value,
    true,
    v_progression_type,
    v_new_target_value
  );

  -- Return progression decision
  RETURN QUERY SELECT v_progression_type, v_new_target_value, v_new_rest_seconds;
END;
$$;

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.process_smartcoach_progress(
  UUID, UUID, UUID, UUID, INTEGER, DECIMAL, DECIMAL, DECIMAL, INTEGER, DECIMAL, DECIMAL
) TO authenticated;

-- 11. Comments
COMMENT ON COLUMN public.workout_plans.template_goal IS 'Goal category for template plans: Strength, Hypertrophy, Fat loss, etc.';
COMMENT ON COLUMN public.workout_plans.template_structure IS 'Workout structure: Full body, Upper/Lower, Push Pull Legs, etc.';
COMMENT ON COLUMN public.workout_plans.template_equipment IS 'Equipment type: Machines only, Free weights, Mixed';
COMMENT ON COLUMN public.workout_plans.is_template IS 'True if this is a pre-defined template that can be applied to gyms';
COMMENT ON COLUMN public.workout_plan_items.target_machine_type IS 'Machine type: treadmill, bike, or Smart (for Smart Machine integration)';
COMMENT ON COLUMN public.workout_plan_items.smart_progression_enabled IS 'Enable SmartCoach AI progression for this exercise';
COMMENT ON TABLE public.smartcoach_user_progress IS 'Tracks user performance and SmartCoach progression decisions per exercise';
COMMENT ON FUNCTION public.process_smartcoach_progress IS 'Analyzes completed session and returns progression decision (increase/maintain/decrease weight, adjust rest)';
