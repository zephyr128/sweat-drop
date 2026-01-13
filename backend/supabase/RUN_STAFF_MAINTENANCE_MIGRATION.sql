-- Run this SQL script in Supabase SQL Editor to create staff_invitations and machine_reports tables
-- This is a manual migration script for the staff roles and maintenance system

-- 1. Create machine_reports table for user-reported issues
CREATE TABLE IF NOT EXISTS public.machine_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  machine_id UUID REFERENCES public.machines(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('sensor_not_connecting', 'machine_broken', 'missing_qr')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 2. Add maintenance flag to machines table
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS is_under_maintenance BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS maintenance_notes TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maintenance_started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_machine_reports_machine_id ON public.machine_reports(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_reports_user_id ON public.machine_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_machine_reports_status ON public.machine_reports(status);
CREATE INDEX IF NOT EXISTS idx_machines_maintenance ON public.machines(is_under_maintenance);

-- 4. Enable RLS for machine_reports
ALTER TABLE public.machine_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can create machine reports" ON public.machine_reports;
DROP POLICY IF EXISTS "Users can view own reports" ON public.machine_reports;
DROP POLICY IF EXISTS "Superadmins can view all reports" ON public.machine_reports;
DROP POLICY IF EXISTS "Gym admins can view gym machine reports" ON public.machine_reports;
DROP POLICY IF EXISTS "Receptionists can view gym machine reports" ON public.machine_reports;
DROP POLICY IF EXISTS "Gym admins can update gym machine reports" ON public.machine_reports;

-- Users can create reports for machines
CREATE POLICY "Users can create machine reports"
  ON public.machine_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own reports
CREATE POLICY "Users can view own reports"
  ON public.machine_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Superadmins can view all reports
CREATE POLICY "Superadmins can view all reports"
  ON public.machine_reports FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can view reports for machines in their gym
CREATE POLICY "Gym admins can view gym machine reports"
  ON public.machine_reports FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.machines
      WHERE machines.id = machine_reports.machine_id
      AND machines.gym_id = public.get_admin_gym_id(auth.uid())
    )
  );

-- Receptionists can view reports for machines in their gym
CREATE POLICY "Receptionists can view gym machine reports"
  ON public.machine_reports FOR SELECT
  USING (
    public.is_receptionist(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.machines
      WHERE machines.id = machine_reports.machine_id
      AND machines.gym_id = public.get_admin_gym_id(auth.uid())
    )
  );

-- Gym admins can update reports for machines in their gym
CREATE POLICY "Gym admins can update gym machine reports"
  ON public.machine_reports FOR UPDATE
  USING (
    public.is_gym_admin(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.machines
      WHERE machines.id = machine_reports.machine_id
      AND machines.gym_id = public.get_admin_gym_id(auth.uid())
    )
  );

-- 5. Create staff_invitations table for team management
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL CHECK (role IN ('gym_admin', 'receptionist')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days') NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 6. Create indexes for staff_invitations
CREATE INDEX IF NOT EXISTS idx_staff_invitations_gym_id ON public.staff_invitations(gym_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations(email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON public.staff_invitations(token);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations(status);

-- Create partial unique index to ensure only one pending invitation per gym+email
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitations_unique_pending 
  ON public.staff_invitations(gym_id, email) 
  WHERE status = 'pending';

-- 7. Enable RLS for staff_invitations
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Superadmins can view all invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Gym admins can view gym invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Gym admins can create gym invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Gym admins can update gym invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Users can view own invitations" ON public.staff_invitations;

-- Superadmins can view all invitations
CREATE POLICY "Superadmins can view all invitations"
  ON public.staff_invitations FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- Gym admins can view invitations for their gym
CREATE POLICY "Gym admins can view gym invitations"
  ON public.staff_invitations FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Gym admins can create invitations for their gym
CREATE POLICY "Gym admins can create gym invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid()) AND
    invited_by = auth.uid()
  );

-- Gym admins can update invitations for their gym
CREATE POLICY "Gym admins can update gym invitations"
  ON public.staff_invitations FOR UPDATE
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = public.get_admin_gym_id(auth.uid())
  );

-- Users can view invitations sent to their email
CREATE POLICY "Users can view own invitations"
  ON public.staff_invitations FOR SELECT
  USING (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- 8. Function to accept staff invitation
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation public.staff_invitations%ROWTYPE;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get invitation
  SELECT * INTO v_invitation
  FROM public.staff_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Verify email matches
  SELECT email INTO v_user_email
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_email != v_invitation.email THEN
    RAISE EXCEPTION 'Invitation email does not match user email';
  END IF;

  -- Update profile with role and gym
  UPDATE public.profiles
  SET 
    role = v_invitation.role,
    admin_gym_id = v_invitation.gym_id,
    updated_at = NOW()
  WHERE id = v_user_id;

  -- Mark invitation as accepted
  UPDATE public.staff_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    accepted_by = v_user_id
  WHERE id = v_invitation.id;

  RETURN v_invitation.gym_id;
END;
$$;

-- 9. Function to get machines with active reports
CREATE OR REPLACE FUNCTION public.get_machines_with_reports(p_gym_id UUID)
RETURNS TABLE (
  machine_id UUID,
  machine_name TEXT,
  report_count BIGINT,
  latest_report_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    m.id as machine_id,
    m.name as machine_name,
    COUNT(mr.id) as report_count,
    MAX(mr.created_at) as latest_report_at
  FROM public.machines m
  LEFT JOIN public.machine_reports mr ON mr.machine_id = m.id AND mr.status = 'pending'
  WHERE m.gym_id = p_gym_id
  GROUP BY m.id, m.name
  HAVING COUNT(mr.id) > 0
  ORDER BY latest_report_at DESC;
$$;

-- 10. Comments for documentation
COMMENT ON TABLE public.machine_reports IS 'User-reported issues with machines (sensor, broken, missing QR)';
COMMENT ON TABLE public.staff_invitations IS 'Invitations for staff members to join gym as admin or receptionist';
COMMENT ON COLUMN public.machines.is_under_maintenance IS 'Flag to mark machine as unavailable for workouts';
COMMENT ON FUNCTION public.accept_staff_invitation(TEXT) IS 'Accepts a staff invitation and updates user role and gym assignment';
COMMENT ON FUNCTION public.get_machines_with_reports(UUID) IS 'Returns machines with pending reports for a gym';
