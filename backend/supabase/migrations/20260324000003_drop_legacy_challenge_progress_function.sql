-- ═══════════════════════════════════════════════════════════
-- Migration: 20260324000003_drop_legacy_challenge_progress_function.sql
-- Description: Drop the legacy update_challenge_progress overload that
--   references the non-existent public.challenges table.
--
-- The OLD function signature: (uuid, uuid, integer, date DEFAULT CURRENT_DATE)
--   queries public.challenges — a table that was replaced by gym_challenges.
--   It is never called (award_drops dispatches to the uuid-param overload)
--   but its existence is confusing and would error if invoked.
--
-- The CURRENT function: (uuid, uuid, integer, uuid) — retained.
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.update_challenge_progress(uuid, uuid, integer, date);
