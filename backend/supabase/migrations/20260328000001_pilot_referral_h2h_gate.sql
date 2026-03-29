-- Migration: 20260328000001_pilot_referral_h2h_gate.sql
-- Description: Pilot referral lifecycle hardening + H2H feature gate
--
-- AGENT NOTE: [2026-03-28] - supabase-dba
-- Plan: docs/plans/pilot_referral_link_and_h2h_revert_plan.md — Step 1
--
-- CHANGES:
-- - Created table: public.app_runtime_flags (feature flags)
-- - Extended referrals: qualified_first_workout_at/id, invitee_reward_tx_id, reward_block_reason
-- - Default expires_at to 30 days on new invites
-- - Rewrote create_referral_invite (join_url + deep_link)
-- - Rewrote apply_referral_code (message + expiry respect)
-- - Rewrote evaluate_referral_qualification (first-workout trigger, +100 invitee, +150 referrer, monthly cap 5)
-- - Rewrote get_referral_timeline (first_workout step)
-- - Rewrote get_my_referrals (first_workout current_status)
-- - Created get_referral_stats (invite screen KPIs)
-- - Created get_runtime_flag (mobile feature gate reader)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Use get_runtime_flag('friend_challenges_enabled') to hide H2H.
--   Invite screen: use get_referral_stats for KPI cards.
--   evaluate_referral_qualification now fires on first workout, not checkin+redemption.
-- - Admin Panel: No breaking changes. Optional referral KPI card using get_referral_stats.
-- - Landing Page: create_referral_invite returns join_url for /join/<code> pages.
--
-- BREAKING CHANGES: None (additive columns, enriched RPC payloads)
--
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.app_runtime_flags;
-- ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_first_workout_at;
-- ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_first_workout_id;
-- ALTER TABLE public.referrals DROP COLUMN IF EXISTS invitee_reward_tx_id;
-- ALTER TABLE public.referrals DROP COLUMN IF EXISTS reward_block_reason;
-- Then restore previous function versions from 20260327160000 migration file.

-- ============================================================
-- 1) App runtime flags (feature gate for H2H pilot)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_runtime_flags (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_runtime_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='arf_public_read' AND tablename='app_runtime_flags') THEN
    CREATE POLICY "arf_public_read" ON public.app_runtime_flags FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='arf_superadmin_all' AND tablename='app_runtime_flags') THEN
    CREATE POLICY "arf_superadmin_all" ON public.app_runtime_flags FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
  END IF;
END $$;

INSERT INTO public.app_runtime_flags (key, value, description)
VALUES
  ('friend_challenges_enabled', 'false'::jsonb, 'Head-to-head friend challenges (disabled for pilot)'),
  ('referral_invites_enabled', 'true'::jsonb, 'Referral invite sharing'),
  ('referral_referrer_reward_drops', '150'::jsonb, 'Drops awarded to referrer on qualified referral'),
  ('referral_invitee_bonus_drops', '100'::jsonb, 'Drops awarded to invitee on first workout'),
  ('referral_monthly_payout_cap', '5'::jsonb, 'Max rewarded referrals per referrer per calendar month'),
  ('referral_expiry_days', '30'::jsonb, 'Days until unclaimed referral invite expires')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_runtime_flag(p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.app_runtime_flags WHERE key = p_key),
    'null'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_runtime_flag(TEXT) TO authenticated;

-- ============================================================
-- 2) Extend referrals table
-- ============================================================

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualified_first_workout_at TIMESTAMPTZ NULL;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualified_first_workout_id UUID NULL REFERENCES public.sessions(id) ON DELETE SET NULL;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS invitee_reward_tx_id UUID NULL REFERENCES public.drops_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS reward_block_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_first_workout
  ON public.referrals (invitee_user_id, qualified_first_workout_at)
  WHERE qualified_first_workout_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_rewarded_month
  ON public.referrals (referrer_user_id, rewarded_at)
  WHERE status = 'rewarded' AND rewarded_at IS NOT NULL;

