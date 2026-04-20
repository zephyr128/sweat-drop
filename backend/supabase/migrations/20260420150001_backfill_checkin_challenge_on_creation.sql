-- Migration: 20260420150000_backfill_checkin_challenge_on_creation.sql
-- Description: Two-part fix for the "challenge created after today's check-in"
--   problem.
--
-- AGENT NOTE: [2026-04-20] - supabase-dba
--
-- ROOT CAUSE:
--   When an admin creates a checkin_streak/checkin_count challenge with
--   start_date = TODAY, any user who checked in earlier that day gets no
--   challenge_progress row — because update_checkin_challenge_progress was
--   called during their check-in (before the challenge existed) and is never
--   called again unless they check in again.
--   Result: challenge shows 100% progress on mobile (via isChallengeEffectivelyCompleted
--   defensive check) but is_completed = false and completed_at = NULL because
--   there is no progress row at all (get_my_challenges LEFT JOIN returns NULLs).
--
-- FIX:
--   Part 1 — One-time data backfill: for each active checkin_streak/checkin_count
--     challenge, call update_checkin_challenge_progress for every user who has
--     a check-in within the challenge's active period but has NO progress row yet
--     OR has an incomplete progress row that should be complete.
--
--   Part 2 — Trigger: whenever a new gym_challenge of type checkin_streak or
--     checkin_count is inserted (or activated), automatically backfill progress
--     for all gym members who already have qualifying check-ins.
--
-- IMPACT ON FRONTEND:
--   - Mobile: checkin_streak/checkin_count challenges will now immediately show
--     correct progress (and is_completed = true) for users with prior check-ins.
--   - Admin Panel: No change.
--
-- BREAKING CHANGES: None

-- ============================================================
-- Part 1: One-time data backfill
--   For every active checkin_streak/checkin_count challenge, iterate all
--   users who have a check-in in the challenge's gym within the active period
--   and call update_checkin_challenge_progress for them.
-- ============================================================

DO $$
DECLARE
  v_challenge RECORD;
  v_user_id   UUID;
  v_today     DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  FOR v_challenge IN
    SELECT id, gym_id, challenge_type, start_date, end_date, streak_days, target_drops
    FROM public.gym_challenges
    WHERE is_active = true
      AND challenge_type IN ('checkin_streak', 'checkin_count')
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)
  LOOP
    -- Find all users with a check-in in this gym during the challenge period
    -- who either have no progress row or have an incomplete one
    FOR v_user_id IN
      SELECT DISTINCT gc.user_id
      FROM public.gym_checkins gc
      WHERE gc.gym_id = v_challenge.gym_id
        AND DATE(gc.checked_in_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
        AND DATE(gc.checked_in_at AT TIME ZONE 'Europe/Belgrade') <= COALESCE(v_challenge.end_date, v_today)
      -- Only process users without a completed progress row
      AND NOT EXISTS (
        SELECT 1 FROM public.challenge_progress cp
        WHERE cp.challenge_id = v_challenge.id
          AND cp.user_id = gc.user_id
          AND cp.is_completed = true
      )
    LOOP
      PERFORM public.update_checkin_challenge_progress(v_user_id, v_challenge.gym_id);
    END LOOP;

    RAISE NOTICE 'Backfilled challenge % (%)', v_challenge.id, v_challenge.challenge_type;
  END LOOP;
END;
$$;

-- ============================================================
-- Part 2: Trigger — backfill on new challenge INSERT or activation
--   Fires AFTER INSERT or after UPDATE that flips is_active to true.
--   Calls update_checkin_challenge_progress for all users who already
--   have qualifying check-ins.
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_checkin_challenge_on_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_today   DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  -- Only act on checkin_streak / checkin_count challenges that are now active
  IF NEW.challenge_type NOT IN ('checkin_streak', 'checkin_count') THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE(NEW.is_active, false) THEN
    RETURN NEW;
  END IF;
  -- On UPDATE, only act when is_active just flipped to true
  IF TG_OP = 'UPDATE' AND (OLD.is_active = true) THEN
    RETURN NEW;
  END IF;
  -- Only backfill if start_date is today or in the past
  IF NEW.start_date > v_today THEN
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT gc.user_id
    FROM public.gym_checkins gc
    WHERE gc.gym_id = NEW.gym_id
      AND DATE(gc.checked_in_at AT TIME ZONE 'Europe/Belgrade') >= NEW.start_date
      AND DATE(gc.checked_in_at AT TIME ZONE 'Europe/Belgrade') <= COALESCE(NEW.end_date, v_today)
  LOOP
    PERFORM public.update_checkin_challenge_progress(v_user_id, NEW.gym_id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_checkin_challenge ON public.gym_challenges;

CREATE TRIGGER trg_backfill_checkin_challenge
  AFTER INSERT OR UPDATE OF is_active ON public.gym_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_checkin_challenge_on_create();

COMMENT ON FUNCTION public.backfill_checkin_challenge_on_create() IS
  'Triggered after a new checkin_streak/checkin_count challenge is created or activated. '
  'Backfills challenge_progress for all gym members who already have qualifying check-ins '
  'within the challenge period. Prevents the "created after check-in" gap.';
