-- Migration: 20260327160000_referral_timeline_support.sql
-- Description: Add explicit timeline timestamps + timeline RPC for referral UX hotfix
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Audit found: mobile needs deterministic timeline statuses without client workarounds.
-- Missing: joined_at, expires_at columns, expired status, timeline RPC.
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Use get_referral_timeline() for status timeline rendering.
--   joined_at now explicitly available on referral rows.
-- - Admin Panel: No impact (additive only).
--
-- BREAKING CHANGES: None

-- ============================================================
-- 1) Add timeline timestamp columns
-- ============================================================

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NULL;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- ============================================================
-- 2) Widen status CHECK to include 'expired'
-- ============================================================

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('pending', 'active', 'rewarded', 'blocked', 'expired'));

-- ============================================================
-- 3) Backfill joined_at for existing active/rewarded rows
-- ============================================================

UPDATE public.referrals
SET joined_at = updated_at
WHERE status IN ('active', 'rewarded')
  AND invitee_user_id IS NOT NULL
  AND joined_at IS NULL;

-- ============================================================
-- 4) Index for expiry sweep + timeline queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_referrals_invitee
  ON public.referrals (invitee_user_id, created_at DESC)
  WHERE invitee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_expires
  ON public.referrals (expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

-- ============================================================
-- 5) Patch apply_referral_code to set joined_at
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
    AND (r.expires_at IS NULL OR r.expires_at > NOW())
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
      joined_at = NOW(),
      updated_at = NOW()
  WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_ref.id,
    'status', 'active',
    'joined_at', NOW()
  );
END;
$fn$;

-- ============================================================
-- 6) Timeline RPC
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
    SELECT * INTO v_ref
    FROM public.referrals
    WHERE (referrer_user_id = v_uid OR invitee_user_id = v_uid)
      AND status IN ('pending', 'active', 'rewarded')
    ORDER BY created_at DESC
    LIMIT 1;
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

  -- Step 1: invited (always present)
  v_steps := v_steps || jsonb_build_object(
    'step', 'invited',
    'completed', true,
    'at', v_ref.created_at
  );

  -- Derive current status for the response
  IF v_ref.status = 'expired' THEN
    v_current_status := 'expired';
  ELSIF v_ref.status = 'blocked' THEN
    v_current_status := 'blocked';
  ELSIF v_ref.status = 'pending' AND v_ref.invitee_user_id IS NULL THEN
    v_current_status := 'invited';
  ELSIF v_ref.status IN ('active', 'rewarded') THEN
    -- Step 2: joined
    v_steps := v_steps || jsonb_build_object(
      'step', 'joined',
      'completed', true,
      'at', COALESCE(v_ref.joined_at, v_ref.updated_at)
    );

    IF v_ref.qualified_checkin_at IS NOT NULL THEN
      v_steps := v_steps || jsonb_build_object(
        'step', 'qualified_checkin',
        'completed', true,
        'at', v_ref.qualified_checkin_at
      );
    ELSE
      v_steps := v_steps || jsonb_build_object(
        'step', 'qualified_checkin',
        'completed', false,
        'at', NULL
      );
    END IF;

    IF v_ref.qualified_redemption_at IS NOT NULL THEN
      v_steps := v_steps || jsonb_build_object(
        'step', 'qualified_redemption',
        'completed', true,
        'at', v_ref.qualified_redemption_at
      );
    ELSE
      v_steps := v_steps || jsonb_build_object(
        'step', 'qualified_redemption',
        'completed', false,
        'at', NULL
      );
    END IF;

    IF v_ref.status = 'rewarded' THEN
      v_current_status := 'rewarded';
      v_steps := v_steps || jsonb_build_object(
        'step', 'rewarded',
        'completed', true,
        'at', v_ref.rewarded_at
      );
    ELSIF v_ref.qualified_checkin_at IS NOT NULL AND v_ref.qualified_redemption_at IS NOT NULL THEN
      v_current_status := 'qualified_redemption';
    ELSIF v_ref.qualified_checkin_at IS NOT NULL THEN
      v_current_status := 'qualified_checkin';
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
    'created_at', v_ref.created_at
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_referral_timeline(UUID) TO authenticated;

-- ============================================================
-- 7) Helper: get_my_referrals (list view for referrer)
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'referral_id', r.id,
    'invite_code', r.invite_code,
    'status', r.status,
    'invitee_name', COALESCE(p.username, p.full_name),
    'created_at', r.created_at,
    'joined_at', r.joined_at,
    'qualified_checkin_at', r.qualified_checkin_at,
    'qualified_redemption_at', r.qualified_redemption_at,
    'rewarded_at', r.rewarded_at,
    'expires_at', r.expires_at,
    'current_status', CASE
      WHEN r.status = 'rewarded' THEN 'rewarded'
      WHEN r.status = 'blocked' THEN 'blocked'
      WHEN r.status = 'expired' THEN 'expired'
      WHEN r.status = 'pending' AND r.invitee_user_id IS NULL THEN 'invited'
      WHEN r.qualified_checkin_at IS NOT NULL AND r.qualified_redemption_at IS NOT NULL THEN 'qualified_redemption'
      WHEN r.qualified_checkin_at IS NOT NULL THEN 'qualified_checkin'
      WHEN r.status = 'active' THEN 'joined'
      ELSE r.status
    END
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.referrals r
  LEFT JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.referrer_user_id = v_uid
    AND r.gym_id = p_gym_id;

  RETURN jsonb_build_object(
    'success', true,
    'referrals', v_result,
    'count', COALESCE(jsonb_array_length(v_result), 0)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_my_referrals(UUID) TO authenticated;
