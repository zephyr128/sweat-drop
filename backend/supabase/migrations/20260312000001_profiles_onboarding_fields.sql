-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000001_profiles_onboarding_fields.sql
-- Description: Add profile setup fields for onboarding wizard
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/onboarding_profile_setup_wizard.md — Phase 1
--
-- CHANGES:
--   - Added columns: gender, weight_kg, height_cm, date_of_birth,
--     fitness_goal, onboarding_completed
--   - CHECK constraints on all columns
--   - Indexes for fitness_goal and onboarding_completed
--   - get_user_age() helper function
--   - Existing users marked as onboarding_completed = true
--
-- IMPACT ON FRONTEND:
--   - Mobile: New onboarding wizard screens + profile edit
--   - Admin: No changes needed
--
-- BREAKING CHANGES: None (additive)
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- 1. Add columns to profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender             TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS weight_kg          NUMERIC(5,1) CHECK (weight_kg > 0 AND weight_kg < 500),
  ADD COLUMN IF NOT EXISTS height_cm          INTEGER CHECK (height_cm > 0 AND height_cm < 300),
  ADD COLUMN IF NOT EXISTS date_of_birth      DATE CHECK (date_of_birth < CURRENT_DATE),
  ADD COLUMN IF NOT EXISTS fitness_goal       TEXT CHECK (fitness_goal IN (
    'weight_loss', 'strength', 'cardio', 'health'
  )),
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. Comments
-- ============================================================

COMMENT ON COLUMN public.profiles.gender IS
  'User gender: male or female';
COMMENT ON COLUMN public.profiles.weight_kg IS
  'User weight in kilograms. Used for calorie calculation.';
COMMENT ON COLUMN public.profiles.height_cm IS
  'User height in centimeters. Used for calorie calculation.';
COMMENT ON COLUMN public.profiles.date_of_birth IS
  'User date of birth. Age calculated dynamically via get_user_age().';
COMMENT ON COLUMN public.profiles.fitness_goal IS
  'Primary fitness goal: weight_loss, strength, cardio, health';
COMMENT ON COLUMN public.profiles.onboarding_completed IS
  'True when user has completed or explicitly skipped the profile setup wizard.';

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_fitness_goal
  ON public.profiles(fitness_goal)
  WHERE fitness_goal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding
  ON public.profiles(onboarding_completed)
  WHERE onboarding_completed = false;

-- ============================================================
-- 4. Mark ALL existing users as completed (they already use the app)
-- New users will get DEFAULT false and go through the wizard
-- ============================================================

UPDATE public.profiles SET onboarding_completed = true WHERE onboarding_completed = false;

-- ============================================================
-- 5. Helper function: get_user_age()
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_age(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth))::INTEGER
  FROM public.profiles
  WHERE id = p_user_id AND date_of_birth IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_age(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_age(UUID) IS
  'Returns user age in years based on date_of_birth. Returns NULL if date_of_birth is not set.';
