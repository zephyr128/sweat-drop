-- Migration: 20260330000002_cleanup_remaining_dead_tables.sql
-- Description: Drop remaining SmartCoach tables missed in first pass:
--   coach_profiles, coach_gym_affiliations, completed_exercises

DROP TABLE IF EXISTS public.completed_exercises CASCADE;
DROP TABLE IF EXISTS public.coach_gym_affiliations CASCADE;
DROP TABLE IF EXISTS public.coach_profiles CASCADE;
