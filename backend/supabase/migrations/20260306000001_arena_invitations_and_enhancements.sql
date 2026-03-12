-- Migration: 20260306000001_arena_invitations_and_enhancements.sql
-- Description: Sweat Arenas v2 — Invitations, opt-in requirements, branding, upcoming arenas
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- Reference: docs/plans/sweat_arenas_v2_comprehensive_plan.md
-- 
-- CHANGES:
-- - Created arena_invitations table for global arena invitation system
-- - Added opt-in requirements (opt_in_type, opt_in_value) to sweat_arenas
-- - Added branding columns (card_color, card_text_color, card_gradient_end) to sweat_arenas
-- - Added opt_in_drops_paid to arena_participants (for accurate refunds)
-- - Created respond_to_arena_invitation() RPC
-- - Created send_arena_invitations() RPC
-- - Created cancel_arena() RPC with drops refund logic
-- - Updated opt_into_arena() with requirement checks
-- - Updated get_available_arenas() to include upcoming arenas and new fields
-- - Created get_arena_results() RPC for post-arena admin view
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Can now see upcoming arenas, opt-in requirements, custom branding
-- - Admin Panel: Invitation system, branding preview, cancel arena with refunds
-- 
-- BREAKING CHANGES:
-- - None (additive changes only)

-- ============================================================================
-- 1. CREATE TABLE: arena_invitations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.arena_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID NOT NULL REFERENCES public.sweat_arenas(id) ON DELETE CASCADE,
  invited_gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  invited_user_id UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  revenue_share_percent NUMERIC(5, 2) DEFAULT 0,
  revenue_share_note TEXT,
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(arena_id, invited_gym_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_arena_invitations_arena ON public.arena_invitations(arena_id);
CREATE INDEX IF NOT EXISTS idx_arena_invitations_gym ON public.arena_invitations(invited_gym_id);
CREATE INDEX IF NOT EXISTS idx_arena_invitations_user ON public.arena_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_arena_invitations_status ON public.arena_invitations(status);

-- RLS Policies
ALTER TABLE public.arena_invitations ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access (use helper function to bypass RLS)
CREATE POLICY "Superadmin manage all invitations"
  ON public.arena_invitations FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- Gym owner/admin: can view invitations for their gyms
CREATE POLICY "Gym staff can view their invitations"
  ON public.arena_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.user_id = auth.uid()
        AND gs.gym_id = arena_invitations.invited_gym_id
        AND gs.role IN ('owner', 'admin')
    )
    OR invited_user_id = auth.uid()
  );

-- Gym owner/admin: can update (accept/decline) their invitations
CREATE POLICY "Gym staff can respond to invitations"
  ON public.arena_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.user_id = auth.uid()
        AND gs.gym_id = arena_invitations.invited_gym_id
        AND gs.role IN ('owner', 'admin')
    )
    OR invited_user_id = auth.uid()
  )
  WITH CHECK (
    status IN ('accepted', 'declined')
  );

COMMENT ON TABLE public.arena_invitations IS
  'Invitation system for global arenas. Superadmin invites gym owners/admins to participate.';

-- ============================================================================
-- 2. ALTER TABLE: sweat_arenas — Add opt-in and branding columns
-- ============================================================================

-- Opt-in requirements
ALTER TABLE public.sweat_arenas
  ADD COLUMN IF NOT EXISTS opt_in_type TEXT DEFAULT 'free'
    CHECK (opt_in_type IN ('free', 'drops', 'streak', 'level')),
  ADD COLUMN IF NOT EXISTS opt_in_value INTEGER DEFAULT 0;

-- Custom branding
ALTER TABLE public.sweat_arenas
  ADD COLUMN IF NOT EXISTS card_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_text_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_gradient_end TEXT DEFAULT NULL;

COMMENT ON COLUMN public.sweat_arenas.opt_in_type IS
  'Opt-in requirement type: free (anyone), drops (spend N drops), streak (need N-day streak), level (need N total drops)';
COMMENT ON COLUMN public.sweat_arenas.opt_in_value IS
  'Value for opt-in requirement. E.g. 50 for drops type means user spends 50 drops to join.';
