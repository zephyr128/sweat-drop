-- ============================================================================
-- Superadmin tooling: Gym ownership transfer + force email change (audit trail)
-- ============================================================================
-- Context:
--   Superadmins need a supported way to (a) transfer a gym from owner A to
--   owner B (existing user or via invitation), and (b) force-change a user's
--   email when they request it. Both paths require an audit trail for
--   dispute resolution and compliance.
--
--   Actual mutations happen from admin panel server actions using the admin
--   client (service-role key), so these tables are write-locked via RLS and
--   only readable by superadmins. The admin client bypasses RLS for inserts.
--
--   accept_owner_invitation is updated (in-place, same signature) so that the
--   automatic gyms.owner_id update done on invitation acceptance also logs
--   an 'invitation_accepted' row to gym_ownership_history.
-- ============================================================================

-- ── gym_ownership_history ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gym_ownership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  old_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_method text NOT NULL CHECK (
    change_method IN ('invite', 'assign_existing', 'unassign', 'invitation_accepted')
  ),
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gym_ownership_history_gym_id
  ON public.gym_ownership_history(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_ownership_history_changed_at
  ON public.gym_ownership_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gym_ownership_history_new_owner_id
  ON public.gym_ownership_history(new_owner_id)
  WHERE new_owner_id IS NOT NULL;

ALTER TABLE public.gym_ownership_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can view gym ownership history"
  ON public.gym_ownership_history;
CREATE POLICY "Superadmins can view gym ownership history"
  ON public.gym_ownership_history FOR SELECT
  USING (public.is_superadmin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy for end users — writes happen only through
-- the admin client (service role bypasses RLS) or the trigger below.

COMMENT ON TABLE public.gym_ownership_history IS
  'Audit trail for every change to gyms.owner_id. Written by admin panel server actions and by accept_owner_invitation trigger. Read-only for superadmins via RLS.';

-- ── user_email_change_history ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_email_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_email text NOT NULL,
  new_email text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_email_change_history_user_id
  ON public.user_email_change_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_change_history_changed_at
  ON public.user_email_change_history(changed_at DESC);

ALTER TABLE public.user_email_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can view email change history"
  ON public.user_email_change_history;
CREATE POLICY "Superadmins can view email change history"
  ON public.user_email_change_history FOR SELECT
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own email change history"
  ON public.user_email_change_history;
CREATE POLICY "Users can view their own email change history"
  ON public.user_email_change_history FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.user_email_change_history IS
  'Audit trail for superadmin-forced email changes on auth.users/profiles. Never exposed in product UI except for superadmins and for the affected user.';

-- ── Update accept_owner_invitation: also write audit row ────────────────────

CREATE OR REPLACE FUNCTION public.accept_owner_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.staff_invitations%ROWTYPE;
  v_user_id UUID;
  v_user_email TEXT;
  v_old_owner_id UUID;
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
  UPDATE public.profiles
  SET
    role = 'gym_owner',
    owner_id = NULL,
    updated_at = NOW()
  WHERE id = v_user_id;

  -- If invitation has gym_id, assign the gym to this owner and log the change
  IF v_invitation.gym_id IS NOT NULL THEN
    -- Capture previous owner for audit
    SELECT owner_id INTO v_old_owner_id
    FROM public.gyms
    WHERE id = v_invitation.gym_id;

    UPDATE public.gyms
    SET owner_id = v_user_id
    WHERE id = v_invitation.gym_id;

    -- Only log when ownership actually changed (avoid no-op rows if the
    -- same user accepts an invitation twice, shouldn't happen but defensive)
    IF v_old_owner_id IS DISTINCT FROM v_user_id THEN
      INSERT INTO public.gym_ownership_history (
        gym_id, old_owner_id, new_owner_id, changed_by, change_method, reason
      ) VALUES (
        v_invitation.gym_id,
        v_old_owner_id,
        v_user_id,
        v_invitation.invited_by,
        'invitation_accepted',
        'Owner accepted invitation ' || v_invitation.id::text
      );
    END IF;
  END IF;

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

COMMENT ON FUNCTION public.accept_owner_invitation(TEXT) IS
  'Accepts a gym_owner invitation. Promotes caller to gym_owner role and, when the invitation carries a gym_id, atomically reassigns gyms.owner_id and writes a gym_ownership_history audit row with method=invitation_accepted.';
