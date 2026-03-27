-- Migration: 20260327000003_identity_rpc_ext_id_conflict_guard.sql
-- Description: Add EXCEPTION handler for duplicate external_membership_id in identity RPCs
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- The upsert and verify RPCs can hit the partial unique index on
-- (gym_id, external_membership_id) when two different users are assigned the
-- same card number. This patch wraps the INSERT..ON CONFLICT in an
-- EXCEPTION block to return a friendly error instead of raising.

-- ============================================================
-- 1) Patch upsert_physical_member_identity
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_physical_member_identity(
  p_gym_id                 UUID,
  p_user_id                UUID,
  p_full_name_verified     TEXT DEFAULT NULL,
  p_external_membership_id TEXT DEFAULT NULL,
  p_verification_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_identity_id UUID;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships WHERE gym_id = p_gym_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'User is not a member of this gym');
  END IF;

  BEGIN
    INSERT INTO public.gym_member_identities (
      gym_id, user_id, full_name_verified, external_membership_id, verification_notes
    )
    VALUES (
      p_gym_id, p_user_id,
      NULLIF(TRIM(COALESCE(p_full_name_verified, '')), ''),
      NULLIF(TRIM(COALESCE(p_external_membership_id, '')), ''),
      NULLIF(TRIM(COALESCE(p_verification_notes, '')), '')
    )
    ON CONFLICT (gym_id, user_id)
    DO UPDATE SET
      full_name_verified     = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.full_name_verified, '')), ''), gym_member_identities.full_name_verified),
      external_membership_id = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.external_membership_id, '')), ''), gym_member_identities.external_membership_id),
      verification_notes     = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.verification_notes, '')), ''), gym_member_identities.verification_notes),
      updated_at             = NOW()
    RETURNING id INTO v_identity_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'This membership ID is already assigned to another member in this gym');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'identity_id', v_identity_id
  );
END;
$fn$;

-- ============================================================
-- 2) Patch verify_member_identity
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_member_identity(
  p_gym_id                 UUID,
  p_user_id                UUID,
  p_full_name_verified     TEXT DEFAULT NULL,
  p_external_membership_id TEXT DEFAULT NULL,
  p_verification_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller UUID;
  v_identity_id UUID;
BEGIN
  v_caller := auth.uid();

  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships WHERE gym_id = p_gym_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'User is not a member of this gym');
  END IF;

  BEGIN
    INSERT INTO public.gym_member_identities (
      gym_id, user_id, is_verified,
      full_name_verified, external_membership_id, verification_notes,
      verified_by, verified_at
    )
    VALUES (
      p_gym_id, p_user_id, true,
      NULLIF(TRIM(COALESCE(p_full_name_verified, '')), ''),
      NULLIF(TRIM(COALESCE(p_external_membership_id, '')), ''),
      NULLIF(TRIM(COALESCE(p_verification_notes, '')), ''),
      v_caller, NOW()
    )
    ON CONFLICT (gym_id, user_id)
    DO UPDATE SET
      is_verified            = true,
      full_name_verified     = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.full_name_verified, '')), ''), gym_member_identities.full_name_verified),
      external_membership_id = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.external_membership_id, '')), ''), gym_member_identities.external_membership_id),
      verification_notes     = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.verification_notes, '')), ''), gym_member_identities.verification_notes),
      verified_by            = v_caller,
      verified_at            = NOW(),
      updated_at             = NOW()
    RETURNING id INTO v_identity_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'This membership ID is already assigned to another member in this gym');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'identity_id', v_identity_id,
    'verified_by', v_caller,
    'verified_at', NOW()
  );
END;
$fn$;
