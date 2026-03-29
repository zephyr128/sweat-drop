-- Migration: 20260327150000_referrals_and_friend_challenges_mvp.sql
-- Description: MVP schema + RPCs for Workstream A3 (referrals) and A4 (friend 1v1 challenges)
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/master_production_vortex_90d_execution_plan.md — A3, A4
--
-- CHANGES:
-- - Table: public.referrals (gym-scoped, RLS)
-- - Table: public.friend_challenges, public.friend_challenge_progress (gym-scoped, RLS)
-- - RPCs: create_referral_invite, apply_referral_code, evaluate_referral_qualification
-- - RPCs: create_friend_challenge, respond_friend_challenge, refresh_friend_challenge_scores
--
-- IMPACT ON FRONTEND:
-- - Mobile: call RPCs with authenticated user; pass gym_id for tenancy.
-- - Admin: optional reads via gym_staff / superadmin policies.
--
-- BREAKING CHANGES: None (additive)

-- ============================================================
-- 1) Referrals (A3)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.referrals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                    UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  referrer_user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code               TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'rewarded', 'blocked')),
  block_reason              TEXT,
  qualified_checkin_at      TIMESTAMPTZ,
  qualified_redemption_at   TIMESTAMPTZ,
  qualified_checkin_id      UUID REFERENCES public.gym_checkins(id) ON DELETE SET NULL,
  qualified_redemption_id   UUID REFERENCES public.redemptions(id) ON DELETE SET NULL,
  rewarded_at               TIMESTAMPTZ,
  reward_tx_id              UUID REFERENCES public.drops_transactions(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_referrals_users_distinct CHECK (
    invitee_user_id IS NULL OR invitee_user_id <> referrer_user_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_invite_code
  ON public.referrals (invite_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_one_invitee
  ON public.referrals (invitee_user_id)
  WHERE invitee_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_referrer_gym_open
  ON public.referrals (referrer_user_id, gym_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON public.referrals (referrer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_gym_status
  ON public.referrals (gym_id, status);

COMMENT ON TABLE public.referrals IS
  'Gym-scoped invite referrals. Referrer earns reward after invitee completes qualifying check-in and reward_store redemption at the same gym.';

-- ------------------------------------------------------------
-- Referral RLS
-- ------------------------------------------------------------

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'referrals_superadmin_select'
  ) THEN
    CREATE POLICY "referrals_superadmin_select" ON public.referrals
      FOR SELECT
      USING (public.is_superadmin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'referrals_gym_staff_select'
  ) THEN
    CREATE POLICY "referrals_gym_staff_select" ON public.referrals
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.gym_staff gs
          WHERE gs.user_id = auth.uid()
            AND gs.gym_id = referrals.gym_id
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('gym_owner', 'gym_admin')
            AND (p.admin_gym_id = referrals.gym_id OR p.assigned_gym_id = referrals.gym_id)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'referrals_participant_select'
  ) THEN
    CREATE POLICY "referrals_participant_select" ON public.referrals
      FOR SELECT
      USING (
        auth.uid() = referrer_user_id
        OR auth.uid() = invitee_user_id
      );
  END IF;
END $$;

-- No direct client INSERT/UPDATE/DELETE — RPCs only (no policies for write)

-- ------------------------------------------------------------
-- Referral helpers + RPCs
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._referral_generate_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_try  INT := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_code := 'SD-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referrals r WHERE r.invite_code = v_code);
    EXIT WHEN v_try >= 12;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.invite_code = v_code) THEN
    v_code := 'SD-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
  END IF;
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public._referral_generate_code() IS
  'Internal: unique invite code prefix SD- (SWEATDROP). Used by create_referral_invite.';

CREATE OR REPLACE FUNCTION public.create_referral_invite(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_row   public.referrals%ROWTYPE;
  v_code  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m
    WHERE m.user_id = v_uid AND m.gym_id = p_gym_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_gym_member');
  END IF;

  SELECT * INTO v_row
  FROM public.referrals r
  WHERE r.referrer_user_id = v_uid
    AND r.gym_id = p_gym_id
    AND r.status IN ('pending', 'active')
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_row.status = 'pending' AND v_row.invitee_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'referral_id', v_row.id,
        'invite_code', v_row.invite_code,
        'status', v_row.status,
        'reused', true
      );
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'active_referral_in_progress',
      'referral_id', v_row.id,
      'status', v_row.status
    );
  END IF;

  v_code := public._referral_generate_code();

  INSERT INTO public.referrals (gym_id, referrer_user_id, invite_code, status)
  VALUES (p_gym_id, v_uid, v_code, 'pending')
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_row.id,
    'invite_code', v_row.invite_code,
    'status', v_row.status,
    'reused', false
  );
