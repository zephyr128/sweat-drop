-- Fix accept_staff_invitation function to use assigned_gym_id instead of admin_gym_id
-- This aligns with the new hierarchical multi-tenant model

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

  IF v_user_email IS NULL OR LOWER(v_user_email) != LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Invitation email does not match user email';
  END IF;

  -- Update profile with role and assigned_gym_id (not admin_gym_id)
  UPDATE public.profiles
  SET 
    role = v_invitation.role,
    assigned_gym_id = v_invitation.gym_id, -- Use assigned_gym_id instead of admin_gym_id
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
