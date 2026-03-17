-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000006_challenge_lifecycle_fixes.sql
-- Description: Challenge lifecycle Phase 1 — nullable end_date, fix existing
--   data, fix reset functions for recurring challenges, handle NULL in
--   update_challenge_progress()
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/challenge_lifecycle_plan.md — Phase 1
--
-- CHANGES:
--   - gym_challenges.end_date: DROP NOT NULL (milestones have no deadline)
--   - Existing milestone challenges: end_date → NULL
--   - Existing daily challenges with short end_date: extended to start + 1 year
--   - Existing weekly challenges with short end_date: extended to start + 1 year
--   - reset_daily_challenges(): also resets COMPLETED rows (recurring re-earn),
--     uses Belgrade timezone
--   - reset_weekly_challenges(): same
--   - update_challenge_progress(): handles NULL end_date, uses Belgrade timezone
--
-- IMPACT ON FRONTEND:
--   - Mobile: Must change query to .or(`end_date.gte.${today},end_date.is.null`)
--   - Admin: Must pass end_date=null when creating milestone challenges
--
-- BREAKING CHANGES:
--   - end_date can now be NULL — any code that does end_date >= X without
--     handling NULL will silently exclude milestones
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- 1a. Make end_date nullable for milestone challenges
-- ============================================================

ALTER TABLE public.gym_challenges
  ALTER COLUMN end_date DROP NOT NULL;

-- ============================================================
-- 1b. Update existing milestone challenges to NULL end_date
-- ============================================================

UPDATE public.gym_challenges
SET end_date = NULL
WHERE challenge_type = 'milestone';

-- ============================================================
-- 1c. Fix daily/weekly challenges with short end_dates
-- ============================================================

-- Daily challenges that expire within 1 day of start → extend to 1 year
UPDATE public.gym_challenges
SET end_date = (start_date::date + INTERVAL '1 year')::date
WHERE challenge_type = 'daily'
  AND end_date IS NOT NULL
  AND end_date <= start_date::date + INTERVAL '1 day';

-- Weekly challenges that expire within 7 days of start → extend to 1 year
UPDATE public.gym_challenges
SET end_date = (start_date::date + INTERVAL '1 year')::date
WHERE challenge_type = 'weekly'
  AND end_date IS NOT NULL
  AND end_date <= start_date::date + INTERVAL '7 days';

-- ============================================================
-- 1d. Fix reset_daily_challenges() — reset COMPLETED rows too
--     (recurring challenges: users re-earn each cycle)
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_daily_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_reset_count INTEGER := 0;
  v_today DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  FOR v_challenge IN
    SELECT id, gym_id, name
    FROM gym_challenges
    WHERE is_active = true
      AND challenge_type = 'daily'
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)
  LOOP
    UPDATE challenge_progress
    SET
      current_value      = 0,
      current_drops      = 0,
      is_completed       = false,
      completed_at       = NULL,
      drops_awarded      = false,
      tier_achieved      = NULL,
      last_activity_date = NULL,
      updated_at         = NOW()
    WHERE
      challenge_id = v_challenge.id;

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    RAISE LOG
      'reset_daily_challenges: reset % rows for challenge % (%)',
      v_reset_count,
      v_challenge.id,
      v_challenge.name;
  END LOOP;
END;
$$;

-- ============================================================
-- 1e. Fix reset_weekly_challenges() — same recurring fix
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_weekly_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_reset_count INTEGER := 0;
  v_today DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  FOR v_challenge IN
    SELECT id, gym_id, name
    FROM gym_challenges
    WHERE is_active = true
      AND (
        challenge_type = 'weekly'
        OR scoring_model = 'days_visited'
      )
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)
  LOOP
    UPDATE challenge_progress
    SET
      current_value       = 0,
      current_drops       = 0,
      is_completed        = false,
      completed_at        = NULL,
      drops_awarded       = false,
      tier_achieved       = NULL,
      last_activity_date  = NULL,
      updated_at          = NOW()
    WHERE
      challenge_id = v_challenge.id;

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    RAISE LOG
      'reset_weekly_challenges: reset % rows for challenge % (%)',
      v_reset_count,
      v_challenge.id,
      v_challenge.name;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reset_daily_challenges IS
  'Resets daily challenges at midnight Belgrade time (23:00 UTC). '
  'Resets ALL progress rows (including completed — recurring re-earn). '
  'Clears: current_value, current_drops, is_completed, completed_at, '
  'drops_awarded, tier_achieved, last_activity_date. '
  'Does NOT reset: current_streak_days. '
  'Scheduled via pg_cron: 0 23 * * *';

