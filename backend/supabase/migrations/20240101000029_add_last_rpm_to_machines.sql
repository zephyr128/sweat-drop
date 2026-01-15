-- Add last_rpm column to machines table for live activity monitoring
-- This field is updated periodically (every 30 seconds) during active workouts

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_rpm INTEGER DEFAULT 0;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_machines_last_rpm ON public.machines(last_rpm) WHERE last_rpm > 0;

-- Function to update last_rpm for a machine
CREATE OR REPLACE FUNCTION public.update_machine_rpm(
  p_machine_id UUID,
  p_user_id UUID,
  p_rpm INTEGER
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only update if this user owns the lock
  UPDATE public.machines
  SET last_rpm = p_rpm
  WHERE 
    id = p_machine_id 
    AND current_user_id = p_user_id
    AND is_busy = true;
  
  RETURN FOUND;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_machine_rpm(UUID, UUID, INTEGER) TO authenticated;

-- Function to reset last_rpm when machine is unlocked
CREATE OR REPLACE FUNCTION public.reset_machine_rpm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset RPM for all unlocked machines
  UPDATE public.machines
  SET last_rpm = 0
  WHERE is_busy = false;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.reset_machine_rpm() TO authenticated;
