-- Migration: 20260407000001_freeze_completed_challenge_progress.sql
-- Description: Stop recalculating progress for already-completed challenges.
--   Both update_challenge_progress and update_checkin_challenge_progress were
--   overwriting current_value / current_streak_days and bumping updated_at on
--   every workout even after is_completed = true.  This caused two user-visible
--   bugs:
--     1) Streak-based challenge shows wrong "X/Y" after completion (Item #8)
--     2) "Completed on" date shows today instead of the real date (Item #9)
--
-- AGENT NOTE: [2026-04-07] - supabase-dba
-- Reference: docs/plans/mobile_fixes_and_improvements_april_2026.md — Items #8, #9
--
-- CHANGES:
--   - update_challenge_progress: CONTINUE when is_completed = true
--   - update_checkin_challenge_progress: CONTINUE when is_completed = true
--   - One-time data repair for completed challenges with under-counted progress
--
-- IMPACT ON FRONTEND:
--   - Mobile: completed challenges will keep frozen progress values and dates
--   - Admin: no changes needed
--
-- BREAKING CHANGES: None

-- ============================================================
-- 1. update_challenge_progress — add CONTINUE guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id    UUID,
  p_gym_id     UUID,
  p_drops      INTEGER,
  p_session_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_challenge  RECORD;
  v_progress   RECORD;
  v_new_value  NUMERIC;
  v_new_streak INTEGER;
  v_target     NUMERIC;
  v_tier       JSONB;
  v_tier_name  TEXT;
  v_tier_drops INTEGER;
  v_tier_rank  INTEGER;
  v_prev_rank  INTEGER;
  v_today      DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
  v_period_start DATE;
BEGIN
  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id
      AND is_active = true
      AND challenge_type NOT IN ('checkin_streak', 'checkin_count')
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

    -- Freeze: skip recalculation for already-completed challenges
    IF v_progress.is_completed THEN
      CONTINUE;
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
        v_period_start := CASE
          WHEN v_challenge.challenge_type = 'daily' THEN v_today
          WHEN v_challenge.challenge_type = 'weekly' THEN date_trunc('week', v_today::timestamp)::date
          ELSE v_challenge.start_date
        END;

        v_new_value := (
          SELECT COUNT(DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade'))
          FROM public.sessions
          WHERE user_id = p_user_id
            AND gym_id = p_gym_id
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= GREATEST(v_challenge.start_date, v_period_start)
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') <= COALESCE(v_challenge.end_date, v_today)
            AND drops_earned > 0
        );
      WHEN 'streak_days' THEN
        WITH visit_dates AS (
          SELECT DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS vd
          FROM public.sessions
          WHERE user_id = p_user_id
            AND gym_id = p_gym_id
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
            AND is_active = false AND drops_earned > 0
          UNION
          SELECT DISTINCT DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS vd
          FROM public.gym_checkins
          WHERE user_id = p_user_id AND gym_id = p_gym_id
            AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
        ),
        numbered AS (
          SELECT vd, vd - (ROW_NUMBER() OVER (ORDER BY vd))::INT AS grp
          FROM visit_dates
        ),
        streak_groups AS (
          SELECT grp, COUNT(*) AS streak_len, MAX(vd) AS last_date
          FROM numbered
          GROUP BY grp
        )
        SELECT COALESCE(MAX(streak_len), 0) INTO v_new_streak
        FROM streak_groups
        WHERE last_date = v_today;

        v_new_value := COALESCE(v_new_streak, 0);
      ELSE
        v_new_value := v_new_value + p_drops;
    END CASE;

    v_target := CASE
      WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days'
        THEN COALESCE(v_challenge.streak_days, v_challenge.target_drops)
      WHEN v_challenge.target_drops = 0 AND v_challenge.milestone_threshold IS NOT NULL AND v_challenge.milestone_threshold > 0
        THEN v_challenge.milestone_threshold
      ELSE v_challenge.target_drops
    END;

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

        IF v_progress_value >= v_target THEN
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
$function$;

COMMENT ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, UUID) IS
  'Updates challenge progress for active gym challenges after a session. '
  'Skips already-completed challenges to freeze their progress and timestamps. '
  'days_visited is windowed by challenge cycle for daily/weekly challenges. '
  'Uses Europe/Belgrade timezone and excludes check-in challenge types.';

-- ============================================================
-- 2. update_checkin_challenge_progress — add CONTINUE guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_checkin_challenge_progress(
  p_user_id UUID, p_gym_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge    RECORD;
  v_streak       INTEGER;
  v_count        INTEGER;
  v_target       INTEGER;
  v_current      INTEGER;
  v_was_complete BOOLEAN;
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id AND is_active = true
      AND challenge_type IN ('checkin_streak', 'checkin_count')
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)
  LOOP
    SELECT COALESCE(is_completed, false) INTO v_was_complete
    FROM public.challenge_progress
    WHERE user_id = p_user_id AND challenge_id = v_challenge.id;

    -- Freeze: skip recalculation for already-completed challenges
    IF v_was_complete THEN
      CONTINUE;
    END IF;

    IF v_challenge.challenge_type = 'checkin_streak' THEN
      WITH visit_dates AS (
        SELECT DISTINCT DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS vd
        FROM public.gym_checkins
        WHERE user_id = p_user_id AND gym_id = p_gym_id
          AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
        UNION
        SELECT DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS vd
        FROM public.sessions
        WHERE user_id = p_user_id AND gym_id = p_gym_id
          AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
          AND is_active = false AND drops_earned > 0
      ),
      numbered AS (
        SELECT vd, vd - (ROW_NUMBER() OVER (ORDER BY vd))::INT AS grp
        FROM visit_dates
      ),
      streak_groups AS (
        SELECT grp, COUNT(*) AS streak_len, MAX(vd) AS last_date
        FROM numbered
        GROUP BY grp
      )
      SELECT COALESCE(MAX(streak_len), 0) INTO v_streak
      FROM streak_groups
      WHERE last_date = v_today;

      v_current := v_streak;
      v_target  := v_challenge.streak_days;

      INSERT INTO public.challenge_progress
        (user_id, challenge_id, gym_id, current_value, current_streak_days, updated_at)
      VALUES
        (p_user_id, v_challenge.id, p_gym_id, v_streak, v_streak, NOW())
      ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
        SET current_value       = v_streak,
            current_streak_days = v_streak,
            is_completed = (v_streak >= v_challenge.streak_days),
            completed_at = CASE
              WHEN NOT challenge_progress.is_completed AND v_streak >= v_challenge.streak_days
              THEN NOW()
              ELSE challenge_progress.completed_at
            END,
            updated_at = NOW();

    ELSIF v_challenge.challenge_type = 'checkin_count' THEN
      SELECT COUNT(*) INTO v_count FROM public.gym_checkins
      WHERE user_id = p_user_id AND gym_id = p_gym_id
        AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade')
            BETWEEN v_challenge.start_date AND v_today;

      v_current := v_count;
      v_target  := v_challenge.target_drops;

      INSERT INTO public.challenge_progress
        (user_id, challenge_id, gym_id, current_value, current_drops, updated_at)
      VALUES
        (p_user_id, v_challenge.id, p_gym_id, v_count, v_count, NOW())
      ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
        SET current_value  = v_count,
            current_drops  = v_count,
            is_completed = (v_count >= v_challenge.target_drops),
            completed_at = CASE
              WHEN NOT challenge_progress.is_completed AND v_count >= v_challenge.target_drops
              THEN NOW()
              ELSE challenge_progress.completed_at
            END,
            updated_at = NOW();
    ELSE
      CONTINUE;
    END IF;

    IF NOT COALESCE(v_was_complete, false) AND v_current >= v_target THEN

      INSERT INTO public.user_badges
        (user_id, gym_challenge_id, earned_at)
      VALUES
        (p_user_id, v_challenge.id, NOW())
      ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
      DO NOTHING;

      IF v_challenge.reward_drops > 0 THEN
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
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_checkin_challenge_progress(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.update_checkin_challenge_progress(UUID, UUID) IS
  'Updates challenge_progress for checkin_streak and checkin_count challenges. '
  'Skips already-completed challenges to freeze their progress and timestamps. '
  'Awards badges and reward drops on first completion. '
  'Handles NULL end_date. Uses Europe/Belgrade timezone.';

-- ============================================================
-- 3. Data repair — fix completed challenges with under-counted progress
--    Sets current_value and current_streak_days to the target value
--    for any completed challenge where the progress is less than target.
-- ============================================================

UPDATE public.challenge_progress cp
SET current_value = COALESCE(gc.streak_days, gc.target_drops),
    current_streak_days = CASE
      WHEN COALESCE(gc.scoring_model, 'total_drops') IN ('streak_days', 'checkin_streak')
           OR gc.challenge_type IN ('checkin_streak')
      THEN COALESCE(gc.streak_days, gc.target_drops)
      ELSE cp.current_streak_days
    END
FROM public.gym_challenges gc
WHERE cp.challenge_id = gc.id
  AND cp.is_completed = true
  AND cp.current_value < COALESCE(gc.streak_days, gc.target_drops);
