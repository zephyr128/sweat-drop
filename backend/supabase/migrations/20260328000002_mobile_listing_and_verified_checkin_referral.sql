-- Migration: 20260328000002_mobile_listing_and_verified_checkin_referral.sql
-- Description: A) Permanent mobile listing rename (gyms.is_mobile_listed)
--              B) Referral reward trigger = first verified QR check-in (not workout)
--
-- AGENT NOTE: [2026-03-28] - supabase-dba
--
-- ROLLBACK:
-- ALTER TABLE public.gyms DROP COLUMN IF EXISTS is_mobile_listed;
-- ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_verified_at;
-- Then restore previous RPC versions from 20260328000001 migration.

-- ============================================================
-- A1) Add is_mobile_listed column + backfill from is_pilot_enabled
-- ============================================================

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS is_mobile_listed BOOLEAN NOT NULL DEFAULT true;

UPDATE public.gyms SET is_mobile_listed = is_pilot_enabled
WHERE is_mobile_listed IS DISTINCT FROM is_pilot_enabled;

CREATE INDEX IF NOT EXISTS idx_gyms_mobile_listed
  ON public.gyms (is_mobile_listed, is_active)
  WHERE is_mobile_listed = true AND is_active = true;

-- ============================================================
-- A2) Replace get_public_gyms_for_mobile
--     Drop old 1-param overload, recreate with both params
-- ============================================================

DROP FUNCTION IF EXISTS public.get_public_gyms_for_mobile(boolean);

CREATE OR REPLACE FUNCTION public.get_public_gyms_for_mobile(
  p_pilot_only  BOOLEAN DEFAULT false,
  p_listed_only BOOLEAN DEFAULT true
)
RETURNS TABLE(
  id UUID, name TEXT, city TEXT, country TEXT, address TEXT,
  owner_id UUID, lat NUMERIC, lng NUMERIC,
  is_pilot_enabled BOOLEAN, is_mobile_listed BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    g.id, g.name, g.city, g.country, g.address,
    g.owner_id, g.lat, g.lng,
    g.is_pilot_enabled, g.is_mobile_listed,
    g.created_at, g.updated_at
  FROM public.gyms g
  WHERE COALESCE(g.is_active, true) = true
    AND (NOT p_listed_only OR g.is_mobile_listed = true)
    AND (NOT p_pilot_only OR g.is_pilot_enabled = true)
  ORDER BY g.name ASC;
END;
$fn$;

-- ============================================================
-- B1) Add qualified_verified_at to referrals
-- ============================================================

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualified_verified_at TIMESTAMPTZ NULL;

