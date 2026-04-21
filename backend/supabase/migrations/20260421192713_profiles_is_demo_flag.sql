-- Migration: 20260421192713_profiles_is_demo_flag.sql
-- Description: Add profiles.is_demo server-side flag and enforce superadmin-only mutation.
--
-- AGENT NOTE: [2026-04-21] - supabase-dba
--
-- CHANGES:
-- - Added column: public.profiles.is_demo (BOOLEAN NOT NULL DEFAULT false)
-- - Added index: idx_profiles_is_demo (partial index for true values)
-- - Added policy: "profiles_is_demo_superadmin_only" (superadmin can update profiles rows)
-- - Added trigger guard: blocks non-superadmin mutation of is_demo while preserving normal profile self-updates
--
-- IMPACT ON FRONTEND:
-- - Mobile App: can gate simulator/demo flows using server truth (profiles.is_demo)
-- - Admin Panel: superadmin can toggle demo users via profiles update
--
-- BREAKING CHANGES:
-- - None (additive)

SET search_path TO public;

-- -----------------------------------------------------------------------------
-- profiles.is_demo
-- Server-side flag that unlocks simulator/demo flows in mobile app.
-- Reserved for internal QA and Apple/Google reviewer accounts.
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_demo IS
  'When true, mobile app allows simulator/demo flows (Apple reviewer, internal QA, sales demos). Never set for real users — bypasses BLE machine lock.';

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo
  ON public.profiles(is_demo)
  WHERE is_demo = true;

-- -----------------------------------------------------------------------------
-- RLS/authorization hardening:
-- 1) Superadmin gets explicit UPDATE permission on profiles rows.
-- 2) Trigger prevents non-superadmin actors from changing only `is_demo`.
--
-- We intentionally keep existing profiles self-update flows intact for
-- username/avatar/etc. The trigger scopes enforcement to `is_demo` only.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_is_demo_superadmin_only" ON public.profiles;

CREATE POLICY "profiles_is_demo_superadmin_only"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_profiles_is_demo_superadmin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Service-role/postgres contexts may not carry auth.uid(); allow those flows.
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo
     AND auth.uid() IS NOT NULL
     AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmin can modify profiles.is_demo';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_is_demo_update ON public.profiles;

CREATE TRIGGER trg_profiles_guard_is_demo_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profiles_is_demo_superadmin_only();