END;
$$;

COMMENT ON FUNCTION public.create_referral_invite(UUID) IS
  'Creates or returns an open pending invite for (auth user, gym). Requires gym membership.';

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_invite_code TEXT, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_code       TEXT := upper(trim(p_invite_code));
  v_ref        public.referrals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF v_code IS NULL OR length(v_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m
    WHERE m.user_id = v_uid AND m.gym_id = p_gym_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_gym_member');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals r
    WHERE r.invitee_user_id = v_uid AND r.status IN ('pending', 'active', 'rewarded')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invitee_already_has_referral');
  END IF;

  SELECT * INTO v_ref
  FROM public.referrals r
  WHERE r.invite_code = v_code
    AND r.gym_id = p_gym_id
    AND r.status = 'pending'
    AND r.invitee_user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_not_found_or_used');
  END IF;

  IF v_ref.referrer_user_id = v_uid THEN
    UPDATE public.referrals
    SET status = 'blocked',
        block_reason = 'self_referral',
        updated_at = NOW()
    WHERE id = v_ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'self_referral_blocked');
  END IF;

  UPDATE public.referrals
  SET invitee_user_id = v_uid,
      status = 'active',
      updated_at = NOW()
  WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_ref.id,
    'status', 'active'
  );
END;
$$;

COMMENT ON FUNCTION public.apply_referral_code(TEXT, UUID) IS
  'Links auth user as invitee to a pending referral code for the given gym. Blocks self-referral.';

