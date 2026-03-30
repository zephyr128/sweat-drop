-- Migration: 20260330000001_pre_production_dead_feature_cleanup.sql
-- Description: Pre-production cleanup — drop dead SmartCoach/Programs tables,
--   deprecated tables, orphan columns, and unused functions.
--
-- TABLES DROPPED (13):
--   SmartCoach / Programs stack (never shipped, feature-gated off):
--     - day_template_items (FK child of workout_day_templates)
--     - workout_day_templates
--     - program_items (FK child of program_days)
--     - program_days (FK child of workout_programs)
--     - user_active_programs (FK child of workout_programs)
--     - workout_programs
--     - plan_session_history
--     - workout_plan_progress
--     - smartcoach_user_progress
--     - live_sessions
--     - equipment
--   Deprecated / superseded:
--     - user_challenge_progress (replaced by challenge_progress)
--     - user_progress (created but never wired in app)
--
-- COLUMNS DROPPED (1):
--     - sessions.equipment_id (FK to equipment, all 402 rows NULL)
--
-- FUNCTIONS DROPPED (3):
--     - process_smartcoach_progress
--     - get_plan_item_for_machine
--     - load_day_template_into_program
--
-- KEPT (intentionally):
--     - workout_plans, workout_plan_items, active_subscriptions (used by mobile + admin)
--     - gyms.smartcoach_enabled (feature flag, referenced in mobile + admin)
--     - drop_limits (config table, may still be read)
--
-- ROLLBACK: These tables had only dev/test data (0-75 rows).
--   Re-run original creation migrations to restore if needed.

-- ═══════════════════════════════════════════════════════════════
-- 1. Drop FK constraint from sessions → equipment FIRST
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_equipment_id_fkey;
ALTER TABLE public.sessions DROP COLUMN IF EXISTS equipment_id;

-- ═══════════════════════════════════════════════════════════════
-- 2. Drop functions that reference these tables
-- ═══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.process_smartcoach_progress(
  uuid, uuid, uuid, uuid, integer, numeric, numeric, numeric,
  integer, numeric, numeric
);
DROP FUNCTION IF EXISTS public.get_plan_item_for_machine(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.load_day_template_into_program(uuid, uuid, integer);

-- ═══════════════════════════════════════════════════════════════
-- 3. Drop child tables first (FK ordering), then parents
-- ═══════════════════════════════════════════════════════════════

-- Children of workout_day_templates
DROP TABLE IF EXISTS public.day_template_items CASCADE;

-- workout_day_templates (references coach_profiles which doesn't exist)
DROP TABLE IF EXISTS public.workout_day_templates CASCADE;

-- Children of workout_programs
DROP TABLE IF EXISTS public.program_items CASCADE;
DROP TABLE IF EXISTS public.program_days CASCADE;
DROP TABLE IF EXISTS public.user_active_programs CASCADE;

-- workout_programs (references coach_profiles which doesn't exist)
DROP TABLE IF EXISTS public.workout_programs CASCADE;

-- Standalone SmartCoach tables
DROP TABLE IF EXISTS public.plan_session_history CASCADE;
DROP TABLE IF EXISTS public.workout_plan_progress CASCADE;
DROP TABLE IF EXISTS public.smartcoach_user_progress CASCADE;
DROP TABLE IF EXISTS public.live_sessions CASCADE;
DROP TABLE IF EXISTS public.equipment CASCADE;

-- Deprecated / superseded
DROP TABLE IF EXISTS public.user_challenge_progress CASCADE;
DROP TABLE IF EXISTS public.user_progress CASCADE;
