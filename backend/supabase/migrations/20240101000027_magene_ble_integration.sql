-- Magene Gemini 210 BLE Integration
-- Adds sensor pairing, QR codes, and machine locking system

-- 1. Add new columns to machines table
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS sensor_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS qr_uuid UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS is_busy BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS current_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_machines_qr_uuid ON public.machines(qr_uuid);
CREATE INDEX IF NOT EXISTS idx_machines_sensor_id ON public.machines(sensor_id);
CREATE INDEX IF NOT EXISTS idx_machines_is_busy ON public.machines(is_busy);
CREATE INDEX IF NOT EXISTS idx_machines_current_user_id ON public.machines(current_user_id);

-- 3. Function to automatically unlock machine if heartbeat is stale (30+ seconds)
CREATE OR REPLACE FUNCTION public.unlock_stale_machines()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.machines
  SET 
    is_busy = false,
    current_user_id = NULL,
    last_heartbeat = NULL
  WHERE 
    is_busy = true
    AND (
      last_heartbeat IS NULL 
      OR last_heartbeat < NOW() - INTERVAL '30 seconds'
    );
END;
$$;

-- 4. Function to lock machine (called when workout starts)
CREATE OR REPLACE FUNCTION public.lock_machine(
  p_machine_id UUID,
  p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
BEGIN
  -- Check if machine is already locked by another user
  SELECT current_user_id INTO v_current_user_id
  FROM public.machines
  WHERE id = p_machine_id AND is_busy = true;
  
  IF v_current_user_id IS NOT NULL AND v_current_user_id != p_user_id THEN
    RETURN false; -- Machine is busy
  END IF;
  
  -- Lock the machine
  UPDATE public.machines
  SET 
    is_busy = true,
    current_user_id = p_user_id,
    last_heartbeat = NOW()
  WHERE id = p_machine_id;
  
  RETURN true;
END;
$$;

-- 5. Function to unlock machine (called when workout ends)
CREATE OR REPLACE FUNCTION public.unlock_machine(
  p_machine_id UUID,
  p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only unlock if this user owns the lock
  UPDATE public.machines
  SET 
    is_busy = false,
    current_user_id = NULL,
    last_heartbeat = NULL
  WHERE 
    id = p_machine_id 
    AND current_user_id = p_user_id;
  
  RETURN true;
END;
$$;

-- 6. Function to update heartbeat (called periodically during workout)
CREATE OR REPLACE FUNCTION public.update_machine_heartbeat(
  p_machine_id UUID,
  p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only update if this user owns the lock
  UPDATE public.machines
  SET last_heartbeat = NOW()
  WHERE 
    id = p_machine_id 
    AND current_user_id = p_user_id
    AND is_busy = true;
  
  RETURN FOUND;
END;
$$;

-- 7. RLS Policies for machine locking
-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view machine status" ON public.machines;
DROP POLICY IF EXISTS "Superadmins can pair sensors" ON public.machines;

-- Users can view machine status
CREATE POLICY "Users can view machine status"
  ON public.machines FOR SELECT
  USING (true);

-- Only superadmin can pair sensors
CREATE POLICY "Superadmins can pair sensors"
  ON public.machines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Users can update heartbeat (via RPC function)
-- Lock/unlock is handled via RPC functions above

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.lock_machine(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_machine(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_machine_heartbeat(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_stale_machines() TO authenticated;
