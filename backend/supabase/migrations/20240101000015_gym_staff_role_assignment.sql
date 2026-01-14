-- Gym Staff Role Assignment System
-- This migration implements:
-- 1. Gym owner can assign gym_admin and receptionist per gym
-- 2. Gym admin can assign receptionist per gym
-- 3. Staff roles are tracked per gym (not globally)

-- 1. Update gym_staff table to support role assignment per gym
-- Ensure gym_staff table exists and has proper structure
CREATE TABLE IF NOT EXISTS public.gym_staff (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('gym_admin', 'receptionist')),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, gym_id)
);

-- Add assigned_by column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'gym_staff' 
    AND column_name = 'assigned_by'
  ) THEN
    ALTER TABLE public.gym_staff ADD COLUMN assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update role constraint if needed
DO $$
BEGIN
  -- Drop existing constraint if it exists and doesn't match
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'gym_staff_role_check' 
    AND table_name = 'gym_staff'
  ) THEN
    ALTER TABLE public.gym_staff DROP CONSTRAINT IF EXISTS gym_staff_role_check;
  END IF;
  
  -- Add new constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'gym_staff_role_check' 
    AND table_name = 'gym_staff'
  ) THEN
    ALTER TABLE public.gym_staff ADD CONSTRAINT gym_staff_role_check 
      CHECK (role IN ('gym_admin', 'receptionist'));
  END IF;
END $$;

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_gym_staff_user_id ON public.gym_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_gym_staff_gym_id ON public.gym_staff(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_staff_role ON public.gym_staff(role);

-- 3. Enable RLS
ALTER TABLE public.gym_staff ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for gym_staff
-- Superadmin can see all staff assignments
CREATE POLICY "superadmin_all_gym_staff" ON public.gym_staff
  FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym owners can see and manage staff for their gyms
CREATE POLICY "gym_owner_own_gym_staff" ON public.gym_staff
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = gym_staff.gym_id AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE id = gym_staff.gym_id AND owner_id = auth.uid()
    )
  );

-- Gym admins can see and manage receptionists for their assigned gym
CREATE POLICY "gym_admin_gym_staff" ON public.gym_staff
  FOR ALL
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid()) AND
    role = 'receptionist'
  )
  WITH CHECK (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid()) AND
    role = 'receptionist'
  );

-- Staff can see their own assignments
CREATE POLICY "staff_own_assignments" ON public.gym_staff
  FOR SELECT
  USING (user_id = auth.uid());

-- 5. Function to assign staff role to a user for a gym
CREATE OR REPLACE FUNCTION public.assign_staff_role(
  p_user_id UUID,
  p_gym_id UUID,
  p_role TEXT,
  p_assigned_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment_id UUID;
  v_assigner_role TEXT;
  v_gym_owner_id UUID;
BEGIN
  -- Get assigner's role
  SELECT role INTO v_assigner_role
  FROM public.profiles
  WHERE id = p_assigned_by;

  -- Get gym owner
  SELECT owner_id INTO v_gym_owner_id
  FROM public.gyms
  WHERE id = p_gym_id;

  -- Check permissions
  IF v_assigner_role = 'superadmin' THEN
    -- Superadmin can assign anyone
    NULL; -- Allow
  ELSIF v_assigner_role = 'gym_admin' AND p_assigned_by = v_gym_owner_id THEN
    -- Gym owner can assign gym_admin and receptionist
    IF p_role NOT IN ('gym_admin', 'receptionist') THEN
      RAISE EXCEPTION 'Gym owner can only assign gym_admin or receptionist';
    END IF;
  ELSIF v_assigner_role = 'gym_admin' AND p_assigned_by != v_gym_owner_id THEN
    -- Gym admin can only assign receptionist
    IF p_role != 'receptionist' THEN
      RAISE EXCEPTION 'Gym admin can only assign receptionist';
    END IF;
    -- Check if gym admin is assigned to this gym
    IF NOT EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE user_id = p_assigned_by AND gym_id = p_gym_id AND role = 'gym_admin'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_assigned_by AND admin_gym_id = p_gym_id AND role = 'gym_admin'
    ) THEN
      RAISE EXCEPTION 'Gym admin is not assigned to this gym';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions to assign staff role';
  END IF;

  -- Upsert staff assignment
  INSERT INTO public.gym_staff (user_id, gym_id, role, assigned_by)
  VALUES (p_user_id, p_gym_id, p_role, p_assigned_by)
  ON CONFLICT (user_id, gym_id) 
  DO UPDATE SET
    role = p_role,
    assigned_by = p_assigned_by,
    updated_at = NOW()
  RETURNING id INTO v_assignment_id;

  -- Update user's profile role if this is their primary gym
  -- (Keep existing logic for backward compatibility)
  UPDATE public.profiles
  SET 
    role = CASE 
      WHEN p_role = 'gym_admin' THEN 'gym_admin'::user_role
      WHEN p_role = 'receptionist' THEN 'receptionist'::user_role
      ELSE role
    END,
    admin_gym_id = CASE 
      WHEN p_role IN ('gym_admin', 'receptionist') THEN p_gym_id
      ELSE admin_gym_id
    END
  WHERE id = p_user_id;

  RETURN v_assignment_id;
