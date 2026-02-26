-- Update access_type for workout_programs to support Global, Gym Exclusive, and Paid plans
-- Replaces 'membership_required' with 'gym_members_only' and 'paid_one_time' with 'paid'

-- 1. Create new access_type ENUM for workout_programs
DO $$
BEGIN
  -- Drop old enum if it exists (we'll recreate it)
  DROP TYPE IF EXISTS access_type_program CASCADE;
  
  -- Create new enum with correct values
  CREATE TYPE access_type_program AS ENUM ('free', 'gym_members_only', 'paid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Drop existing RLS policies that depend on access_type column
DROP POLICY IF EXISTS "Public programs are viewable by all" ON public.workout_programs;
DROP POLICY IF EXISTS "Gym members can view gym programs" ON public.workout_programs;
DROP POLICY IF EXISTS "Global programs are viewable by all" ON public.workout_programs;
DROP POLICY IF EXISTS "Gym exclusive programs are viewable by gym members" ON public.workout_programs;
DROP POLICY IF EXISTS "Paid programs are viewable by all" ON public.workout_programs;
DROP POLICY IF EXISTS "Coach programs are viewable by all" ON public.workout_programs;

-- 3. Add new access_type column (if it doesn't exist) or alter existing one
DO $$
BEGIN
  -- Check if access_type column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workout_programs' 
    AND column_name = 'access_type'
  ) THEN
    -- Column exists - we need to migrate data and change type
    -- First, add a temporary column with new type
    ALTER TABLE public.workout_programs
      ADD COLUMN IF NOT EXISTS access_type_new access_type_program;
    
    -- Migrate existing data
    UPDATE public.workout_programs
    SET access_type_new = CASE
      WHEN access_type::text = 'free' THEN 'free'::access_type_program
      WHEN access_type::text = 'membership_required' THEN 'gym_members_only'::access_type_program
      WHEN access_type::text = 'paid_one_time' THEN 'paid'::access_type_program
      ELSE 'free'::access_type_program
    END;
    
    -- Drop old column (now safe since policies are dropped)
    ALTER TABLE public.workout_programs
      DROP COLUMN IF EXISTS access_type;
    
    -- Rename new column
    ALTER TABLE public.workout_programs
      RENAME COLUMN access_type_new TO access_type;
    
    -- Set NOT NULL constraint
    ALTER TABLE public.workout_programs
      ALTER COLUMN access_type SET NOT NULL,
      ALTER COLUMN access_type SET DEFAULT 'free';
  ELSE
    -- Column doesn't exist - create it
    ALTER TABLE public.workout_programs
      ADD COLUMN access_type access_type_program DEFAULT 'free' NOT NULL;
  END IF;
END $$;

-- 4. Ensure coach_id column exists (should already exist from migration 20240101000041)
ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE;

-- 5. Update constraint to allow gym_id OR coach_id (not both)
-- Drop old constraint if it exists
ALTER TABLE public.workout_programs
  DROP CONSTRAINT IF EXISTS workout_programs_owner_check;

-- Add new constraint that allows:
-- - gym_id IS NULL AND coach_id IS NULL (Global plans - SuperAdmin)
-- - gym_id IS NOT NULL AND coach_id IS NULL (Gym Exclusive)
-- - gym_id IS NULL AND coach_id IS NOT NULL (Coach plans - future)
-- - NOT both set at the same time
ALTER TABLE public.workout_programs
  ADD CONSTRAINT workout_programs_owner_check CHECK (
    (gym_id IS NULL AND coach_id IS NULL) OR
    (gym_id IS NOT NULL AND coach_id IS NULL) OR
    (gym_id IS NULL AND coach_id IS NOT NULL)
  );

-- 6. Update existing programs based on gym_id
-- If gym_id IS NULL, set access_type to 'free' (Global Free)
-- If gym_id IS NOT NULL and price = 0, set to 'gym_members_only'
-- If price > 0, set to 'paid' (regardless of gym_id)
UPDATE public.workout_programs
SET access_type = CASE
  WHEN price > 0 THEN 'paid'::access_type_program
  WHEN gym_id IS NULL THEN 'free'::access_type_program
  WHEN gym_id IS NOT NULL THEN 'gym_members_only'::access_type_program
  ELSE 'free'::access_type_program
END
WHERE access_type IS NULL OR access_type = 'free'::access_type_program;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_programs_access_type ON public.workout_programs(access_type);
CREATE INDEX IF NOT EXISTS idx_workout_programs_gym_id ON public.workout_programs(gym_id) WHERE gym_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_programs_coach_id ON public.workout_programs(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_programs_price ON public.workout_programs(price) WHERE price > 0;

-- 8. Recreate RLS policies to support new access types

-- Global Free Programs: Anyone can view
CREATE POLICY "Global programs are viewable by all"
  ON public.workout_programs FOR SELECT
  USING (
    is_active = true 
    AND gym_id IS NULL 
    AND access_type = 'free'
  );

-- Gym Exclusive Programs: Only gym members can view
CREATE POLICY "Gym exclusive programs are viewable by gym members"
  ON public.workout_programs FOR SELECT
  USING (
    is_active = true 
    AND gym_id IS NOT NULL 
    AND access_type = 'gym_members_only'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
        AND p.home_gym_id = workout_programs.gym_id
    )
  );

-- Paid Programs: Visible to all (access control handled by payment logic)
CREATE POLICY "Paid programs are viewable by all"
  ON public.workout_programs FOR SELECT
  USING (
    is_active = true 
    AND access_type = 'paid'
  );

-- Coach Programs: Visible to all (future feature)
CREATE POLICY "Coach programs are viewable by all"
  ON public.workout_programs FOR SELECT
  USING (
    is_active = true 
    AND coach_id IS NOT NULL
  );

-- 8. Update user_has_program_access function to support new access types
CREATE OR REPLACE FUNCTION public.user_has_program_access(
  p_user_id UUID,
  p_program_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_program_access_type TEXT;
  v_program_gym_id UUID;
  v_user_home_gym_id UUID;
  v_user_has_membership BOOLEAN;
  v_user_has_paid BOOLEAN;
BEGIN
  -- Get program access type and gym_id
  SELECT access_type::text, gym_id INTO v_program_access_type, v_program_gym_id
  FROM public.workout_programs
  WHERE id = p_program_id AND is_active = true;

  -- If program doesn't exist or is inactive, no access
  IF v_program_access_type IS NULL THEN
    RETURN false;
  END IF;

  -- Free programs: everyone has access
  IF v_program_access_type = 'free' THEN
    RETURN true;
  END IF;

  -- Gym members only: check if user is a member of that gym
  IF v_program_access_type = 'gym_members_only' THEN
    -- Get user's home gym
    SELECT home_gym_id INTO v_user_home_gym_id
    FROM public.profiles
    WHERE id = p_user_id;
    
    -- Check if user's home gym matches program's gym
    IF v_user_home_gym_id = v_program_gym_id THEN
      RETURN true;
    END IF;
    
    -- Also check gym_memberships table
    SELECT EXISTS (
      SELECT 1 FROM public.gym_memberships
      WHERE user_id = p_user_id AND gym_id = v_program_gym_id
    ) INTO v_user_has_membership;
    
    RETURN v_user_has_membership;
  END IF;

  -- Paid: check if user has purchased or has active program
  IF v_program_access_type = 'paid' THEN
    -- Check if user has active program
    SELECT EXISTS (
      SELECT 1 FROM public.user_active_programs
      WHERE user_id = p_user_id 
        AND program_id = p_program_id
        AND status IN ('active', 'paused', 'completed')
    ) INTO v_user_has_paid;
    
    -- Also check transactions table for payments
    IF NOT v_user_has_paid THEN
      SELECT EXISTS (
        SELECT 1 FROM public.transactions
        WHERE user_id = p_user_id 
          AND item_id = p_program_id
          AND item_type = 'program'
          AND status = 'completed'
      ) INTO v_user_has_paid;
    END IF;
    
    RETURN v_user_has_paid;
  END IF;

  -- Default: no access
  RETURN false;
END;
$$;

-- 9. Add comments for documentation
COMMENT ON COLUMN public.workout_programs.access_type IS 'Access control type: free (anyone), gym_members_only (gym members only), paid (requires payment)';
COMMENT ON COLUMN public.workout_programs.gym_id IS 'If NULL, plan is Global. If set, plan is exclusive to that gym.';
COMMENT ON COLUMN public.workout_programs.coach_id IS 'If set, plan is created by a freelance coach (future feature).';