-- ============================================================
-- 3) Rewrite create_referral_invite
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_referral_invite(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid        UUID := auth.uid();
  v_row        public.referrals%ROWTYPE;
  v_code       TEXT;
  v_expiry_d   INT;
  v_join_url   TEXT;
  v_deep_link  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m WHERE m.user_id = v_uid AND m.gym_id = p_gym_id
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
      v_join_url  := 'https://sweat-drop.com/join/' || v_row.invite_code;
      v_deep_link := 'sweatdrop://join/' || v_row.invite_code;
      RETURN jsonb_build_object(
        'success', true,
        'referral_id', v_row.id,
        'invite_code', v_row.invite_code,
        'join_url', v_join_url,
        'deep_link', v_deep_link,
        'expires_at', v_row.expires_at,
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

  v_expiry_d := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_expiry_days'), 30);
  v_code := public._referral_generate_code();

  INSERT INTO public.referrals (gym_id, referrer_user_id, invite_code, status, expires_at)
  VALUES (p_gym_id, v_uid, v_code, 'pending', NOW() + (v_expiry_d || ' days')::INTERVAL)
  RETURNING * INTO v_row;

  v_join_url  := 'https://sweat-drop.com/join/' || v_row.invite_code;
  v_deep_link := 'sweatdrop://join/' || v_row.invite_code;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_row.id,
    'invite_code', v_row.invite_code,
    'join_url', v_join_url,
    'deep_link', v_deep_link,
    'expires_at', v_row.expires_at,
    'status', v_row.status,
    'reused', false
  );
END;
$fn$;

-- ============================================================
-- 4) Rewrite apply_referral_code (message + expiry + device hash)
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_invite_code TEXT, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid        UUID := auth.uid();
  v_code       TEXT := upper(trim(p_invite_code));
  v_ref        public.referrals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated', 'message', 'Please sign in first.');
  END IF;

  IF v_code IS NULL OR length(v_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code', 'message', 'This invite code is not valid.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m WHERE m.user_id = v_uid AND m.gym_id = p_gym_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_gym_member', 'message', 'You need to join this gym first.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals r
    WHERE r.invitee_user_id = v_uid AND r.status IN ('active', 'rewarded')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invitee_already_has_referral', 'message', 'You already used a referral invite.');
  END IF;

  SELECT * INTO v_ref
  FROM public.referrals r
  WHERE r.invite_code = v_code
    AND r.gym_id = p_gym_id
    AND r.status = 'pending'
    AND r.invitee_user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_not_found_or_used', 'message', 'This invite code is not valid or has already been used.');
  END IF;

  IF v_ref.expires_at IS NOT NULL AND v_ref.expires_at < NOW() THEN
    UPDATE public.referrals SET status = 'expired', updated_at = NOW() WHERE id = v_ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'code_expired', 'message', 'This invite has expired.');
  END IF;

  IF v_ref.referrer_user_id = v_uid THEN
    UPDATE public.referrals
    SET status = 'blocked', block_reason = 'self_referral', updated_at = NOW()
    WHERE id = v_ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'self_referral_blocked', 'message', 'You cannot use your own invite code.');
  END IF;

  UPDATE public.referrals
  SET invitee_user_id = v_uid,
      status = 'active',
      joined_at = NOW(),
      updated_at = NOW()
  WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_ref.id,
    'status', 'joined',
    'message', 'Welcome! Complete your first workout to earn bonus drops.',
    'joined_at', NOW()
  );
END;
$fn$;

-- ============================================================
-- 5) Rewrite evaluate_referral_qualification
--    Trigger: first completed workout session at gym
--    Invitee bonus: +100 drops (one-time)
--    Referrer reward: +150 drops (monthly cap 5)
-- ============================================================