END;
$$;

-- 6. Function to remove staff role assignment
CREATE OR REPLACE FUNCTION public.remove_staff_role(
  p_user_id UUID,
  p_gym_id UUID,
  p_removed_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remover_role TEXT;
  v_gym_owner_id UUID;
BEGIN
  -- Get remover's role
  SELECT role INTO v_remover_role
  FROM public.profiles
  WHERE id = p_removed_by;

  -- Get gym owner
  SELECT owner_id INTO v_gym_owner_id
  FROM public.gyms
  WHERE id = p_gym_id;

  -- Check permissions
  IF v_remover_role = 'superadmin' THEN
    -- Superadmin can remove anyone
    NULL; -- Allow
  ELSIF p_removed_by = v_gym_owner_id THEN
    -- Gym owner can remove staff from their gyms
    NULL; -- Allow
  ELSIF v_remover_role = 'gym_admin' THEN
    -- Gym admin can only remove receptionists
    IF NOT EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE user_id = p_user_id AND gym_id = p_gym_id AND role = 'receptionist'
    ) THEN
      RAISE EXCEPTION 'Gym admin can only remove receptionists';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions to remove staff role';
  END IF;

  -- Remove assignment
  DELETE FROM public.gym_staff
  WHERE user_id = p_user_id AND gym_id = p_gym_id;
END;
$$;

-- 7. Function to get staff for a gym
CREATE OR REPLACE FUNCTION public.get_gym_staff(p_gym_id UUID)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  email TEXT,
  full_name TEXT,
  role TEXT,
  assigned_at TIMESTAMPTZ,
  assigned_by_username TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    gs.user_id,
    p.username,
    p.email,
    p.full_name,
    gs.role,
    gs.created_at AS assigned_at,
    assigner.username AS assigned_by_username
  FROM public.gym_staff gs
  JOIN public.profiles p ON gs.user_id = p.id
  LEFT JOIN public.profiles assigner ON gs.assigned_by = assigner.id
  WHERE gs.gym_id = p_gym_id
  ORDER BY gs.created_at DESC;
$$;

-- 8. Comments
COMMENT ON TABLE public.gym_staff IS 'Staff role assignments per gym. Gym owners can assign gym_admin and receptionist. Gym admins can assign receptionist.';
COMMENT ON FUNCTION public.assign_staff_role IS 'Assign a staff role (gym_admin or receptionist) to a user for a specific gym';
COMMENT ON FUNCTION public.remove_staff_role IS 'Remove a staff role assignment from a user for a specific gym';
COMMENT ON FUNCTION public.get_gym_staff IS 'Get all staff members assigned to a gym';