-- ============================================================
-- B2) Rewrite evaluate_referral_qualification
--     Trigger: first check-in at gym WHERE invitee is identity-verified
--     Invitee bonus: +100 once
--     Referrer reward: +150 (monthly cap 5)
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
  v_checkin            RECORD;
  v_is_verified        BOOLEAN;
  v_referrer_reward    INT;
  v_invitee_bonus      INT;
  v_monthly_cap        INT;
  v_rewarded_this_month INT;
  v_referrer_tx_id     UUID;
  v_invitee_tx_id      UUID;
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
      'rewarded_at', v_ref.rewarded_at,
      'reward_tx_id', v_ref.reward_tx_id,
      'reward_block_reason', v_ref.reward_block_reason
    );
  END IF;

  IF v_ref.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_state', 'status', v_ref.status);
  END IF;

  -- Auth: invitee drives mutation, others get read-only
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
      'qualified_verified_at', v_ref.qualified_verified_at,
      'rewarded_at', v_ref.rewarded_at
    );
  END IF;

  -- Check expiry
  IF v_ref.expires_at IS NOT NULL AND v_ref.expires_at < NOW() THEN
    UPDATE public.referrals SET status = 'expired', updated_at = NOW() WHERE id = v_ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'referral_expired');
  END IF;

  -- Step 1: Detect first check-in at gym (any check-in, for timeline)
  IF v_ref.qualified_checkin_at IS NULL THEN
    SELECT gc.id, gc.checked_in_at INTO v_checkin
    FROM public.gym_checkins gc
    WHERE gc.user_id = v_ref.invitee_user_id AND gc.gym_id = v_ref.gym_id
    ORDER BY gc.checked_in_at ASC LIMIT 1;

    IF FOUND THEN
      UPDATE public.referrals
      SET qualified_checkin_at = v_checkin.checked_in_at,
          qualified_checkin_id = v_checkin.id,
          updated_at = NOW()
      WHERE id = v_ref.id;
      v_ref.qualified_checkin_at := v_checkin.checked_in_at;
    END IF;
  END IF;

  -- Step 2: Check if invitee is identity-verified at this gym (REWARD TRIGGER)
  IF v_ref.qualified_verified_at IS NULL THEN
    SELECT gmi.is_verified INTO v_is_verified
    FROM public.gym_member_identities gmi
    WHERE gmi.user_id = v_ref.invitee_user_id
      AND gmi.gym_id = v_ref.gym_id;

    IF v_is_verified = true AND v_ref.qualified_checkin_at IS NOT NULL THEN
      UPDATE public.referrals
      SET qualified_verified_at = NOW(),
          updated_at = NOW()
      WHERE id = v_ref.id;
      v_ref.qualified_verified_at := NOW();
    END IF;
  END IF;

  -- Not yet qualified: need check-in + verified identity
  IF v_ref.qualified_verified_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'active',
      'qualified_checkin_at', v_ref.qualified_checkin_at,
      'qualified_verified_at', v_ref.qualified_verified_at,
      'is_identity_verified', COALESCE(v_is_verified, false),
      'rewarded', false
    );
  END IF;

  -- Already rewarded (idempotent)
  IF v_ref.rewarded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'rewarded',
      'rewarded_at', v_ref.rewarded_at,
      'reward_tx_id', v_ref.reward_tx_id,
      'reward_block_reason', v_ref.reward_block_reason
    );
  END IF;

  -- Read config
  v_referrer_reward := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_referrer_reward_drops'), 150);
  v_invitee_bonus   := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_invitee_bonus_drops'), 100);
  v_monthly_cap     := COALESCE((SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_monthly_payout_cap'), 5);

  -- === INVITEE BONUS (+100 once) ===
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
            'Referral bonus: verified check-in completed')
    RETURNING id INTO v_invitee_tx_id;

    UPDATE public.referrals SET invitee_reward_tx_id = v_invitee_tx_id, updated_at = NOW() WHERE id = v_ref.id;
  END IF;

  -- === REFERRER REWARD (+150 with monthly cap) ===
  SELECT COUNT(*) INTO v_rewarded_this_month
  FROM public.referrals r2
  WHERE r2.referrer_user_id = v_ref.referrer_user_id
    AND r2.status = 'rewarded'
    AND r2.rewarded_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade'
    AND r2.reward_block_reason IS NULL;

  IF v_rewarded_this_month >= v_monthly_cap THEN
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
          'Referral reward: invitee verified check-in')
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
-- B3) Rewrite get_referral_timeline (verified_checkin step)
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

  -- Step: invited
  v_steps := v_steps || jsonb_build_object('step','invited','completed',true,'at',v_ref.created_at);

  IF v_ref.status = 'expired' THEN
    v_current_status := 'expired';
  ELSIF v_ref.status = 'blocked' THEN
    v_current_status := 'blocked';
  ELSIF v_ref.status = 'pending' AND v_ref.invitee_user_id IS NULL THEN
    v_current_status := 'invited';
  ELSIF v_ref.status IN ('active','rewarded') THEN
    -- Step: joined
    v_steps := v_steps || jsonb_build_object('step','joined','completed',true,'at',COALESCE(v_ref.joined_at, v_ref.updated_at));
    -- Step: first_checkin (QR scan)
    v_steps := v_steps || jsonb_build_object('step','first_checkin','completed',(v_ref.qualified_checkin_at IS NOT NULL),'at',v_ref.qualified_checkin_at);
    -- Step: verified_checkin (identity verified + checked in)
    v_steps := v_steps || jsonb_build_object('step','verified_checkin','completed',(v_ref.qualified_verified_at IS NOT NULL),'at',v_ref.qualified_verified_at);

    IF v_ref.status = 'rewarded' THEN
      v_steps := v_steps || jsonb_build_object('step','rewarded','completed',true,'at',v_ref.rewarded_at);
      v_current_status := 'rewarded';
    ELSIF v_ref.qualified_verified_at IS NOT NULL THEN
      v_current_status := 'verified_checkin';
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
-- B4) Rewrite get_my_referrals (verified_checkin current_status)
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
    'qualified_verified_at', r.qualified_verified_at,
    'rewarded_at', r.rewarded_at,
    'reward_block_reason', r.reward_block_reason,
    'expires_at', r.expires_at,
    'current_status', CASE
      WHEN r.status = 'rewarded' THEN 'rewarded'
      WHEN r.status = 'blocked' THEN 'blocked'
      WHEN r.status = 'expired' THEN 'expired'
      WHEN r.status = 'pending' AND r.invitee_user_id IS NULL THEN 'invited'
      WHEN r.qualified_verified_at IS NOT NULL THEN 'verified_checkin'
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
-- B5) Patch get_referral_stats (verified_checkin counts)
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
  v_checked_in    INT := 0;
  v_verified      INT := 0;
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
    COUNT(*) FILTER (WHERE r.qualified_checkin_at IS NOT NULL),
    COUNT(*) FILTER (WHERE r.qualified_verified_at IS NOT NULL),
    COUNT(*) FILTER (WHERE r.status = 'rewarded' AND r.reward_block_reason IS NULL),
    COUNT(*) FILTER (WHERE r.status = 'rewarded' AND r.reward_block_reason = 'monthly_cap_reached')
  INTO v_total, v_joined, v_checked_in, v_verified, v_rewarded, v_cap_blocked
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
    'checked_in', v_checked_in,
    'verified', v_verified,
    'rewarded', v_rewarded,
    'cap_blocked', v_cap_blocked,
    'monthly_rewarded', v_monthly_paid,
    'monthly_cap', v_monthly_cap,
    'monthly_remaining', GREATEST(0, v_monthly_cap - v_monthly_paid)
  );
END;
$fn$;
