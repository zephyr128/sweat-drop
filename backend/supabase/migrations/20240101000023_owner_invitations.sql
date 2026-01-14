-- Owner Invitations System
-- Extends staff_invitations to support gym_owner role invitations

-- Update staff_invitations table to allow gym_owner role
ALTER TABLE public.staff_invitations
  DROP CONSTRAINT IF EXISTS staff_invitations_role_check;

ALTER TABLE public.staff_invitations
  ADD CONSTRAINT staff_invitations_role_check 
  CHECK (role IN ('gym_admin', 'receptionist', 'gym_owner'));

-- Update the role column type if needed (it should already be user_role enum)
-- The enum should already include 'gym_owner' from previous migrations

-- Function to accept owner invitation
CREATE OR REPLACE FUNCTION public.accept_owner_invitation(p_token TEXT)
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
    AND role = 'gym_owner'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired owner invitation token';
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

  IF v_user_email IS NULL OR LOWER(v_user_email) != LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Invitation email does not match user email';
  END IF;

  -- Update profile with gym_owner role
  -- Note: gym_owner doesn't use assigned_gym_id, they own gyms via gyms.owner_id
  UPDATE public.profiles
  SET 
    role = 'gym_owner',
    owner_id = NULL, -- owner_id in profiles is not used for gym_owner
    updated_at = NOW()
  WHERE id = v_user_id;

  -- If invitation has gym_id, assign the gym to this owner
  IF v_invitation.gym_id IS NOT NULL THEN
    UPDATE public.gyms
    SET owner_id = v_user_id
    WHERE id = v_invitation.gym_id;
  END IF;

  -- Mark invitation as accepted
  UPDATE public.staff_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    accepted_by = v_user_id
  WHERE id = v_invitation.id;

  -- Return the gym_id if available, otherwise return NULL
  RETURN v_invitation.gym_id;
END;
$$;

-- RLS Policy: Superadmins can create owner invitations
DROP POLICY IF EXISTS "Superadmins can create owner invitations" ON public.staff_invitations;
CREATE POLICY "Superadmins can create owner invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    public.is_superadmin(auth.uid()) AND
    role = 'gym_owner' AND
    invited_by = auth.uid()
  );

-- RLS Policy: Superadmins can view owner invitations
DROP POLICY IF EXISTS "Superadmins can view owner invitations" ON public.staff_invitations;
CREATE POLICY "Superadmins can view owner invitations"
  ON public.staff_invitations FOR SELECT
  USING (
    public.is_superadmin(auth.uid()) OR
    role = 'gym_owner'
  );

-- Note: The existing "Public can view invitations by token" policy already covers unauthenticated access
