-- Day Templates System
-- Allows admins to save individual workout days as reusable templates

-- 1. Create workout_day_templates table
CREATE TABLE IF NOT EXISTS public.workout_day_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  
  -- Template details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- e.g., 'Leg Day', 'Upper Body', 'Cardio', 'Hypertrophy'
  estimated_duration_minutes INTEGER,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Either gym_id or coach_id must be set
  CONSTRAINT workout_day_templates_owner_check CHECK (
    (gym_id IS NOT NULL AND coach_id IS NULL) OR
    (gym_id IS NULL AND coach_id IS NOT NULL)
  )
);

-- 2. Create day_template_items table (Exercises for the day template)
CREATE TABLE IF NOT EXISTS public.day_template_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  day_template_id UUID REFERENCES public.workout_day_templates(id) ON DELETE CASCADE NOT NULL,
  
  -- Exercise details (same structure as program_items)
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  machine_type TEXT CHECK (machine_type IN ('treadmill', 'bike', 'Smart')),
  exercise_name TEXT NOT NULL,
  exercise_description TEXT,
  order_index INTEGER NOT NULL CHECK (order_index >= 0),
  
  -- Target metrics
  target_reps INTEGER,
  target_time INTEGER, -- in seconds
  target_metric TEXT CHECK (target_metric IN ('reps', 'time', 'rpm', 'distance')),
  target_value DECIMAL(10, 2),
  target_unit TEXT,
  
  -- Rest and sets
  rest_seconds INTEGER DEFAULT 60,
  sets INTEGER DEFAULT 1,
  
  -- SmartCoach progression
  smart_progression_enabled BOOLEAN DEFAULT false NOT NULL,
  base_target_value DECIMAL(10, 2),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One exercise per order per template
  UNIQUE(day_template_id, order_index)
);

-- 3. Add index for day templates
CREATE INDEX IF NOT EXISTS idx_day_templates_gym ON public.workout_day_templates(gym_id) WHERE gym_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_day_templates_coach ON public.workout_day_templates(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_day_templates_category ON public.workout_day_templates(category);
CREATE INDEX IF NOT EXISTS idx_day_template_items_template ON public.day_template_items(day_template_id);

-- 4. Enable RLS
ALTER TABLE public.workout_day_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_template_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for workout_day_templates
DROP POLICY IF EXISTS "Public day templates are viewable by all" ON public.workout_day_templates;
DROP POLICY IF EXISTS "Gym admins can manage gym day templates" ON public.workout_day_templates;
DROP POLICY IF EXISTS "Coaches can manage own day templates" ON public.workout_day_templates;
DROP POLICY IF EXISTS "Superadmins can manage all day templates" ON public.workout_day_templates;

CREATE POLICY "Public day templates are viewable by all"
  ON public.workout_day_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Gym admins can manage gym day templates"
  ON public.workout_day_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('gym_admin', 'gym_owner')
        AND p.admin_gym_id = workout_day_templates.gym_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('gym_admin', 'gym_owner')
        AND p.admin_gym_id = workout_day_templates.gym_id
    )
  );

CREATE POLICY "Gym owners can manage day templates in their owned gyms"
  ON public.workout_day_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = workout_day_templates.gym_id
        AND g.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = workout_day_templates.gym_id
        AND g.owner_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage own day templates"
  ON public.workout_day_templates FOR ALL
  USING (
    coach_id IS NOT NULL
    AND coach_id = auth.uid()
  )
  WITH CHECK (
    coach_id IS NOT NULL
    AND coach_id = auth.uid()
  );

CREATE POLICY "Superadmins can manage all day templates"
  ON public.workout_day_templates FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- 6. RLS Policies for day_template_items
DROP POLICY IF EXISTS "Users can view day template items" ON public.day_template_items;
DROP POLICY IF EXISTS "Gym admins can manage day template items" ON public.day_template_items;
DROP POLICY IF EXISTS "Coaches can manage own day template items" ON public.day_template_items;
DROP POLICY IF EXISTS "Superadmins can manage all day template items" ON public.day_template_items;

CREATE POLICY "Users can view day template items"
  ON public.day_template_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_day_templates dt
      WHERE dt.id = day_template_items.day_template_id
        AND dt.is_active = true
    )
  );

CREATE POLICY "Gym admins can manage day template items"
  ON public.day_template_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_day_templates dt
      JOIN public.profiles p ON p.admin_gym_id = dt.gym_id
      WHERE dt.id = day_template_items.day_template_id
        AND p.id = auth.uid()
        AND p.role IN ('gym_admin', 'gym_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_day_templates dt
      JOIN public.profiles p ON p.admin_gym_id = dt.gym_id
      WHERE dt.id = day_template_items.day_template_id
        AND p.id = auth.uid()
        AND p.role IN ('gym_admin', 'gym_owner')
    )
  );

CREATE POLICY "Coaches can manage own day template items"
  ON public.day_template_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_day_templates dt
      WHERE dt.id = day_template_items.day_template_id
        AND dt.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_day_templates dt
      WHERE dt.id = day_template_items.day_template_id
        AND dt.coach_id = auth.uid()
    )
  );

CREATE POLICY "Superadmins can manage all day template items"
  ON public.day_template_items FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- 7. Function to duplicate a day template into a program day
CREATE OR REPLACE FUNCTION public.load_day_template_into_program(
  p_day_template_id UUID,
  p_program_id UUID,
  p_day_number INTEGER
)
RETURNS UUID -- Returns the new program_day.id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
  v_new_day_id UUID;
  v_item RECORD;
BEGIN
  -- Get the day template
  SELECT * INTO v_template
  FROM public.workout_day_templates
  WHERE id = p_day_template_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day template not found or inactive';
  END IF;
  
  -- Create new program day
  INSERT INTO public.program_days (
    program_id,
    day_number,
    title,
    description,
    is_rest_day,
    estimated_duration_minutes
  )
  VALUES (
    p_program_id,
    p_day_number,
    v_template.name,
    v_template.description,
    false, -- Day templates are not rest days
    v_template.estimated_duration_minutes
  )
  RETURNING id INTO v_new_day_id;
  
  -- Copy all items from template to program day
  FOR v_item IN 
    SELECT * FROM public.day_template_items
    WHERE day_template_id = p_day_template_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.program_items (
      program_day_id,
      machine_id,
      machine_type,
      exercise_name,
      exercise_description,
      order_index,
      target_reps,
      target_time,
      target_metric,
      target_value,
      target_unit,
      rest_seconds,
      sets,
      smart_progression_enabled,
      base_target_value
    )
    VALUES (
      v_new_day_id,
      v_item.machine_id,
      v_item.machine_type,
      v_item.exercise_name,
      v_item.exercise_description,
      v_item.order_index,
      v_item.target_reps,
      v_item.target_time,
      v_item.target_metric,
      v_item.target_value,
      v_item.target_unit,
      v_item.rest_seconds,
      v_item.sets,
      v_item.smart_progression_enabled,
      v_item.base_target_value
    );
  END LOOP;
  
  RETURN v_new_day_id;
END;
$$;

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.load_day_template_into_program(UUID, UUID, INTEGER) TO authenticated;

-- 9. Comments
COMMENT ON TABLE public.workout_day_templates IS 'Reusable workout day templates that can be loaded into programs';
COMMENT ON TABLE public.day_template_items IS 'Exercises for a day template';
COMMENT ON FUNCTION public.load_day_template_into_program IS 'Duplicates a day template into a program day with all exercises';
