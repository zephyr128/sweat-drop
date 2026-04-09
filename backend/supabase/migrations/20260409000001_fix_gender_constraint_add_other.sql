-- Migration: 20260409000001_fix_gender_constraint_add_other.sql
-- Description: Fixes profiles_gender_check constraint to include 'other' as a
--              valid gender value. The constraint was never correctly updated —
--              the original 20260325000001_add_other_gender.sql applied the DROP
--              but a later migration re-created the constraint without 'other'.
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- CHANGES:
-- - Modified constraint: profiles_gender_check — added 'other' to allowed values
--
-- IMPACT ON FRONTEND:
-- - Mobile App: onboarding gender picker — 'other' selection now saves correctly
-- - Admin Panel: No changes needed
--
-- BREAKING CHANGES:
-- - None

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
    CHECK (gender IN ('male', 'female', 'other'));

COMMENT ON COLUMN public.profiles.gender IS
  'User gender: male, female, or other';
