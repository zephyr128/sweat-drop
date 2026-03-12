-- Migration: 20260306000005_add_withdraw_gym_from_arena.sql
-- Description: Add withdraw_gym_from_arena() function to allow gyms to withdraw from arenas before they start
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- 
-- CHANGES:
-- - Update arena_invitations.status CHECK constraint to include 'withdrawn'
-- - Create withdraw_gym_from_arena() function with full transaction logic
-- - Refund drops to participants, remove participants, update invitation status, remove from arena_gyms

-- ============================================================================
-- 1. UPDATE CHECK constraint: arena_invitations.status — Add 'withdrawn'
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.arena_invitations
  DROP CONSTRAINT IF EXISTS arena_invitations_status_check;

-- Add new constraint with 'withdrawn'
ALTER TABLE public.arena_invitations
  ADD CONSTRAINT arena_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn'));

-- ============================================================================
-- 2. CREATE FUNCTION: withdraw_gym_from_arena()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.withdraw_gym_from_arena(
  p_arena_id UUID,
  p_gym_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_arena RECORD;
  v_invitation RECORD;
  v_participant RECORD;
  v_participants_removed INTEGER := 0;
  v_drops_refunded_total INTEGER := 0;
  v_drops_refunded INTEGER;
  v_has_permission BOOLEAN := false;
BEGIN
  -- 1. Fetch arena — check it exists
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Arena not found.'
    );
  END IF;

  -- 2. Check start_date > CURRENT_DATE (arena hasn't started yet)
  -- Note: start_date is DATE type, so we compare with CURRENT_DATE
  IF v_arena.start_date <= CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Arena je već počela, povlačenje nije moguće.'
    );
  END IF;

  -- 3. Check that gym has accepted invitation (status = 'accepted')
  SELECT * INTO v_invitation
  FROM public.arena_invitations
  WHERE arena_id = p_arena_id
    AND invited_gym_id = p_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teretana ne učestvuje u ovoj areni.'
    );
  END IF;

  IF v_invitation.status != 'accepted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teretana ne učestvuje u ovoj areni.'
    );
  END IF;

  -- 4. Check caller has permission: gym owner/admin of the gym OR superadmin
  -- Superadmin can withdraw any gym
  IF public.is_superadmin(v_user_id) THEN
    v_has_permission := true;
  -- Gym owner/admin can withdraw their own gym
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id
      AND role IN ('gym_owner', 'gym_admin')
      AND (
        -- gym_admin: check admin_gym_id
        (role = 'gym_admin' AND admin_gym_id = p_gym_id) OR
        -- gym_owner: check if gym.owner_id matches or admin_gym_id matches
        (role = 'gym_owner' AND (
          EXISTS (SELECT 1 FROM public.gyms WHERE id = p_gym_id AND owner_id = v_user_id) OR
          admin_gym_id = p_gym_id
        ))
      )
  ) THEN
    v_has_permission := true;
  END IF;

  IF NOT v_has_permission THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nemate pravo da povučete teretanu iz ove arene.'
    );
  END IF;

  -- 5. Refund drops to all participants from this gym who paid opt-in
  FOR v_participant IN
    SELECT ap.user_id, ap.gym_id, ap.opt_in_drops_paid
    FROM public.arena_participants ap
    WHERE ap.arena_id = p_arena_id
      AND ap.gym_id = p_gym_id
      AND ap.opt_in_drops_paid > 0
  LOOP
    v_drops_refunded := COALESCE(v_participant.opt_in_drops_paid, 0);

    -- 5a. Refund global drops
    UPDATE public.profiles
    SET total_drops = total_drops + v_drops_refunded,
        updated_at = NOW()
    WHERE id = v_participant.user_id;

    -- 5b. Refund local gym drops
    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance + v_drops_refunded,
        updated_at = NOW()
    WHERE user_id = v_participant.user_id
      AND gym_id = v_participant.gym_id;

    -- 5c. Record refund transaction
    INSERT INTO public.drops_transactions (
      user_id, gym_id, amount, transaction_type, reference_id, description, created_at
    ) VALUES (
      v_participant.user_id,
      v_participant.gym_id,
      v_drops_refunded,
      'refund',
      p_arena_id,
      'Arena povlačenje: ' || v_arena.name || ' — ' || v_drops_refunded || ' drops refunded',
      NOW()
    );

    v_drops_refunded_total := v_drops_refunded_total + v_drops_refunded;
  END LOOP;

  -- 6. DELETE FROM arena_participants (all participants from this gym, even if no drops to refund)
  DELETE FROM public.arena_participants
  WHERE arena_id = p_arena_id
    AND gym_id = p_gym_id;

  GET DIAGNOSTICS v_participants_removed = ROW_COUNT;

  -- 7. UPDATE arena_invitations — Set status = 'withdrawn'
  UPDATE public.arena_invitations
  SET status = 'withdrawn',
      responded_at = NOW(),
      responded_by = v_user_id,
      updated_at = NOW()
  WHERE arena_id = p_arena_id
    AND invited_gym_id = p_gym_id;

  -- 8. DELETE FROM arena_gyms
  DELETE FROM public.arena_gyms
  WHERE arena_id = p_arena_id
    AND gym_id = p_gym_id;

  -- 9. RETURN success with counts
  RETURN jsonb_build_object(
    'success', true,
    'participants_removed', v_participants_removed,
    'drops_refunded_total', v_drops_refunded_total
  );
END;
$$;

COMMENT ON FUNCTION public.withdraw_gym_from_arena(UUID, UUID) IS
  'Allows a gym to withdraw from an arena before it starts. Refunds drops to all participants from that gym who paid opt-in. '
  'Only works if arena start_date > CURRENT_DATE. Requires gym owner/admin of the gym or superadmin.';

GRANT EXECUTE ON FUNCTION public.withdraw_gym_from_arena(UUID, UUID) TO authenticated;