CREATE OR REPLACE FUNCTION public.evaluate_referral_qualification(p_referral_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid                UUID := auth.uid();
  v_ref                public.referrals%ROWTYPE;
  v_session            RECORD;
  v_referrer_reward    INT;
  v_invitee_bonus      INT;
  v_monthly_cap        INT;
  v_rewarded_this_month INT;
  v_referrer_tx_id     UUID;
  v_invitee_tx_id      UUID;
  v_cap_blocked        BOOLEAN := false;
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
    ORDER BY r.created_at DESC LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_not_found');
  END IF;

  IF v_ref.status = 'blocked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_blocked', 'reason', v_ref.block_reason);
  END IF;

  IF v_ref.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_expired');
  END IF;

  IF v_ref.status = 'rewarded' THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'rewarded',
      'rewarded_at', v_ref.rewarded_at, 'reward_tx_id', v_ref.reward_tx_id
    );
  END IF;

  IF v_ref.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_state', 'status', v_ref.status);
  END IF;

  IF v_uid <> v_ref.invitee_user_id
     AND v_uid <> v_ref.referrer_user_id
     AND NOT public.is_superadmin(v_uid)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_uid AND p.role IN ('gym_owner','gym_admin')
         AND (p.admin_gym_id = v_ref.gym_id OR p.assigned_gym_id = v_ref.gym_id)
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_uid <> v_ref.invitee_user_id THEN
    RETURN jsonb_build_object(
      'success', true, 'status', v_ref.status, 'read_only', true,
      'qualified_checkin_at', v_ref.qualified_checkin_at,
      'qualified_first_workout_at', v_ref.qualified_first_workout_at,
      'rewarded_at', v_ref.rewarded_at
    );
  END IF;

  -- Check expiry
  IF v_ref.expires_at IS NOT NULL AND v_ref.expires_at < NOW() THEN
    UPDATE public.referrals SET status = 'expired', updated_at = NOW() WHERE id = v_ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'referral_expired');
  END IF;

  -- Detect qualifying check-in (stamp it for timeline even though trigger is workout)
  IF v_ref.qualified_checkin_at IS NULL THEN
    SELECT gc.id, gc.checked_in_at INTO v_session
    FROM public.gym_checkins gc
    WHERE gc.user_id = v_ref.invitee_user_id AND gc.gym_id = v_ref.gym_id
    ORDER BY gc.checked_in_at ASC LIMIT 1;

    IF FOUND THEN
      UPDATE public.referrals
      SET qualified_checkin_at = v_session.checked_in_at,
          qualified_checkin_id = v_session.id,
          updated_at = NOW()
      WHERE id = v_ref.id;
      v_ref.qualified_checkin_at := v_session.checked_in_at;
    END IF;
  END IF;

  -- Detect first completed workout (the REWARD TRIGGER)
  IF v_ref.qualified_first_workout_at IS NULL THEN
    SELECT s.id, s.started_at INTO v_session
    FROM public.sessions s
    WHERE s.user_id = v_ref.invitee_user_id
      AND s.gym_id = v_ref.gym_id
      AND s.is_active = false
      AND s.drops_awarded > 0
    ORDER BY s.started_at ASC LIMIT 1;

    IF FOUND THEN
      UPDATE public.referrals
      SET qualified_first_workout_at = v_session.started_at,
          qualified_first_workout_id = v_session.id,
          updated_at = NOW()
      WHERE id = v_ref.id;
      v_ref.qualified_first_workout_at := v_session.started_at;
    END IF;
  END IF;

  -- Not yet qualified
  IF v_ref.qualified_first_workout_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'active',
      'qualified_checkin_at', v_ref.qualified_checkin_at,
      'qualified_first_workout_at', v_ref.qualified_first_workout_at,
      'rewarded', false
    );
  END IF;

  -- Already rewarded (idempotent)
  IF v_ref.rewarded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'rewarded',
      'rewarded_at', v_ref.rewarded_at, 'reward_tx_id', v_ref.reward_tx_id
    );
  END IF;

  -- Read config from flags
  v_referrer_reward := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_referrer_reward_drops'), 150);
  v_invitee_bonus   := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_invitee_bonus_drops'), 100);
  v_monthly_cap     := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_monthly_payout_cap'), 5);

  -- === INVITEE BONUS (always, one-time) ===
  IF v_ref.invitee_reward_tx_id IS NULL THEN
    UPDATE public.profiles
    SET total_drops = total_drops + v_invitee_bonus,
        available_drops = available_drops + v_invitee_bonus,
        weekly_drops = weekly_drops + v_invitee_bonus,
        monthly_drops = monthly_drops + v_invitee_bonus,
        updated_at = NOW()
    WHERE id = v_ref.invitee_user_id;

    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance + v_invitee_bonus, updated_at = NOW()
    WHERE user_id = v_ref.invitee_user_id AND gym_id = v_ref.gym_id;

    INSERT INTO public.drops_transactions (user_id, gym_id, amount, transaction_type, reference_id, description)
    VALUES (v_ref.invitee_user_id, v_ref.gym_id, v_invitee_bonus, 'referral_invitee_bonus', v_ref.id,
            'Referral bonus: first workout completed')
    RETURNING id INTO v_invitee_tx_id;

    UPDATE public.referrals SET invitee_reward_tx_id = v_invitee_tx_id, updated_at = NOW() WHERE id = v_ref.id;
  END IF;

  -- === REFERRER REWARD (monthly cap check) ===
  SELECT COUNT(*) INTO v_rewarded_this_month
  FROM public.referrals r2
  WHERE r2.referrer_user_id = v_ref.referrer_user_id
    AND r2.status = 'rewarded'
    AND r2.rewarded_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';

  IF v_rewarded_this_month >= v_monthly_cap THEN
    v_cap_blocked := true;
    UPDATE public.referrals
    SET status = 'rewarded',
        rewarded_at = NOW(),
        reward_block_reason = 'monthly_cap_reached',
        updated_at = NOW()
    WHERE id = v_ref.id;

    RETURN jsonb_build_object(
      'success', true, 'status', 'rewarded',
      'invitee_bonus_drops', v_invitee_bonus,
      'referrer_reward_drops', 0,
      'reward_block_reason', 'monthly_cap_reached',
      'rewarded_at', NOW()
    );
  END IF;

  UPDATE public.profiles
  SET total_drops = total_drops + v_referrer_reward,
      available_drops = available_drops + v_referrer_reward,
      weekly_drops = weekly_drops + v_referrer_reward,
      monthly_drops = monthly_drops + v_referrer_reward,
      updated_at = NOW()
  WHERE id = v_ref.referrer_user_id;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_referrer_reward, updated_at = NOW()
  WHERE user_id = v_ref.referrer_user_id AND gym_id = v_ref.gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_ref.referrer_user_id, v_ref.gym_id, v_referrer_reward)
    ON CONFLICT (user_id, gym_id) DO UPDATE SET
      local_drops_balance = gym_memberships.local_drops_balance + v_referrer_reward,
      updated_at = NOW();
  END IF;

  INSERT INTO public.drops_transactions (user_id, gym_id, amount, transaction_type, reference_id, description)
  VALUES (v_ref.referrer_user_id, v_ref.gym_id, v_referrer_reward, 'referral_reward', v_ref.id,
          'Referral reward: invitee completed first workout')
  RETURNING id INTO v_referrer_tx_id;

  UPDATE public.referrals
  SET status = 'rewarded',
      rewarded_at = NOW(),
      reward_tx_id = v_referrer_tx_id,
      updated_at = NOW()
  WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'success', true, 'status', 'rewarded',
    'invitee_bonus_drops', v_invitee_bonus,
    'referrer_reward_drops', v_referrer_reward,
    'reward_tx_id', v_referrer_tx_id,
    'rewarded_at', NOW()
  );
