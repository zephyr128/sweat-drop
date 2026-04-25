-- Migration: 20260425240000_backfill_user_badges_from_completed_progress.sql
-- Description: One-shot backfill that materialises a `user_badges` row for
--              every (user, achievement/challenge) pair where the user has
--              already met the win criteria. This restores parity between
--              what the Trophy Room (criteria-aware) and the public
--              profile (rows-only) report — they MUST agree.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- CONTEXT:
-- The mobile Trophy Room counts a badge as "earned" when EITHER a
-- `user_badges` row exists OR the underlying criteria has been met
-- (`useUserProgress` does the criteria evaluation client-side, mirroring
-- `evaluate_badges()`). The public profile screen, by contrast, only
-- counts actual rows from `get_user_badges`. Several historical race
-- conditions in `update_challenge_progress` and `evaluate_badges`
-- (called inline from `award_drops`) left a tail of users in the state
-- "criteria met → row missing", which surfaces as a count mismatch
-- between the two screens (e.g. 22 vs 19 reported on 2026-04-25).
--
-- WHY A BACKFILL:
-- Going forward, `evaluate_badges` and the gym-challenge updaters will
-- continue to insert rows on the live edge. We just need to catch up
-- the existing tail. Both branches use ON CONFLICT DO NOTHING so this
-- is safe to re-run.
--
-- WHAT THIS DOES:
--   1. For every active row in `profiles`, run the existing
--      `evaluate_badges(user_id, NULL)` so any global achievement whose
--      criteria is met but whose row is missing gets inserted (and any
--      reward drops are credited per the function's existing logic).
--   2. Insert rows for every `challenge_progress` entry that is marked
--      complete but has no matching `user_badges` row. Mirrors the
--      INSERT path inside `update_challenge_progress` so the data ends
--      up in the same shape.
--
-- IDEMPOTENT: yes — both branches use ON CONFLICT DO NOTHING and the
-- WHERE clauses are existence-guarded.
-- BREAKING CHANGES: None.
-- RLS: All work runs at migration time as superuser.

-- ------------------------------------------------------------
-- Branch 1: global achievements
-- ------------------------------------------------------------
-- `evaluate_badges` iterates active achievements, skips ones the user
-- already owns, evaluates criteria, and INSERTs new rows + reward drops.
-- It RETURNS TABLE(badge_name TEXT) so we materialise it via a SELECT.
DO $$
DECLARE
  v_user_id UUID;
  v_count   BIGINT;
BEGIN
  FOR v_user_id IN SELECT id FROM public.profiles LOOP
    -- Force evaluation; we don't care about the returned badge names.
    SELECT COUNT(*)
    INTO v_count
    FROM public.evaluate_badges(v_user_id, NULL);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- Branch 2: gym challenges
-- ------------------------------------------------------------
-- Any `challenge_progress` row that's flagged completed should have a
-- corresponding entry in `user_badges` with `gym_challenge_id =
-- challenge_progress.challenge_id`. The partial unique index
-- `idx_user_badges_user_gym_challenge_unique` (user_id, gym_challenge_id)
-- WHERE gym_challenge_id IS NOT NULL keeps this idempotent.
INSERT INTO public.user_badges (user_id, gym_challenge_id, earned_at)
SELECT
  cp.user_id,
  cp.challenge_id,
  COALESCE(cp.completed_at, NOW())
FROM public.challenge_progress cp
WHERE cp.is_completed = true
  AND cp.challenge_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_badges ub
    WHERE ub.user_id = cp.user_id
      AND ub.gym_challenge_id = cp.challenge_id
  )
ON CONFLICT DO NOTHING;
