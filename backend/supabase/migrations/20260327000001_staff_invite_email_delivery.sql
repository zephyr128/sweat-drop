-- Migration: 20260327000001_staff_invite_email_delivery.sql
-- Description: Staff invite email delivery tracking + resend RPC
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/staff_identity_engagement_promotions_realtime_master_plan.md — Workstream A1
--
-- CHANGES:
-- - Extended staff_invitations with email delivery tracking columns
-- - Added resend_staff_invitation_email RPC
-- - Added mark_staff_invitation_email_delivery RPC
-- - Added performance indexes
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: Can show delivery status badge, resend button, failure reason.
--   TeamManager should read email_delivery_status + resend_count.
-- - Mobile App: No changes.

-- ============================================================
-- 1) Extend staff_invitations with delivery tracking
-- ============================================================

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_status TEXT NOT NULL DEFAULT 'pending';

-- Add CHECK separately to handle pre-existing column case
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'staff_invitations_email_delivery_status_check'
  ) THEN
    ALTER TABLE public.staff_invitations
      ADD CONSTRAINT staff_invitations_email_delivery_status_check
      CHECK (email_delivery_status IN ('pending', 'sent', 'failed'));
  END IF;
END $$;

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ NULL;

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS email_failure_reason TEXT NULL;

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS last_email_provider_id TEXT NULL;

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS resend_count INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'staff_invitations_resend_count_check'
  ) THEN
    ALTER TABLE public.staff_invitations
      ADD CONSTRAINT staff_invitations_resend_count_check
      CHECK (resend_count >= 0);
  END IF;
END $$;

-- ============================================================
-- 2) Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_staff_inv_gym_status_created
  ON public.staff_invitations (gym_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_inv_email_status
  ON public.staff_invitations (email, status);

CREATE INDEX IF NOT EXISTS idx_staff_inv_delivery_status
  ON public.staff_invitations (email_delivery_status, created_at DESC);

-- ============================================================
-- 3) RPC: resend_staff_invitation_email
-- ============================================================

CREATE OR REPLACE FUNCTION public.resend_staff_invitation_email(
  p_invitation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv RECORD;
  v_gym_name TEXT;
BEGIN
  -- Fetch invitation
  SELECT * INTO v_inv
  FROM public.staff_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invitation not found');
  END IF;

  -- Gym access check
  IF NOT public._admin_check_gym_access(v_inv.gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Cannot resend accepted/revoked invitations
  IF v_inv.status NOT IN ('pending', 'expired') THEN
    RETURN jsonb_build_object('error', 'Cannot resend: invitation status is ' || v_inv.status);
  END IF;

  -- Rate limit: max 5 resends
  IF v_inv.resend_count >= 5 THEN
    RETURN jsonb_build_object('error', 'Resend limit reached (max 5)');
  END IF;

  -- Reset delivery status and bump counter
  UPDATE public.staff_invitations
  SET email_delivery_status = 'pending',
      email_failure_reason = NULL,
      resend_count = resend_count + 1,
      -- Extend expiry if expired
      expires_at = CASE
        WHEN expires_at < NOW() THEN NOW() + INTERVAL '7 days'
        ELSE expires_at
      END
  WHERE id = p_invitation_id;

  -- Get gym name for email template
  SELECT name INTO v_gym_name FROM public.gyms WHERE id = v_inv.gym_id;

  RETURN jsonb_build_object(
    'success', true,
    'invitation', jsonb_build_object(
      'id', v_inv.id,
      'email', v_inv.email,
      'role', v_inv.role::TEXT,
      'token', v_inv.token,
      'gym_id', v_inv.gym_id,
      'gym_name', COALESCE(v_gym_name, ''),
      'invited_by', v_inv.invited_by,
      'resend_count', v_inv.resend_count + 1,
      'expires_at', CASE
        WHEN v_inv.expires_at < NOW() THEN NOW() + INTERVAL '7 days'
        ELSE v_inv.expires_at
      END
    )
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resend_staff_invitation_email(UUID) TO authenticated;

-- ============================================================
-- 4) RPC: mark_staff_invitation_email_delivery
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_staff_invitation_email_delivery(
  p_invitation_id    UUID,
  p_provider_id      TEXT DEFAULT NULL,
  p_status           TEXT DEFAULT 'sent',
  p_error_text       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN
    RETURN jsonb_build_object('error', 'Invalid status: must be sent or failed');
  END IF;

  UPDATE public.staff_invitations
  SET email_delivery_status = p_status,
      email_sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE email_sent_at END,
      email_failure_reason = CASE WHEN p_status = 'failed' THEN p_error_text ELSE NULL END,
      last_email_provider_id = COALESCE(p_provider_id, last_email_provider_id)
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invitation not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mark_staff_invitation_email_delivery(UUID, TEXT, TEXT, TEXT) TO authenticated;
