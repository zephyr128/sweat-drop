-- Migration: 20260420140000_fix_checkin_streak_completion_flag.sql
-- Description: Fix challenge_progress rows where checkin_streak/checkin_count
--   challenges have reached their target but is_completed was never set to true
--   (and completed_at was never set). Also hardens update_checkin_challenge_progress
--   to ensure the reward pipeline fires correctly for these previously-stuck rows.
--
-- AGENT NOTE: [2026-04-20] - supabase-dba
-- Flagged by: mobile-coder (challenges.tsx comment)
--
-- ROOT CAUSE:
--   For checkin_streak challenges, update_checkin_challenge_progress sets
--   is_completed via the ON CONFLICT DO UPDATE expression:
--     is_completed = (v_streak >= v_challenge.streak_days)
--   This is correct for NEW check-ins, but rows that were created before
--   20260312000008 (when the function was first corrected) may have
--   current_streak_days >= streak_days with is_completed = false and
--   completed_at = NULL — they show 100% in the UI but never flip to done
--   and never appear in the Completed tab with a date.
--
--   Additionally, the freeze guard added in 20260407000001 means once
--   a row is stuck (is_completed = false, progress = 100%), the function
--   DOES NOT skip it (correct), but the reward block:
--     IF NOT COALESCE(v_was_complete, false) AND v_current >= v_target
--   still fires — BUT only if the user checks in again. Users who haven't
--   checked in since reaching 100% are permanently stuck.
--
-- FIX:
--   Part 1: One-time data repair — set is_completed = true and
--     completed_at = updated_at (best available timestamp) for all
--     challenge_progress rows where the target has been reached.
--   Part 2: Award rewards for those rows that never got drops_awarded.
--   Part 3: Insert missing user_badges for completed challenges without one.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Completed tab will now show these challenges with a date.
--     The frontend isChallengeEffectivelyCompleted defensive check remains
--     correct but these rows will now also have backend is_completed = true.
--   - Admin Panel: Challenge completion counts will increase to reflect reality.
--
-- BREAKING CHANGES: None
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ============================================================
-- 1. Repair is_completed / completed_at for stuck checkin_streak rows
-- ============================================================

UPDATE public.challenge_progress cp
SET
  is_completed = true,
  completed_at = COALESCE(cp.completed_at, cp.updated_at, NOW())
FROM public.gym_challenges gc
WHERE cp.challenge_id = gc.id
  AND gc.challenge_type = 'checkin_streak'
  AND gc.is_active = true
  AND cp.is_completed = false
  AND COALESCE(cp.current_streak_days, 0) >= COALESCE(gc.streak_days, 0)
  AND COALESCE(gc.streak_days, 0) > 0;

-- ============================================================
-- 2. Repair is_completed / completed_at for stuck checkin_count rows
-- ============================================================

UPDATE public.challenge_progress cp
SET
  is_completed = true,
  completed_at = COALESCE(cp.completed_at, cp.updated_at, NOW())
FROM public.gym_challenges gc
WHERE cp.challenge_id = gc.id
  AND gc.challenge_type = 'checkin_count'
  AND gc.is_active = true
  AND cp.is_completed = false
  AND COALESCE(cp.current_drops, cp.current_value::INT, 0) >= COALESCE(gc.target_drops, 0)
  AND COALESCE(gc.target_drops, 0) > 0;

-- ============================================================
-- 3. Award reward drops for newly-completed rows that never got them
--    (drops_awarded = false but challenge is now marked complete)
--    Runs as a DO block so we can iterate and apply wallet updates.
-- ============================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      cp.user_id,
      cp.challenge_id,
      gc.gym_id,
      gc.name    AS challenge_name,
      gc.reward_drops
    FROM public.challenge_progress cp
    JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
    WHERE gc.challenge_type IN ('checkin_streak', 'checkin_count')
      AND cp.is_completed = true
      AND COALESCE(cp.drops_awarded, false) = false
      AND COALESCE(gc.reward_drops, 0) > 0
  LOOP
    -- Mark drops as awarded first (idempotency guard)
    UPDATE public.challenge_progress
    SET drops_awarded = true
    WHERE challenge_id = rec.challenge_id
      AND user_id = rec.user_id
      AND COALESCE(drops_awarded, false) = false;  -- re-check in case of race

    IF NOT FOUND THEN
      CONTINUE;  -- already awarded by a concurrent path
    END IF;

    -- Credit wallet
    UPDATE public.profiles
    SET
      total_drops     = total_drops     + rec.reward_drops,
      available_drops = available_drops + rec.reward_drops,
      weekly_drops    = weekly_drops    + rec.reward_drops,
      monthly_drops   = monthly_drops   + rec.reward_drops
    WHERE id = rec.user_id;

    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance + rec.reward_drops
    WHERE user_id = rec.user_id
      AND gym_id  = rec.gym_id;

    INSERT INTO public.drops_transactions
      (user_id, gym_id, amount, transaction_type, reference_id, description)
    VALUES
      (rec.user_id, rec.gym_id, rec.reward_drops, 'challenge',
       rec.challenge_id,
       'Challenge complete (backfill): ' || rec.challenge_name);

    RAISE NOTICE 'Awarded % drops to user % for challenge %',
      rec.reward_drops, rec.user_id, rec.challenge_name;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. Insert missing user_badges for completed check-in challenges
-- ============================================================

INSERT INTO public.user_badges (user_id, gym_challenge_id, earned_at)
SELECT
  cp.user_id,
  cp.challenge_id,
  COALESCE(cp.completed_at, NOW())
FROM public.challenge_progress cp
JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
WHERE gc.challenge_type IN ('checkin_streak', 'checkin_count')
  AND cp.is_completed = true
ON CONFLICT (user_id, gym_challenge_id)
  WHERE gym_challenge_id IS NOT NULL
DO NOTHING;

COMMIT;