COMMENT ON COLUMN public.sweat_arenas.card_color IS
  'Primary color for arena card (hex). NULL = use default teal (#00E5FF).';
COMMENT ON COLUMN public.sweat_arenas.card_text_color IS
  'Text color for arena card (hex). NULL = use white (#FFFFFF).';
COMMENT ON COLUMN public.sweat_arenas.card_gradient_end IS
  'Optional gradient end color for arena card (hex). NULL = no gradient.';

-- ============================================================================
-- 3. ALTER TABLE: arena_participants — Add opt_in_drops_paid
-- ============================================================================

ALTER TABLE public.arena_participants
  ADD COLUMN IF NOT EXISTS opt_in_drops_paid INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.arena_participants.opt_in_drops_paid IS
  'Drops paid on opt-in (for refund on cancellation). 0 if free/streak/level arena.';

-- ============================================================================
-- 4. CREATE FUNCTION: respond_to_arena_invitation()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_arena_invitation(
  p_invitation_id UUID,
  p_response TEXT
)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID := auth.uid();
BEGIN
  -- 1. Validate response
  IF p_response NOT IN ('accepted', 'declined') THEN
    RETURN QUERY SELECT false, 'Invalid response. Must be "accepted" or "declined".'::TEXT;
    RETURN;
  END IF;

  -- 2. Fetch invitation
  SELECT * INTO v_invitation
  FROM public.arena_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invitation not found.'::TEXT;
    RETURN;
  END IF;

  -- 3. Verify caller has permission (gym owner/admin of invited gym)
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_staff
    WHERE user_id = v_user_id
      AND gym_id = v_invitation.invited_gym_id
      AND role IN ('owner', 'admin')
  ) AND v_invitation.invited_user_id != v_user_id THEN
    RETURN QUERY SELECT false, 'You do not have permission to respond to this invitation.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check invitation is still pending
  IF v_invitation.status != 'pending' THEN
    RETURN QUERY SELECT false, ('Invitation already ' || v_invitation.status || '.')::TEXT;
    RETURN;
  END IF;

  -- 5. Update invitation status
  UPDATE public.arena_invitations
  SET status = p_response,
      responded_at = NOW(),
      responded_by = v_user_id,
      updated_at = NOW()
  WHERE id = p_invitation_id;

  -- 6. If accepted, add gym to arena_gyms
  IF p_response = 'accepted' THEN
    INSERT INTO public.arena_gyms (arena_id, gym_id, approved_by, approved_at)
    VALUES (v_invitation.arena_id, v_invitation.invited_gym_id, v_user_id, NOW())
    ON CONFLICT (arena_id, gym_id) DO NOTHING;
  END IF;

  -- 7. If declined, remove gym from arena_gyms (in case it was pre-added)
  IF p_response = 'declined' THEN
    DELETE FROM public.arena_gyms
    WHERE arena_id = v_invitation.arena_id
      AND gym_id = v_invitation.invited_gym_id;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.respond_to_arena_invitation(UUID, TEXT) IS
  'Gym owner/admin accepts or declines an arena invitation. If accepted, adds gym to arena_gyms.';

