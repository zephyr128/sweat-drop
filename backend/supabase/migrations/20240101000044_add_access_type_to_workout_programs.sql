-- Add access_type to workout_programs table
-- Mirrors the access_type functionality from workout_plans

-- 1. Ensure access_type ENUM exists (it should already exist from migration 20240101000037)
DO $$
BEGIN
  CREATE TYPE access_type AS ENUM ('free', 'membership_required', 'paid_one_time');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add access_type column to workout_programs
ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS access_type access_type DEFAULT 'free' NOT NULL;

-- 3. Add currency column for consistency with workout_plans
ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' NOT NULL;

-- 4. Ensure price constraint is correct
DO $$
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workout_programs_price_check' 
    AND conrelid = 'public.workout_programs'::regclass
  ) THEN
    ALTER TABLE public.workout_programs DROP CONSTRAINT workout_programs_price_check;
  END IF;
END $$;

-- Add constraint back
ALTER TABLE public.workout_programs
  ADD CONSTRAINT workout_programs_price_check CHECK (price >= 0);

-- 5. Create index for performance
CREATE INDEX IF NOT EXISTS idx_workout_programs_access_type ON public.workout_programs(access_type);
CREATE INDEX IF NOT EXISTS idx_workout_programs_price ON public.workout_programs(price) WHERE price > 0;

-- 6. Add comment for documentation
COMMENT ON COLUMN public.workout_programs.access_type IS 'Access control type: free (anyone), membership_required (gym members only), paid_one_time (requires payment)';
COMMENT ON COLUMN public.workout_programs.currency IS 'Currency code for pricing (e.g., USD, EUR)';

-- 7. Update existing programs to have appropriate access_type based on price
-- If price > 0, set to 'paid_one_time', otherwise keep as 'free'
UPDATE public.workout_programs
SET access_type = CASE
  WHEN price > 0 THEN 'paid_one_time'::access_type
  ELSE 'free'::access_type
END
WHERE access_type = 'free'::access_type;

-- 8. Update RLS policies to consider access_type (similar to workout_plans)
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Public programs are viewable by all" ON public.workout_programs;
DROP POLICY IF EXISTS "Gym members can view gym programs" ON public.workout_programs;

-- Recreate policies with access_type support
CREATE POLICY "Public programs are viewable by all"
  ON public.workout_programs FOR SELECT
  USING (is_active = true AND access_type = 'free');

CREATE POLICY "Gym members can view gym programs"
  ON public.workout_programs FOR SELECT
  USING (
    is_active = true AND access_type = 'membership_required'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.home_gym_id = workout_programs.gym_id
    )
  );

-- Note: Paid programs require payment verification through transactions table
-- This is handled by application logic, not RLS policies

-- 9. Function to check user access to a program
-- Returns true if user has access (free, has membership, or has paid)
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
  v_program_access_type access_type;
  v_program_gym_id UUID;
  v_user_has_membership BOOLEAN;
  v_user_has_paid BOOLEAN;
BEGIN
  -- Get program access type and gym_id
  SELECT access_type, gym_id INTO v_program_access_type, v_program_gym_id
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

  -- Membership required: check if user has active membership in the gym
  IF v_program_access_type = 'membership_required' THEN
    -- Check if user has gym_membership for this gym
    SELECT EXISTS (
      SELECT 1 FROM public.gym_memberships
      WHERE user_id = p_user_id AND gym_id = v_program_gym_id
    ) INTO v_user_has_membership;
    
    RETURN v_user_has_membership;
  END IF;

  -- Paid one-time: check if user has active program or one-time payment
  IF v_program_access_type = 'paid_one_time' THEN
    -- Check if user has active program (user_active_programs)
    SELECT EXISTS (
      SELECT 1 FROM public.user_active_programs
      WHERE user_id = p_user_id 
        AND program_id = p_program_id
        AND status IN ('active', 'paused', 'completed')
    ) INTO v_user_has_paid;
    
    -- Also check transactions table for one-time payments
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

COMMENT ON FUNCTION public.user_has_program_access IS 'Checks if a user has access to a program based on access_type (free, membership, or payment)';
