-- Migration: 20260327140000_profiles_email_verified_and_release_compliance.sql
-- Description: Auth + release/compliance hardening on profiles (additive only)
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/master_production_vortex_90d_execution_plan.md (A1, H2)
--            docs/plans/production_env_split_dev_prod_runbook.md (C1 — no DB split object; app-layer)
--
-- CHANGES:
-- - Added column: public.profiles.email_verified_at (TIMESTAMPTZ NULL)
-- - Added column: public.profiles.terms_privacy_acknowledged_at (TIMESTAMPTZ NULL)
-- - Added column: public.profiles.terms_privacy_document_version (TEXT NULL)
-- - Backfill: email_verified_at from auth.users.email_confirmed_at where available
-- - Index: partial for profiles with email but no verified_at (ops / auth-gate analytics)
--
-- IMPACT ON FRONTEND:
-- - Mobile: Read email_verified_at for email-provider gate; set legal ack columns after in-app acceptance
-- - Admin: Optional read for support; no RLS change (same profiles policies)
--
-- BREAKING CHANGES: None

-- 1) Columns (nullable — existing rows unchanged except backfill for verification)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_privacy_acknowledged_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_privacy_document_version TEXT;

COMMENT ON COLUMN public.profiles.email_verified_at IS
  'When the user''s email was verified. For email/password auth, align with Supabase Auth; OAuth users typically backfilled from auth.users.email_confirmed_at. Mobile may refresh via sync.';

COMMENT ON COLUMN public.profiles.terms_privacy_acknowledged_at IS
  'Timestamp when the member acknowledged in-app Terms + Privacy for the version in terms_privacy_document_version (store/compliance trail).';

COMMENT ON COLUMN public.profiles.terms_privacy_document_version IS
  'Opaque version key or URL slug for the legal bundle shown at acknowledgment (e.g. published doc version).';

-- 2) Backfill verification timestamp from Auth (does not overwrite non-null profile values)
UPDATE public.profiles p
SET email_verified_at = u.email_confirmed_at
FROM auth.users u
WHERE p.id = u.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.email_verified_at IS NULL;

-- 3) Partial index: recent signups with email but not yet mirrored as verified (support / analytics)
CREATE INDEX IF NOT EXISTS idx_profiles_email_pending_verification
  ON public.profiles (created_at DESC)
  WHERE email IS NOT NULL
    AND email_verified_at IS NULL;