GRANT EXECUTE ON FUNCTION public.respond_to_arena_invitation(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 5. CREATE FUNCTION: send_arena_invitations()
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

COMMENT ON FUNCTION public.send_arena_invitations(UUID, UUID[], NUMERIC, TEXT) IS
  'Superadmin bulk sends arena invitations to multiple gyms. Returns count of invitations sent.';

GRANT EXECUTE ON FUNCTION public.send_arena_invitations(UUID, UUID[], NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- 6. CREATE FUNCTION: cancel_arena()
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

COMMENT ON FUNCTION public.cancel_arena(UUID) IS
  'Superadmin cancels an active/upcoming arena. If opt_in_type=drops, refunds all participants using per-participant opt_in_drops_paid. Sets is_active=false.';

GRANT EXECUTE ON FUNCTION public.cancel_arena(UUID) TO authenticated;

-- ============================================================================
-- 7. UPDATE FUNCTION: opt_into_arena() — Add requirement checks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.opt_into_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arena RECORD;
  v_user_id UUID := auth.uid();
  v_user_gym_id UUID;
  v_user_profile RECORD;
  v_local_balance INTEGER;
  v_drops_paid INTEGER := 0;
BEGIN
  -- 1. Fetch arena
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- 2. Check arena is active
  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 'Arena is not active.'::TEXT;
    RETURN;
  END IF;

  -- 3. Check arena hasn't ended (but allow opt-in for future arenas)
  IF v_arena.end_date < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'Arena has already ended.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check if already opted in
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = v_user_id
  ) THEN
    RETURN QUERY SELECT false, 'Already opted in.'::TEXT;
    RETURN;
  END IF;

  -- 5. Find user's gym that participates in this arena
  SELECT gm.gym_id INTO v_user_gym_id
  FROM public.gym_memberships gm
  JOIN public.arena_gyms ag ON ag.gym_id = gm.gym_id
  WHERE gm.user_id = v_user_id
    AND ag.arena_id = p_arena_id
  LIMIT 1;

  -- For network arenas, use user's home gym
  IF v_user_gym_id IS NULL AND v_arena.arena_scope = 'network' THEN
    SELECT home_gym_id INTO v_user_gym_id
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  IF v_user_gym_id IS NULL THEN
    RETURN QUERY SELECT false, 'You are not a member of any participating gym.'::TEXT;
    RETURN;
  END IF;

  -- 6. Check opt-in requirements
  SELECT * INTO v_user_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF COALESCE(v_arena.opt_in_type, 'free') = 'drops' THEN
    -- User must have enough local drops in the gym
    SELECT COALESCE(local_drops_balance, 0) INTO v_local_balance
    FROM public.gym_memberships
    WHERE user_id = v_user_id AND gym_id = v_user_gym_id;

    IF COALESCE(v_local_balance, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Not enough drops. Need ' || v_arena.opt_in_value || ' drops to join.')::TEXT;
      RETURN;
    END IF;

    -- Deduct drops
    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance - v_arena.opt_in_value,
        updated_at = NOW()
    WHERE user_id = v_user_id AND gym_id = v_user_gym_id;

    -- Also deduct from global balance
    UPDATE public.profiles
    SET total_drops = GREATEST(0, total_drops - v_arena.opt_in_value),
        updated_at = NOW()
    WHERE id = v_user_id;

    -- Record drops paid for refund purposes
    v_drops_paid := COALESCE(v_arena.opt_in_value, 0);

  ELSIF COALESCE(v_arena.opt_in_type, 'free') = 'streak' THEN
    IF COALESCE(v_user_profile.streak_days, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Streak too low. Need ' || v_arena.opt_in_value || '-day streak to join.')::TEXT;
      RETURN;
    END IF;

  ELSIF COALESCE(v_arena.opt_in_type, 'free') = 'level' THEN
    IF COALESCE(v_user_profile.total_drops, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Not enough reputation. Need ' || v_arena.opt_in_value || ' total drops to join.')::TEXT;
      RETURN;
    END IF;
  END IF;
  -- 'free' requires no check

  -- 7. Insert participant with opt_in_drops_paid
  INSERT INTO public.arena_participants (arena_id, user_id, gym_id, current_score, opt_in_drops_paid)
  VALUES (p_arena_id, v_user_id, v_user_gym_id, 0, v_drops_paid)
  ON CONFLICT (arena_id, user_id) DO NOTHING;

  -- Check if user is now opted in (INSERT might have been skipped due to conflict)
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = v_user_id
  ) THEN
    RETURN QUERY SELECT true, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Failed to opt into arena'::TEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.opt_into_arena(UUID) IS
  'Opts a user into an arena. Validates opt-in requirements (free/drops/streak/level), deducts drops if needed, and records opt_in_drops_paid for refund purposes. Allows opt-in for upcoming arenas.';

GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO anon;

-- ============================================================================
-- 8. UPDATE FUNCTION: get_available_arenas() — Include upcoming arenas + new fields
-- ============================================================================

-- Drop existing function first (cannot change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.get_available_arenas(UUID);

CREATE OR REPLACE FUNCTION public.get_available_arenas(p_user_id UUID)
RETURNS TABLE(
  arena_id UUID,
  name TEXT,
  description TEXT,
  sponsor_name TEXT,
  sponsor_logo TEXT,
  scoring_model TEXT,
  start_date DATE,
  end_date DATE,
  participant_count BIGINT,
  user_opted_in BOOLEAN,
  user_rank BIGINT,
  user_score NUMERIC,
  prizes JSONB,
  opt_in_type TEXT,
  opt_in_value INTEGER,
  card_color TEXT,
  card_text_color TEXT,
  card_gradient_end TEXT,
  arena_status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id AS arena_id,
    sa.name,
    sa.description,
    sa.sponsor_name,
    sa.sponsor_logo,
    sa.scoring_model,
    sa.start_date,
    sa.end_date,
    COUNT(DISTINCT ap.id)::BIGINT AS participant_count,
    EXISTS (
      SELECT 1 FROM public.arena_participants ap2
      WHERE ap2.arena_id = sa.id AND ap2.user_id = p_user_id
    ) AS user_opted_in,
    (
      SELECT COUNT(*)::BIGINT + 1
      FROM public.arena_participants ap3
      WHERE ap3.arena_id = sa.id
        AND ap3.current_score > COALESCE((
          SELECT ap4.current_score
          FROM public.arena_participants ap4
          WHERE ap4.arena_id = sa.id AND ap4.user_id = p_user_id
        ), 0)
    ) AS user_rank,
    (
      SELECT ap5.current_score
      FROM public.arena_participants ap5
      WHERE ap5.arena_id = sa.id AND ap5.user_id = p_user_id
    ) AS user_score,
    sa.prizes,
    -- NEW fields
    COALESCE(sa.opt_in_type, 'free')::TEXT AS opt_in_type,
    COALESCE(sa.opt_in_value, 0)::INTEGER AS opt_in_value,
    sa.card_color::TEXT,
    sa.card_text_color::TEXT,
    sa.card_gradient_end::TEXT,
    CASE
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ended'
      ELSE 'active'
    END::TEXT AS arena_status
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND sa.is_finalized = false
    AND sa.end_date >= CURRENT_DATE  -- Include upcoming AND active (but not ended)
    -- REMOVED: AND sa.start_date <= CURRENT_DATE (was hiding upcoming arenas)
    AND (
      sa.arena_scope = 'network' OR
      EXISTS (
        SELECT 1 FROM public.arena_gyms ag
        JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
        WHERE ag.arena_id = sa.id
          AND gm.user_id = p_user_id
      )
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes,
           sa.opt_in_type, sa.opt_in_value, sa.card_color, sa.card_text_color, sa.card_gradient_end
  ORDER BY
    -- Upcoming first, then active, then by start date
    CASE WHEN sa.start_date > CURRENT_DATE THEN 0 ELSE 1 END,
    sa.start_date ASC;
END;
$$;

COMMENT ON FUNCTION public.get_available_arenas(UUID) IS
  'Returns arenas available to a user (active + upcoming, user''s gyms participating). Includes opt-in requirements, branding, arena_status (upcoming/active/ended), user opt-in status, participant count, rank, score, and prizes.';

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;

-- ============================================================================
-- 9. CREATE FUNCTION: get_arena_results()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_arena_results(p_arena_id UUID)
RETURNS TABLE(
  rank INTEGER,
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  gym_name TEXT,
  final_score NUMERIC,
  prize TEXT,
  redemption_code TEXT,
  redemption_status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.final_rank::INTEGER AS rank,
    ar.user_id,
    p.username::TEXT,
    p.avatar_url::TEXT,
    g.name::TEXT AS gym_name,
    ar.final_score,
    ar.prize_description::TEXT AS prize,
    r.redemption_code::TEXT,
    r.status::TEXT AS redemption_status
  FROM public.arena_results ar
  JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.gyms g ON g.id = ar.gym_id
  LEFT JOIN public.redemptions r ON r.id = ar.redemption_id
  WHERE ar.arena_id = p_arena_id
  ORDER BY ar.final_rank ASC;
END;
$$;

COMMENT ON FUNCTION public.get_arena_results(UUID) IS
  'Returns finalized arena results with ranking, user info, scores, prizes, redemption codes, and redemption status. For admin post-arena view.';

GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO service_role;
