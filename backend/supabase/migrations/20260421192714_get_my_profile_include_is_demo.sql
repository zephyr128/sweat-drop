-- Migration: 20260421192714_get_my_profile_include_is_demo.sql
-- Description: Extend get_my_profile() contract with is_demo flag.
--
-- AGENT NOTE: [2026-04-21] - supabase-dba
--
-- CHANGES:
-- - Replaced function: public.get_my_profile()
-- - Added return column: is_demo BOOLEAN (COALESCE to false)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: profile payload now includes `is_demo` for secure simulator gating.
-- - Admin Panel: no direct impact.
--
-- BREAKING CHANGES:
-- - None (additive return field only).

SET search_path TO public;

DROP FUNCTION IF EXISTS public.get_my_profile();

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  admin_gym_id UUID,
  assigned_gym_id UUID,
  available_drops INTEGER,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  date_of_birth DATE,
  email TEXT,
  email_verified_at TIMESTAMPTZ,
  expo_push_token TEXT,
  fitness_goal TEXT,
  full_name TEXT,
  gender TEXT,
  happy_hour_reminder_offset_min INTEGER,
  happy_hour_reminders_enabled BOOLEAN,
  height_cm INTEGER,
  home_gym_id UUID,
  id UUID,
  is_newcomer BOOLEAN,
  last_visit_date DATE,
  monthly_drops INTEGER,
  onboarding_completed BOOLEAN,
  owner_id UUID,
  role public.user_role,
  streak_days INTEGER,
  terms_privacy_acknowledged_at TIMESTAMPTZ,
  terms_privacy_document_version TEXT,
  total_drops INTEGER,
  updated_at TIMESTAMPTZ,
  username TEXT,
  weekly_drops INTEGER,
  weight_kg NUMERIC,
  is_demo BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.admin_gym_id,
    p.assigned_gym_id,
    p.available_drops,
    p.avatar_url,
    p.created_at,
    p.date_of_birth,
    p.email,
    p.email_verified_at,
    p.expo_push_token,
    p.fitness_goal,
    p.full_name,
    p.gender,
    p.happy_hour_reminder_offset_min,
    p.happy_hour_reminders_enabled,
    p.height_cm,
    p.home_gym_id,
    p.id,
    p.is_newcomer,
    p.last_visit_date,
    p.monthly_drops,
    p.onboarding_completed,
    p.owner_id,
    p.role,
    p.streak_days,
    p.terms_privacy_acknowledged_at,
    p.terms_privacy_document_version,
    p.total_drops,
    p.updated_at,
    p.username,
    p.weekly_drops,
    p.weight_kg,
    COALESCE(p.is_demo, false) AS is_demo
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