-- MVP reward size (centralize later via gym/economy config)
CREATE OR REPLACE FUNCTION public.evaluate_referral_qualification(p_referral_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_ref            public.referrals%ROWTYPE;
  v_reward_drops   INT := 50;
  v_checkin        RECORD;
  v_redemption     RECORD;
  v_tx_id          UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_referral_id IS NOT NULL THEN
    SELECT * INTO v_ref FROM public.referrals r WHERE r.id = p_referral_id FOR UPDATE;
  ELSE
    SELECT * INTO v_ref
    FROM public.referrals r
    WHERE r.invitee_user_id = v_uid AND r.status = 'active'
    ORDER BY r.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_not_found');
  END IF;

  IF v_ref.status = 'blocked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_blocked', 'reason', v_ref.block_reason);
  END IF;

  IF v_ref.status = 'rewarded' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'rewarded',
      'rewarded_at', v_ref.rewarded_at,
      'reward_tx_id', v_ref.reward_tx_id
    );
  END IF;

  IF v_ref.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_state', 'status', v_ref.status);
  END IF;

  -- Caller must be invitee (drives qualification) or referrer (read-only snapshot) or staff/superadmin
  IF v_uid <> v_ref.invitee_user_id
     AND v_uid <> v_ref.referrer_user_id
     AND NOT public.is_superadmin(v_uid)
     AND NOT EXISTS (
       SELECT 1 FROM public.gym_staff gs
       WHERE gs.user_id = v_uid AND gs.gym_id = v_ref.gym_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_uid
         AND p.role IN ('gym_owner', 'gym_admin')
         AND (p.admin_gym_id = v_ref.gym_id OR p.assigned_gym_id = v_ref.gym_id)
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  -- Read-only path for referrer/staff: invitee evaluates mutations
  IF v_uid <> v_ref.invitee_user_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', v_ref.status,
      'read_only', true,
      'qualified_checkin_at', v_ref.qualified_checkin_at,
      'qualified_redemption_at', v_ref.qualified_redemption_at
    );
  END IF;

  -- Qualifying check-in at referral gym (drops earned > 0)
  IF v_ref.qualified_checkin_at IS NULL THEN
    SELECT gc.id, gc.checked_in_at
    INTO v_checkin
    FROM public.gym_checkins gc
    WHERE gc.user_id = v_ref.invitee_user_id
      AND gc.gym_id = v_ref.gym_id
      AND gc.drops_earned > 0
    ORDER BY gc.checked_in_at ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.referrals
      SET qualified_checkin_at = v_checkin.checked_in_at,
          qualified_checkin_id = v_checkin.id,
          updated_at = NOW()
      WHERE id = v_ref.id;
      v_ref.qualified_checkin_at := v_checkin.checked_in_at;
      v_ref.qualified_checkin_id := v_checkin.id;
    END IF;
  END IF;

  -- First confirmed reward_store redemption at referral gym
  IF v_ref.qualified_redemption_at IS NULL THEN
    SELECT r.id, r.confirmed_at
    INTO v_redemption
    FROM public.redemptions r
    WHERE r.user_id = v_ref.invitee_user_id
      AND r.gym_id = v_ref.gym_id
      AND r.status = 'confirmed'
      AND r.source_type = 'reward_store'
    ORDER BY r.confirmed_at ASC NULLS LAST, r.created_at ASC
    LIMIT 1;

    IF FOUND AND v_redemption.confirmed_at IS NOT NULL THEN
      UPDATE public.referrals
      SET qualified_redemption_at = v_redemption.confirmed_at,
          qualified_redemption_id = v_redemption.id,
          updated_at = NOW()
      WHERE id = v_ref.id;
      v_ref.qualified_redemption_at := v_redemption.confirmed_at;
      v_ref.qualified_redemption_id := v_redemption.id;
    END IF;
  END IF;

  IF v_ref.qualified_checkin_at IS NULL OR v_ref.qualified_redemption_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'active',
      'qualified_checkin_at', v_ref.qualified_checkin_at,
      'qualified_redemption_at', v_ref.qualified_redemption_at,
      'rewarded', false
    );
  END IF;

  IF v_ref.rewarded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'rewarded',
      'rewarded_at', v_ref.rewarded_at,
      'reward_tx_id', v_ref.reward_tx_id
    );
  END IF;

  v_reward_drops := LEAST(GREATEST(v_reward_drops, 0), 200);

  UPDATE public.profiles
  SET total_drops       = total_drops + v_reward_drops,
      available_drops   = available_drops + v_reward_drops,
      weekly_drops      = weekly_drops + v_reward_drops,
      monthly_drops     = monthly_drops + v_reward_drops,
      updated_at        = NOW()
  WHERE id = v_ref.referrer_user_id;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_reward_drops,
      updated_at = NOW()
  WHERE user_id = v_ref.referrer_user_id AND gym_id = v_ref.gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_ref.referrer_user_id, v_ref.gym_id, v_reward_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET
      local_drops_balance = gym_memberships.local_drops_balance + v_reward_drops,
      updated_at = NOW();
  END IF;

  INSERT INTO public.drops_transactions (
    user_id, gym_id, amount, transaction_type, reference_id, description
  )
  VALUES (
    v_ref.referrer_user_id,
    v_ref.gym_id,
    v_reward_drops,
    'referral_reward',
    v_ref.id,
    'Referral reward (invitee qualified)'
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.referrals
  SET status = 'rewarded',
      rewarded_at = NOW(),
      reward_tx_id = v_tx_id,
      updated_at = NOW()
  WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'rewarded',
    'reward_drops', v_reward_drops,
    'reward_tx_id', v_tx_id,
    'rewarded_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.evaluate_referral_qualification(UUID) IS
  'Invitee: advances qualification from gym_checkins + redemptions; pays referrer once. Referrer/staff: read-only progress.';

REVOKE ALL ON FUNCTION public._referral_generate_code() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_referral_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_referral_qualification(UUID) TO authenticated;

-- ============================================================
-- 2) Friend 1v1 challenges (A4)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.friend_challenges (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                  UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  challenger_user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_type          TEXT NOT NULL
    CHECK (challenge_type IN ('drops_race', 'streak_race', 'sessions_race')),
  duration_days           INT NOT NULL CHECK (duration_days IN (3, 7, 14)),
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed', 'declined', 'expired', 'cancelled')),
  tie_mode                TEXT NOT NULL DEFAULT 'no_winner'
    CHECK (tie_mode IN ('no_winner', 'split')),
  reward_drops_per_user   INT NOT NULL DEFAULT 0 CHECK (reward_drops_per_user >= 0 AND reward_drops_per_user <= 100),
  pending_expires_at      TIMESTAMPTZ NOT NULL,
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,
  winner_user_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_friend_challenges_users_distinct CHECK (challenger_user_id <> opponent_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_challenges_gym
  ON public.friend_challenges (gym_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_friend_challenges_challenger
  ON public.friend_challenges (challenger_user_id, status);

CREATE INDEX IF NOT EXISTS idx_friend_challenges_opponent
  ON public.friend_challenges (opponent_user_id, status);

COMMENT ON TABLE public.friend_challenges IS
  'Gym-scoped 1v1 challenges. Scores computed over [starts_at, ends_at) at challenge gym.';

CREATE TABLE IF NOT EXISTS public.friend_challenge_progress (
  challenge_id    UUID NOT NULL REFERENCES public.friend_challenges(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score           INT NOT NULL DEFAULT 0,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_challenge_progress_user
  ON public.friend_challenge_progress (user_id);

-- ------------------------------------------------------------
-- Friend challenge RLS
-- ------------------------------------------------------------

ALTER TABLE public.friend_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_challenge_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'friend_challenges' AND policyname = 'fc_superadmin_select'
  ) THEN
    CREATE POLICY "fc_superadmin_select" ON public.friend_challenges
      FOR SELECT
      USING (public.is_superadmin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'friend_challenges' AND policyname = 'fc_gym_staff_select'
  ) THEN
    CREATE POLICY "fc_gym_staff_select" ON public.friend_challenges
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.gym_staff gs
          WHERE gs.user_id = auth.uid() AND gs.gym_id = friend_challenges.gym_id
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('gym_owner', 'gym_admin')
            AND (p.admin_gym_id = friend_challenges.gym_id OR p.assigned_gym_id = friend_challenges.gym_id)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'friend_challenges' AND policyname = 'fc_participant_select'
  ) THEN
    CREATE POLICY "fc_participant_select" ON public.friend_challenges
      FOR SELECT
      USING (
        auth.uid() = challenger_user_id OR auth.uid() = opponent_user_id
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'friend_challenge_progress' AND policyname = 'fcp_superadmin_select'
  ) THEN
    CREATE POLICY "fcp_superadmin_select" ON public.friend_challenge_progress
      FOR SELECT
      USING (public.is_superadmin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'friend_challenge_progress' AND policyname = 'fcp_gym_staff_select'
  ) THEN
    CREATE POLICY "fcp_gym_staff_select" ON public.friend_challenge_progress
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.friend_challenges fc
          WHERE fc.id = friend_challenge_progress.challenge_id
            AND (
              EXISTS (
                SELECT 1 FROM public.gym_staff gs
                WHERE gs.user_id = auth.uid() AND gs.gym_id = fc.gym_id
              )
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.role IN ('gym_owner', 'gym_admin')
                  AND (p.admin_gym_id = fc.gym_id OR p.assigned_gym_id = fc.gym_id)
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'friend_challenge_progress' AND policyname = 'fcp_participant_select'
  ) THEN
    CREATE POLICY "fcp_participant_select" ON public.friend_challenge_progress
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.friend_challenges fc
          WHERE fc.id = friend_challenge_progress.challenge_id
            AND (
              auth.uid() = fc.challenger_user_id
              OR auth.uid() = fc.opponent_user_id
            )
        )
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- Score engine + RPCs
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._friend_challenge_compute_score(
  p_challenge_type TEXT,
  p_gym_id UUID,
  p_user_id UUID,
  p_starts TIMESTAMPTZ,
  p_ends TIMESTAMPTZ
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_score INT := 0;
BEGIN
  IF p_challenge_type = 'drops_race' THEN
    SELECT COALESCE(SUM(s.drops_earned), 0)::INT INTO v_score
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.gym_id = p_gym_id
      AND s.is_active = false
      AND s.started_at >= p_starts
      AND s.started_at < p_ends;
    RETURN v_score;
  ELSIF p_challenge_type = 'sessions_race' THEN
    SELECT COUNT(*)::INT INTO v_score
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.gym_id = p_gym_id
      AND s.is_active = false
      AND s.started_at >= p_starts
      AND s.started_at < p_ends;
    RETURN v_score;
  ELSIF p_challenge_type = 'streak_race' THEN
    -- MVP: distinct local calendar days (Belgrade) with a completed session at the gym in the window
    SELECT COUNT(DISTINCT DATE(s.started_at AT TIME ZONE 'Europe/Belgrade'))::INT
    INTO v_score
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.gym_id = p_gym_id
      AND s.is_active = false
      AND s.started_at >= p_starts
      AND s.started_at < p_ends;
    RETURN v_score;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_friend_challenge(
  p_opponent_user_id UUID,
  p_gym_id UUID,
  p_challenge_type TEXT,
  p_duration_days INT,
  p_reward_drops_per_user INT DEFAULT 0,
  p_tie_mode TEXT DEFAULT 'no_winner'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
  v_tie TEXT := COALESCE(NULLIF(trim(p_tie_mode), ''), 'no_winner');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_opponent_user_id IS NULL OR p_opponent_user_id = v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_opponent');
  END IF;

  IF p_challenge_type NOT IN ('drops_race', 'streak_race', 'sessions_race') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_challenge_type');
  END IF;

  IF p_duration_days NOT IN (3, 7, 14) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_duration');
  END IF;

  IF v_tie NOT IN ('no_winner', 'split') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_tie_mode');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m WHERE m.user_id = v_uid AND m.gym_id = p_gym_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m WHERE m.user_id = p_opponent_user_id AND m.gym_id = p_gym_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'both_must_be_gym_members');
  END IF;

  IF COALESCE(p_reward_drops_per_user, 0) < 0 OR COALESCE(p_reward_drops_per_user, 0) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_out_of_range');
  END IF;

  INSERT INTO public.friend_challenges (
    gym_id,
    challenger_user_id,
    opponent_user_id,
    challenge_type,
    duration_days,
    status,
    tie_mode,
    reward_drops_per_user,
    pending_expires_at
  )
  VALUES (
    p_gym_id,
    v_uid,
    p_opponent_user_id,
    p_challenge_type,
    p_duration_days,
    'pending',
    v_tie,
    LEAST(COALESCE(p_reward_drops_per_user, 0), 100),
    NOW() + INTERVAL '48 hours'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'challenge_id', v_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_challenge(
  p_challenge_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_fc  public.friend_challenges%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_fc FROM public.friend_challenges fc WHERE fc.id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_fc.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending', 'status', v_fc.status);
  END IF;

  IF v_uid <> v_fc.opponent_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'only_opponent_can_respond');
  END IF;

  IF NOT p_accept THEN
    UPDATE public.friend_challenges
    SET status = 'declined', updated_at = NOW(), completed_at = NOW()
    WHERE id = v_fc.id;
    RETURN jsonb_build_object('success', true, 'status', 'declined');
  END IF;

  IF NOW() > v_fc.pending_expires_at THEN
    UPDATE public.friend_challenges
    SET status = 'expired', updated_at = NOW(), completed_at = NOW()
    WHERE id = v_fc.id;
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;

  v_start := NOW();
  v_end := v_start + (v_fc.duration_days || ' days')::INTERVAL;

  UPDATE public.friend_challenges
  SET status = 'active',
      starts_at = v_start,
      ends_at = v_end,
      updated_at = NOW()
  WHERE id = v_fc.id;

  INSERT INTO public.friend_challenge_progress (challenge_id, user_id, score, last_computed_at)
  VALUES
    (v_fc.id, v_fc.challenger_user_id, 0, NOW()),
    (v_fc.id, v_fc.opponent_user_id, 0, NOW())
  ON CONFLICT (challenge_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'active',
    'starts_at', v_start,
    'ends_at', v_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._friend_challenge_credit_winner(
  p_user_id UUID,
  p_gym_id UUID,
  p_amount INT,
  p_challenge_id UUID,
  p_note TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx UUID;
  v_amt INT := LEAST(GREATEST(p_amount, 0), 100);
BEGIN
  IF v_amt = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
  SET total_drops       = total_drops + v_amt,
      available_drops   = available_drops + v_amt,
      weekly_drops      = weekly_drops + v_amt,
      monthly_drops     = monthly_drops + v_amt,
      updated_at        = NOW()
  WHERE id = p_user_id;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_amt,
      updated_at = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (p_user_id, p_gym_id, v_amt)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET
      local_drops_balance = gym_memberships.local_drops_balance + v_amt,
      updated_at = NOW();
  END IF;

  INSERT INTO public.drops_transactions (
    user_id, gym_id, amount, transaction_type, reference_id, description
  )
  VALUES (
    p_user_id,
    p_gym_id,
    v_amt,
    'friend_challenge_reward',
    p_challenge_id,
    p_note
  )
  RETURNING id INTO v_tx;

  RETURN v_tx;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_friend_challenge_scores(p_challenge_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_fc     public.friend_challenges%ROWTYPE;
  v_sc_c   INT;
  v_sc_o   INT;
  v_tx_c   UUID;
  v_tx_o   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_fc FROM public.friend_challenges fc WHERE fc.id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_fc.status = 'pending' AND NOW() > v_fc.pending_expires_at THEN
    UPDATE public.friend_challenges
    SET status = 'expired', updated_at = NOW(), completed_at = NOW()
    WHERE id = v_fc.id;
    RETURN jsonb_build_object('success', true, 'status', 'expired');
  END IF;

  IF v_fc.status NOT IN ('active', 'completed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_active',
      'status', v_fc.status
    );
  END IF;

  IF v_uid <> v_fc.challenger_user_id
     AND v_uid <> v_fc.opponent_user_id
     AND NOT public.is_superadmin(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_fc.status = 'completed' THEN
    SELECT score INTO v_sc_c FROM public.friend_challenge_progress
    WHERE challenge_id = v_fc.id AND user_id = v_fc.challenger_user_id;
    SELECT score INTO v_sc_o FROM public.friend_challenge_progress
    WHERE challenge_id = v_fc.id AND user_id = v_fc.opponent_user_id;
    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'challenger_score', v_sc_c,
      'opponent_score', v_sc_o,
      'winner_user_id', v_fc.winner_user_id
    );
  END IF;

  v_sc_c := public._friend_challenge_compute_score(
    v_fc.challenge_type, v_fc.gym_id, v_fc.challenger_user_id, v_fc.starts_at, v_fc.ends_at
  );
  v_sc_o := public._friend_challenge_compute_score(
    v_fc.challenge_type, v_fc.gym_id, v_fc.opponent_user_id, v_fc.starts_at, v_fc.ends_at
  );

  INSERT INTO public.friend_challenge_progress (challenge_id, user_id, score, last_computed_at)
  VALUES (v_fc.id, v_fc.challenger_user_id, v_sc_c, NOW())
  ON CONFLICT (challenge_id, user_id)
  DO UPDATE SET score = EXCLUDED.score, last_computed_at = NOW();

  INSERT INTO public.friend_challenge_progress (challenge_id, user_id, score, last_computed_at)
  VALUES (v_fc.id, v_fc.opponent_user_id, v_sc_o, NOW())
  ON CONFLICT (challenge_id, user_id)
  DO UPDATE SET score = EXCLUDED.score, last_computed_at = NOW();

  IF NOW() < v_fc.ends_at THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'active',
      'challenger_score', v_sc_c,
      'opponent_score', v_sc_o,
      'ends_at', v_fc.ends_at
    );
  END IF;

  -- Finalize
  IF v_sc_c > v_sc_o THEN
    UPDATE public.friend_challenges
    SET status = 'completed',
        winner_user_id = v_fc.challenger_user_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_fc.id;
    v_tx_c := public._friend_challenge_credit_winner(
      v_fc.challenger_user_id, v_fc.gym_id, v_fc.reward_drops_per_user, v_fc.id,
      'Friend challenge win'
    );
    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'challenger_score', v_sc_c,
      'opponent_score', v_sc_o,
      'winner_user_id', v_fc.challenger_user_id,
      'reward_tx_id', v_tx_c
    );
  ELSIF v_sc_o > v_sc_c THEN
    UPDATE public.friend_challenges
    SET status = 'completed',
        winner_user_id = v_fc.opponent_user_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_fc.id;
    v_tx_o := public._friend_challenge_credit_winner(
      v_fc.opponent_user_id, v_fc.gym_id, v_fc.reward_drops_per_user, v_fc.id,
      'Friend challenge win'
    );
    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'challenger_score', v_sc_c,
      'opponent_score', v_sc_o,
      'winner_user_id', v_fc.opponent_user_id,
      'reward_tx_id', v_tx_o
    );
  ELSE
    -- Tie
    IF v_fc.tie_mode = 'split' AND v_fc.reward_drops_per_user > 0 THEN
      UPDATE public.friend_challenges
      SET status = 'completed',
          winner_user_id = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_fc.id;
      v_tx_c := public._friend_challenge_credit_winner(
        v_fc.challenger_user_id, v_fc.gym_id, v_fc.reward_drops_per_user, v_fc.id,
        'Friend challenge tie (split)'
      );
      v_tx_o := public._friend_challenge_credit_winner(
        v_fc.opponent_user_id, v_fc.gym_id, v_fc.reward_drops_per_user, v_fc.id,
        'Friend challenge tie (split)'
      );
      RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'challenger_score', v_sc_c,
        'opponent_score', v_sc_o,
        'winner_user_id', NULL,
        'tie', true,
        'reward_tx_ids', jsonb_build_array(v_tx_c, v_tx_o)
      );
    ELSE
      UPDATE public.friend_challenges
      SET status = 'completed',
          winner_user_id = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_fc.id;
      RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'challenger_score', v_sc_c,
        'opponent_score', v_sc_o,
        'winner_user_id', NULL,
        'tie', true
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_challenge(p_challenge_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_fc  public.friend_challenges%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_fc FROM public.friend_challenges fc WHERE fc.id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_fc.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending', 'status', v_fc.status);
  END IF;

  IF v_uid <> v_fc.challenger_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'only_challenger_can_cancel');
  END IF;

  UPDATE public.friend_challenges
  SET status = 'cancelled', updated_at = NOW(), completed_at = NOW()
  WHERE id = v_fc.id;

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

COMMENT ON FUNCTION public.create_friend_challenge(UUID, UUID, TEXT, INT, INT, TEXT) IS
  'Creates a pending 1v1 challenge; opponent must accept within pending_expires_at.';

COMMENT ON FUNCTION public.respond_friend_challenge(UUID, BOOLEAN) IS
  'Opponent accepts (starts window) or declines.';

COMMENT ON FUNCTION public.refresh_friend_challenge_scores(UUID) IS
  'Recomputes scores for active challenges; finalizes winner when past ends_at.';

COMMENT ON FUNCTION public.cancel_friend_challenge(UUID) IS
  'Challenger cancels a pending invite.';

REVOKE ALL ON FUNCTION public._friend_challenge_compute_score(TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._friend_challenge_credit_winner(UUID, UUID, INT, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_friend_challenge(UUID, UUID, TEXT, INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_challenge(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_friend_challenge_scores(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_challenge(UUID) TO authenticated;
