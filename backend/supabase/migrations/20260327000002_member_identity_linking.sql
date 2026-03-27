-- Migration: 20260327000002_member_identity_linking.sql
-- Description: Physical member identity linking model + verification RPCs
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/staff_identity_engagement_promotions_realtime_master_plan.md — Workstream B1
--
-- CHANGES:
-- - Created gym_member_identities table
-- - Added RLS policies (gym staff scoped + user own row + superadmin)
-- - Added get_checkin_identity_candidates RPC
-- - Added upsert_physical_member_identity RPC
-- - Added verify_member_identity RPC
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: CheckinStatsModule can show verified/unverified badge.
--   Add verify drawer/modal calling verify_member_identity.
--   Member profile section can show identity block.
-- - Mobile App: Can read own identity status from gym_member_identities.

-- ============================================================
-- 1) Create gym_member_identities table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gym_member_identities (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id                 UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_verified            BOOLEAN NOT NULL DEFAULT false,
  full_name_verified     TEXT NULL,
  external_membership_id TEXT NULL,
  verified_by            UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at            TIMESTAMPTZ NULL,
  verification_notes     TEXT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per gym+user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_gym_member_identity_gym_user'
  ) THEN
    ALTER TABLE public.gym_member_identities
      ADD CONSTRAINT uq_gym_member_identity_gym_user UNIQUE (gym_id, user_id);
  END IF;
END $$;

-- Unique external_membership_id per gym (partial: only when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_member_identity_ext_id
  ON public.gym_member_identities (gym_id, external_membership_id)
  WHERE external_membership_id IS NOT NULL;

-- ============================================================
-- 2) Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gym_member_identity_verified
  ON public.gym_member_identities (gym_id, is_verified);

CREATE INDEX IF NOT EXISTS idx_gym_member_identity_verified_at
  ON public.gym_member_identities (gym_id, verified_at DESC);

-- ============================================================
-- 3) RLS
-- ============================================================

ALTER TABLE public.gym_member_identities ENABLE ROW LEVEL SECURITY;

-- Superadmin full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gmi_superadmin_all' AND tablename = 'gym_member_identities') THEN
    CREATE POLICY "gmi_superadmin_all"
      ON public.gym_member_identities
      FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
      );
  END IF;
END $$;

-- Gym staff (owner/admin/receptionist) can read/write for their gym
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gmi_gym_staff_all' AND tablename = 'gym_member_identities') THEN
    CREATE POLICY "gmi_gym_staff_all"
      ON public.gym_member_identities
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('gym_owner', 'gym_admin', 'receptionist')
            AND (p.admin_gym_id = gym_member_identities.gym_id
                 OR p.assigned_gym_id = gym_member_identities.gym_id)
        )
      );
  END IF;
END $$;

-- Users can read their own identity row
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gmi_user_own_select' AND tablename = 'gym_member_identities') THEN
    CREATE POLICY "gmi_user_own_select"
      ON public.gym_member_identities
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 4) RPC: get_checkin_identity_candidates
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_checkin_identity_candidates(
  p_gym_id  UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT jsonb_build_object(
    'user_id', p.id,
    'username', p.username,
    'full_name', p.full_name,
    'email', p.email,
    'avatar_url', p.avatar_url,
    'role', p.role::TEXT,
    'membership', CASE WHEN gm.id IS NOT NULL THEN jsonb_build_object(
      'membership_id', gm.id,
      'local_drops_balance', gm.local_drops_balance,
      'joined_at', gm.created_at
    ) ELSE NULL END,
    'identity', CASE WHEN gi.id IS NOT NULL THEN jsonb_build_object(
      'identity_id', gi.id,
      'is_verified', gi.is_verified,
      'full_name_verified', gi.full_name_verified,
      'external_membership_id', gi.external_membership_id,
      'verified_by', gi.verified_by,
      'verified_at', gi.verified_at,
      'verification_notes', gi.verification_notes
    ) ELSE jsonb_build_object(
      'identity_id', NULL,
      'is_verified', false,
      'full_name_verified', NULL,
      'external_membership_id', NULL,
      'verified_by', NULL,
      'verified_at', NULL,
      'verification_notes', NULL
    ) END,
    'last_checkin', (
      SELECT MAX(gc.checked_in_at)
      FROM public.gym_checkins gc
      WHERE gc.gym_id = p_gym_id AND gc.user_id = p_user_id
    ),
    'total_checkins', (
      SELECT COUNT(*)
      FROM public.gym_checkins gc
      WHERE gc.gym_id = p_gym_id AND gc.user_id = p_user_id
    )
  ) INTO v_result
  FROM public.profiles p
  LEFT JOIN public.gym_memberships gm ON gm.user_id = p.id AND gm.gym_id = p_gym_id
  LEFT JOIN public.gym_member_identities gi ON gi.user_id = p.id AND gi.gym_id = p_gym_id
  WHERE p.id = p_user_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_checkin_identity_candidates(UUID, UUID) TO authenticated;

-- ============================================================
-- 5) RPC: upsert_physical_member_identity
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

  -- Verify user is a member of this gym
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships WHERE gym_id = p_gym_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'User is not a member of this gym');
  END IF;

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

  RETURN jsonb_build_object(
    'success', true,
    'identity_id', v_identity_id
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.upsert_physical_member_identity(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 6) RPC: verify_member_identity
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

  -- Verify user is a member of this gym
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships WHERE gym_id = p_gym_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'User is not a member of this gym');
  END IF;

  -- Upsert identity row and mark verified
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

  RETURN jsonb_build_object(
    'success', true,
    'identity_id', v_identity_id,
    'verified_by', v_caller,
    'verified_at', NOW()
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.verify_member_identity(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