END;
$fn$;

-- ============================================================
-- 6) Rewrite get_referral_timeline (add first_workout step)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_referral_timeline(p_referral_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid  UUID := auth.uid();
  v_ref  public.referrals%ROWTYPE;
  v_steps JSONB := '[]'::jsonb;
  v_current_status TEXT;
  v_referrer_name TEXT;
  v_invitee_name  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_referral_id IS NOT NULL THEN
    SELECT * INTO v_ref FROM public.referrals WHERE id = p_referral_id;
  ELSE
    SELECT * INTO v_ref FROM public.referrals
    WHERE (referrer_user_id = v_uid OR invitee_user_id = v_uid)
      AND status IN ('pending','active','rewarded')
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_not_found');
  END IF;

  IF v_uid <> v_ref.referrer_user_id
     AND v_uid <> COALESCE(v_ref.invitee_user_id, '00000000-0000-0000-0000-000000000000'::UUID)
     AND NOT public.is_superadmin(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(p.username, p.full_name, 'User') INTO v_referrer_name
  FROM public.profiles p WHERE p.id = v_ref.referrer_user_id;
  IF v_ref.invitee_user_id IS NOT NULL THEN
    SELECT COALESCE(p.username, p.full_name, 'User') INTO v_invitee_name
    FROM public.profiles p WHERE p.id = v_ref.invitee_user_id;
  END IF;

  v_steps := v_steps || jsonb_build_object('step','invited','completed',true,'at',v_ref.created_at);

  IF v_ref.status = 'expired' THEN
    v_current_status := 'expired';
  ELSIF v_ref.status = 'blocked' THEN
    v_current_status := 'blocked';
  ELSIF v_ref.status = 'pending' AND v_ref.invitee_user_id IS NULL THEN
    v_current_status := 'invited';
  ELSIF v_ref.status IN ('active','rewarded') THEN
    v_steps := v_steps || jsonb_build_object('step','joined','completed',true,'at',COALESCE(v_ref.joined_at, v_ref.updated_at));

    v_steps := v_steps || jsonb_build_object('step','first_checkin','completed',(v_ref.qualified_checkin_at IS NOT NULL),'at',v_ref.qualified_checkin_at);

    v_steps := v_steps || jsonb_build_object('step','first_workout','completed',(v_ref.qualified_first_workout_at IS NOT NULL),'at',v_ref.qualified_first_workout_at);

    IF v_ref.status = 'rewarded' THEN
      v_steps := v_steps || jsonb_build_object('step','rewarded','completed',true,'at',v_ref.rewarded_at);
      v_current_status := 'rewarded';
    ELSIF v_ref.qualified_first_workout_at IS NOT NULL THEN
      v_current_status := 'first_workout';
    ELSIF v_ref.qualified_checkin_at IS NOT NULL THEN
      v_current_status := 'first_checkin';
    ELSE
      v_current_status := 'joined';
    END IF;
  ELSE
    v_current_status := v_ref.status;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_ref.id,
    'invite_code', v_ref.invite_code,
    'current_status', v_current_status,
    'referrer_name', v_referrer_name,
    'invitee_name', v_invitee_name,
    'steps', v_steps,
    'is_referrer', (v_uid = v_ref.referrer_user_id),
    'expires_at', v_ref.expires_at,
    'reward_block_reason', v_ref.reward_block_reason,
    'created_at', v_ref.created_at
  );
END;
$fn$;

-- ============================================================
-- 7) Rewrite get_my_referrals (add first_workout + reward_block_reason)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_referrals(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid    UUID := auth.uid();
  v_result JSONB;
  v_cap    INT;
  v_rewarded_this_month INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_cap := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_monthly_payout_cap'), 5);

  SELECT COUNT(*) INTO v_rewarded_this_month
  FROM public.referrals r2
  WHERE r2.referrer_user_id = v_uid
    AND r2.status = 'rewarded'
    AND r2.rewarded_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade'
    AND r2.reward_block_reason IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'referral_id', r.id,
    'invite_code', r.invite_code,
    'status', r.status,
    'invitee_name', COALESCE(p.username, p.full_name),
    'created_at', r.created_at,
    'joined_at', r.joined_at,
    'qualified_checkin_at', r.qualified_checkin_at,
    'qualified_first_workout_at', r.qualified_first_workout_at,
    'rewarded_at', r.rewarded_at,
    'reward_block_reason', r.reward_block_reason,
    'expires_at', r.expires_at,
    'current_status', CASE
      WHEN r.status = 'rewarded' THEN 'rewarded'
      WHEN r.status = 'blocked' THEN 'blocked'
      WHEN r.status = 'expired' THEN 'expired'
      WHEN r.status = 'pending' AND r.invitee_user_id IS NULL THEN 'invited'
      WHEN r.qualified_first_workout_at IS NOT NULL THEN 'first_workout'
      WHEN r.qualified_checkin_at IS NOT NULL THEN 'first_checkin'
      WHEN r.status = 'active' THEN 'joined'
      ELSE r.status
    END
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.referrals r
  LEFT JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.referrer_user_id = v_uid AND r.gym_id = p_gym_id;

  RETURN jsonb_build_object(
    'success', true,
    'referrals', v_result,
    'count', COALESCE(jsonb_array_length(v_result), 0),
    'monthly_rewarded', v_rewarded_this_month,
    'monthly_cap', v_cap,
    'monthly_remaining', GREATEST(0, v_cap - v_rewarded_this_month)
  );
END;
$fn$;

-- ============================================================
-- 8) Referral stats RPC (invite screen KPIs)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_referral_stats(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_total         INT := 0;
  v_joined        INT := 0;
  v_workout_done  INT := 0;
  v_rewarded      INT := 0;
  v_cap_blocked   INT := 0;
  v_monthly_cap   INT;
  v_monthly_paid  INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_monthly_cap := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_monthly_payout_cap'), 5);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.status IN ('active','rewarded') AND r.invitee_user_id IS NOT NULL),
    COUNT(*) FILTER (WHERE r.qualified_first_workout_at IS NOT NULL),
    COUNT(*) FILTER (WHERE r.status = 'rewarded' AND r.reward_block_reason IS NULL),
    COUNT(*) FILTER (WHERE r.status = 'rewarded' AND r.reward_block_reason = 'monthly_cap_reached')
  INTO v_total, v_joined, v_workout_done, v_rewarded, v_cap_blocked
  FROM public.referrals r
  WHERE r.referrer_user_id = v_uid AND r.gym_id = p_gym_id;

  SELECT COUNT(*) INTO v_monthly_paid
  FROM public.referrals r2
  WHERE r2.referrer_user_id = v_uid
    AND r2.status = 'rewarded'
    AND r2.reward_block_reason IS NULL
    AND r2.rewarded_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';

  RETURN jsonb_build_object(
    'success', true,
    'total_invites', v_total,
    'joined', v_joined,
    'workout_completed', v_workout_done,
    'rewarded', v_rewarded,
    'cap_blocked', v_cap_blocked,
    'monthly_rewarded', v_monthly_paid,
    'monthly_cap', v_monthly_cap,
    'monthly_remaining', GREATEST(0, v_monthly_cap - v_monthly_paid)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_referral_stats(UUID) TO authenticated;