COMMENT ON FUNCTION public.reset_weekly_challenges IS
  'Resets weekly challenges on Sunday at midnight Belgrade time (23:00 UTC). '
  'Resets ALL progress rows (including completed — recurring re-earn). '
  'Clears: current_value, current_drops, is_completed, completed_at, '
  'drops_awarded, tier_achieved, last_activity_date. '
  'Does NOT reset: current_streak_days. '
  'Scheduled via pg_cron: 0 23 * * 0';

-- ============================================================
-- 1f. Fix update_challenge_progress() — handle NULL end_date,
--     use Belgrade timezone
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id    UUID,
  p_gym_id     UUID,
  p_drops      INTEGER,
  p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_challenge  RECORD;
  v_progress   RECORD;
  v_new_value  NUMERIC;
  v_new_streak INTEGER;
  v_tier       JSONB;
  v_tier_name  TEXT;
  v_tier_drops INTEGER;
  v_tier_rank  INTEGER;
  v_prev_rank  INTEGER;
  v_today      DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id
      AND is_active = true
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)
  LOOP
    INSERT INTO public.challenge_progress
      (challenge_id, user_id, gym_id, current_drops, current_value)
    VALUES
      (v_challenge.id, p_user_id, p_gym_id, 0, 0)
    ON CONFLICT (user_id, challenge_id) DO NOTHING;

    SELECT * INTO v_progress
    FROM public.challenge_progress
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.challenge_progress
        (challenge_id, user_id, gym_id, current_drops, current_value)
      VALUES
        (v_challenge.id, p_user_id, p_gym_id, 0, 0)
      ON CONFLICT (user_id, challenge_id) DO NOTHING
      RETURNING * INTO v_progress;

      IF NOT FOUND THEN
        RAISE WARNING 'Failed to create challenge_progress for challenge_id=%, user_id=%', v_challenge.id, p_user_id;
        CONTINUE;
      END IF;
    END IF;

    v_new_value := COALESCE(v_progress.current_value, 0);
    v_new_streak := NULL;

    CASE COALESCE(v_challenge.scoring_model, 'total_drops')
      WHEN 'total_drops' THEN
        v_new_value := v_new_value + p_drops;
      WHEN 'distance_km' THEN
        v_new_value := v_new_value + COALESCE(
          (SELECT (raw_metrics->>'total_distance')::NUMERIC / 1000.0
           FROM public.sessions WHERE id = p_session_id),
          0
        );
      WHEN 'days_visited' THEN
        v_new_value := (
          SELECT COUNT(DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade'))
          FROM public.sessions
          WHERE user_id = p_user_id
            AND gym_id = p_gym_id
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') <= COALESCE(v_challenge.end_date, v_today)
            AND drops_earned > 0
        );
      WHEN 'streak_days' THEN
        SELECT COALESCE(streak_days, 0) INTO v_new_streak
        FROM public.profiles
        WHERE id = p_user_id;
        v_new_value := v_new_streak;
      ELSE
        v_new_value := v_new_value + p_drops;
    END CASE;

    UPDATE public.challenge_progress
    SET current_value = v_new_value,
        current_drops = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'total_drops'
          THEN (current_drops + p_drops)
          ELSE current_drops
        END,
        current_streak_days = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days'
          THEN COALESCE(v_new_streak, current_streak_days, 0)
          ELSE current_streak_days
        END,
        updated_at = NOW()
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id;

    IF v_challenge.tiers IS NULL
      AND NOT v_progress.is_completed
    THEN
      DECLARE
        v_progress_value NUMERIC;
      BEGIN
        IF COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days' THEN
          v_progress_value := COALESCE(v_new_streak, v_progress.current_streak_days, 0);
        ELSE
          v_progress_value := v_new_value;
        END IF;

        IF v_progress_value >= v_challenge.target_drops THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW()
          WHERE challenge_id = v_challenge.id
            AND user_id = p_user_id;

          INSERT INTO public.user_badges
            (user_id, gym_challenge_id, earned_at)
          VALUES
            (p_user_id, v_challenge.id, NOW())
          ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
          DO NOTHING;

          IF NOT v_progress.drops_awarded AND v_challenge.reward_drops > 0 THEN
            UPDATE public.challenge_progress
            SET drops_awarded = true
            WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

            UPDATE public.profiles
            SET total_drops     = total_drops + v_challenge.reward_drops,
                available_drops = available_drops + v_challenge.reward_drops,
                weekly_drops    = weekly_drops + v_challenge.reward_drops,
                monthly_drops   = monthly_drops + v_challenge.reward_drops
            WHERE id = p_user_id;

            UPDATE public.gym_memberships
            SET local_drops_balance = local_drops_balance + v_challenge.reward_drops
            WHERE user_id = p_user_id AND gym_id = p_gym_id;

            INSERT INTO public.drops_transactions
              (user_id, gym_id, amount, transaction_type, reference_id, description)
            VALUES
              (p_user_id, p_gym_id, v_challenge.reward_drops, 'challenge',
               v_challenge.id, 'Challenge complete: ' || v_challenge.name);
          END IF;
        END IF;
      END;
    END IF;

    IF v_challenge.tiers IS NOT NULL AND NOT COALESCE(v_progress.drops_awarded, false) THEN
      v_prev_rank := CASE COALESCE(v_progress.tier_achieved, '')
        WHEN 'gold'   THEN 3
        WHEN 'silver' THEN 2
        WHEN 'bronze' THEN 1
        ELSE 0
      END;

      FOR v_tier IN
        SELECT value FROM jsonb_array_elements(v_challenge.tiers) AS value
        ORDER BY (value->>'target')::NUMERIC ASC
      LOOP
        v_tier_name  := lower(v_tier->>'label');
        v_tier_drops := COALESCE((v_tier->>'drops')::INTEGER, 0);
        v_tier_rank  := CASE v_tier_name
          WHEN 'gold'   THEN 3
          WHEN 'silver' THEN 2
          WHEN 'bronze' THEN 1
          ELSE 0
        END;

        DECLARE
          v_tier_progress_value NUMERIC;
        BEGIN
          IF COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days' THEN
            v_tier_progress_value := COALESCE(v_new_streak, v_progress.current_streak_days, 0);
          ELSE
            v_tier_progress_value := v_new_value;
          END IF;

          IF v_tier_progress_value >= (v_tier->>'target')::NUMERIC
            AND v_tier_rank > v_prev_rank
          THEN
            UPDATE public.challenge_progress
            SET tier_achieved = v_tier_name
            WHERE challenge_id = v_challenge.id
              AND user_id = p_user_id;

            IF v_tier_drops > 0 THEN
              UPDATE public.profiles
              SET total_drops     = total_drops + v_tier_drops,
                  available_drops = available_drops + v_tier_drops,
                  weekly_drops    = weekly_drops + v_tier_drops,
                  monthly_drops   = monthly_drops + v_tier_drops
              WHERE id = p_user_id;

              UPDATE public.gym_memberships
              SET local_drops_balance = local_drops_balance + v_tier_drops
              WHERE user_id = p_user_id AND gym_id = p_gym_id;

              INSERT INTO public.drops_transactions
                (user_id, gym_id, amount, transaction_type, reference_id, description)
              VALUES
                (p_user_id, p_gym_id, v_tier_drops, 'challenge',
                 v_challenge.id, v_tier_name || ' tier: ' || v_challenge.name);
            END IF;

            v_prev_rank := v_tier_rank;
          END IF;
        END;
      END LOOP;

      IF v_prev_rank >= 3 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true, is_completed = true, completed_at = NOW()
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

        INSERT INTO public.user_badges
          (user_id, gym_challenge_id, earned_at)
        VALUES
          (p_user_id, v_challenge.id, NOW())
        ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
        DO NOTHING;
      END IF;
    END IF;

  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, UUID) IS
  'Updates challenge progress for all active challenges in a gym after a session. '
  'Handles scoring models: total_drops, distance_km, days_visited, streak_days. '
  'Handles NULL end_date (milestones). Uses Europe/Belgrade timezone. '
  'Awards badges and drops when challenges are completed.';
