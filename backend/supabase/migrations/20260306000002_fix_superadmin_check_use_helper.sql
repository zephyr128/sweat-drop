-- Migration: 20260306000002_fix_superadmin_check_use_helper.sql
-- Description: Fix superadmin role check in arena functions to use is_superadmin() helper
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- Problem: Direct SELECT from profiles table in SECURITY DEFINER functions may be blocked by RLS
-- Solution: Use is_superadmin() helper function which is SECURITY DEFINER and bypasses RLS
-- 
-- CHANGES:
-- - Update send_arena_invitations() to use is_superadmin() helper
-- - Update cancel_arena() to use is_superadmin() helper
-- - Update arena_invitations RLS policy to use is_superadmin() helper

-- ============================================================================
-- 1. UPDATE FUNCTION: send_arena_invitations() — Use is_superadmin() helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_arena_invitations(
  p_arena_id UUID,
  p_gym_ids UUID[],
  p_revenue_share_percent NUMERIC DEFAULT 0,
  p_revenue_share_note TEXT DEFAULT NULL
)
RETURNS TABLE(sent_count INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_gym_id UUID;
  v_count INTEGER := 0;
  v_gym_owner_id UUID;
BEGIN
  -- Verify caller is superadmin (use helper function to bypass RLS)
  IF NOT public.is_superadmin(v_user_id) THEN
    RETURN QUERY SELECT 0, 'Only superadmin can send arena invitations.'::TEXT;
    RETURN;
  END IF;

  -- Verify arena exists
  IF NOT EXISTS (
    SELECT 1 FROM public.sweat_arenas WHERE id = p_arena_id
  ) THEN
    RETURN QUERY SELECT 0, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- Send invitations for each gym
  FOREACH v_gym_id IN ARRAY p_gym_ids
  LOOP
    -- Find the gym owner
    SELECT owner_id INTO v_gym_owner_id
    FROM public.gyms
    WHERE id = v_gym_id;

    -- Check if invitation already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.arena_invitations
      WHERE arena_id = p_arena_id AND invited_gym_id = v_gym_id
    ) THEN
      -- Insert new invitation
      INSERT INTO public.arena_invitations (
        arena_id, invited_gym_id, invited_by, invited_user_id,
        revenue_share_percent, revenue_share_note, status
      )
      VALUES (
        p_arena_id, v_gym_id, v_user_id, v_gym_owner_id,
        p_revenue_share_percent, p_revenue_share_note, 'pending'
      );
      
      v_count := v_count + 1;
    END IF;
    -- If invitation already exists, skip (don't count)
  END LOOP;

  RETURN QUERY SELECT v_count, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 2. UPDATE FUNCTION: cancel_arena() — Use is_superadmin() helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, participants_refunded INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_arena RECORD;
  v_participant RECORD;
  v_refund_count INTEGER := 0;
  v_drops_to_refund INTEGER;
BEGIN
  -- 1. Only superadmin can cancel (use helper function to bypass RLS)
  IF NOT public.is_superadmin(v_user_id) THEN
    RETURN QUERY SELECT false, 0, 'Only superadmin can cancel arenas.'::TEXT;
    RETURN;
  END IF;

  -- 2. Fetch arena
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- 3. Can only cancel active or upcoming arenas (not finalized)
  IF v_arena.is_finalized THEN
    RETURN QUERY SELECT false, 0, 'Cannot cancel a finalized arena.'::TEXT;
    RETURN;
  END IF;

  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 0, 'Arena is already cancelled/inactive.'::TEXT;
    RETURN;
  END IF;

  -- 4. If opt_in_type was 'drops', refund all participants
  -- Use per-participant opt_in_drops_paid (handles edge case where opt_in_value changed)
  FOR v_participant IN
    SELECT ap.user_id, ap.gym_id, ap.opt_in_drops_paid
    FROM public.arena_participants ap
    WHERE ap.arena_id = p_arena_id
  LOOP
    v_drops_to_refund := COALESCE(v_participant.opt_in_drops_paid, 0);
    
    IF v_drops_to_refund > 0 THEN
      -- 4a. Refund global drops
      UPDATE public.profiles
      SET total_drops = total_drops + v_drops_to_refund,
          updated_at = NOW()
      WHERE id = v_participant.user_id;

      -- 4b. Refund local gym drops
      UPDATE public.gym_memberships
      SET local_drops_balance = local_drops_balance + v_drops_to_refund,
          updated_at = NOW()
      WHERE user_id = v_participant.user_id
        AND gym_id = v_participant.gym_id;

      -- 4c. Record refund transaction
      INSERT INTO public.drops_transactions (
        user_id, gym_id, amount, transaction_type, reference_id, description, created_at
      ) VALUES (
        v_participant.user_id,
        v_participant.gym_id,
        v_drops_to_refund,
        'refund',
        p_arena_id,
        'Arena cancelled: ' || v_arena.name || ' — ' || v_drops_to_refund || ' drops refunded',
        NOW()
      );
    END IF;

    v_refund_count := v_refund_count + 1;
  END LOOP;

  -- If no participants, still count 0 (for notification purposes)
  IF v_refund_count = 0 THEN
    SELECT COUNT(*)::INTEGER INTO v_refund_count
    FROM public.arena_participants
    WHERE arena_id = p_arena_id;
  END IF;

  -- 5. Deactivate the arena
  UPDATE public.sweat_arenas
  SET is_active = false,
      updated_at = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT true, v_refund_count, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 3. UPDATE RLS POLICY: arena_invitations — Use is_superadmin() helper
-- ============================================================================

-- Drop old policy
DROP POLICY IF EXISTS "Superadmin manage all invitations" ON public.arena_invitations;

-- Create new policy using helper function
CREATE POLICY "Superadmin manage all invitations"
  ON public.arena_invitations FOR ALL
  USING (public.is_superadmin(auth.uid()));
