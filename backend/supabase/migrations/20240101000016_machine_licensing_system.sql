-- Machine Licensing System
-- Refactors machine management to follow licensing model:
-- SuperAdmin: Can create machines, pair sensors, set gym_id, toggle is_active
-- GymOwner/GymAdmin: Can only view and edit name/type of machines assigned to their gym

-- 1. Add sensor_id column to machines table
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS sensor_id TEXT,
  ADD COLUMN IF NOT EXISTS sensor_paired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sensor_paired_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Create index for sensor_id
CREATE INDEX IF NOT EXISTS idx_machines_sensor_id ON public.machines(sensor_id) WHERE sensor_id IS NOT NULL;

-- 3. Drop existing RLS policies for machines (we'll recreate them with new permissions)
DROP POLICY IF EXISTS "Anyone can view active machines" ON public.machines;
DROP POLICY IF EXISTS "Gym admins can manage machines" ON public.machines;
DROP POLICY IF EXISTS "Superadmins can manage all machines" ON public.machines;

-- 4. New RLS Policies for licensing model

-- Anyone can view active machines (for QR scanning in mobile app)
CREATE POLICY "Anyone can view active machines"
  ON public.machines FOR SELECT
  USING (is_active = true);

-- SuperAdmins can view all machines (including inactive)
CREATE POLICY "Superadmins can view all machines"
  ON public.machines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- Gym owners/admins can view machines assigned to their gym
CREATE POLICY "Gym owners can view their gym machines"
  ON public.machines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.gyms g ON g.id = machines.gym_id
      WHERE p.id = auth.uid()
      AND (p.role = 'gym_admin' OR p.role = 'superadmin')
      AND (
        -- User owns the gym
        g.owner_id = p.id
        OR
        -- User is assigned to the gym
        p.admin_gym_id = machines.gym_id
      )
    )
  );

-- SuperAdmins can create machines
CREATE POLICY "Superadmins can create machines"
  ON public.machines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- SuperAdmins can update all fields (including sensor_id, gym_id, is_active)
CREATE POLICY "Superadmins can update all machine fields"
  ON public.machines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- Gym owners/admins can update machines assigned to their gym
-- Note: Restriction to only name/type is enforced in server actions, not RLS
-- RLS policies cannot use OLD/NEW references, so we rely on application-level enforcement
CREATE POLICY "Gym owners can update their gym machines"
  ON public.machines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.gyms g ON g.id = machines.gym_id
      WHERE p.id = auth.uid()
      AND (p.role = 'gym_admin' OR p.role = 'superadmin')
      AND (
        g.owner_id = p.id
        OR
        p.admin_gym_id = machines.gym_id
      )
    )
  );

-- SuperAdmins can delete machines
CREATE POLICY "Superadmins can delete machines"
  ON public.machines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- 5. Function to pair sensor to machine (SuperAdmin only)
CREATE OR REPLACE FUNCTION public.pair_sensor_to_machine(
  p_machine_id UUID,
  p_sensor_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role user_role;
BEGIN
  -- Check if user is superadmin
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_user_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmins can pair sensors to machines';
  END IF;

  -- Check if sensor is already paired to another machine
  IF EXISTS (
    SELECT 1 FROM public.machines
    WHERE sensor_id = p_sensor_id
    AND id != p_machine_id
  ) THEN
    RAISE EXCEPTION 'Sensor is already paired to another machine';
  END IF;

  -- Update machine with sensor_id
  UPDATE public.machines
  SET 
    sensor_id = p_sensor_id,
    sensor_paired_at = NOW(),
    sensor_paired_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_machine_id;

  RETURN TRUE;
END;
$$;

-- 6. Comments
COMMENT ON COLUMN public.machines.sensor_id IS 'BLE sensor identifier paired to this machine (SuperAdmin only)';
COMMENT ON COLUMN public.machines.sensor_paired_at IS 'Timestamp when sensor was paired';
COMMENT ON COLUMN public.machines.sensor_paired_by IS 'User who paired the sensor (must be superadmin)';
COMMENT ON FUNCTION public.pair_sensor_to_machine(UUID, TEXT) IS 'Pairs a BLE sensor to a machine (SuperAdmin only)';
