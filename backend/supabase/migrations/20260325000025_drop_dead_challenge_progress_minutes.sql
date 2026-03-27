-- Migration: 20260325000025_drop_dead_challenge_progress_minutes.sql
-- Description: Drop update_challenge_progress_minutes — legacy function that
--              references dropped add_drops() and non-existent 'challenges' table.
--              No app code or DB function calls it.

DROP FUNCTION IF EXISTS public.update_challenge_progress_minutes(UUID, UUID, INTEGER, TEXT);
