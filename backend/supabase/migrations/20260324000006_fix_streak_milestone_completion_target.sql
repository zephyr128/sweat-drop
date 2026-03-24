-- ═══════════════════════════════════════════════════════════
-- Migration: 20260324000006_fix_streak_milestone_completion_target.sql
-- Description: Fix update_challenge_progress() using target_drops=0 as
--   completion threshold for streak and milestone challenges. The actual
--   target for streak challenges is in streak_days, and for milestones
--   in milestone_threshold. Also reverses incorrect completions.
--
-- ROOT CAUSE: The completion check was:
--   IF v_progress_value >= v_challenge.target_drops THEN ...
--   For streak challenges target_drops=0 → 1 >= 0 → completed on first workout
--   For milestones target_drops=0 → 1 >= 0 → completed on first workout
--
-- FIX: Resolve the correct target based on scoring model:
--   streak_days  → COALESCE(streak_days, target_drops)
--   target_drops=0 + milestone_threshold > 0 → milestone_threshold
--   otherwise → target_drops
-- ═══════════════════════════════════════════════════════════


-- ============================================================
-- 1. Fix the function
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

    -- Resolve the correct completion target based on challenge configuration
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

    -- Non-tiered completion check
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

    -- Tiered completion check
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


-- ============================================================
-- 2. Reverse incorrect completions
-- ============================================================

DO $$
DECLARE
  v_gym_id UUID := '4074dffe-6df8-4070-b560-5be794977bff';
  rec RECORD;
BEGIN
  -- Find all incorrectly completed challenge_progress where target_drops=0
  -- and the user hasn't actually met the real target
  FOR rec IN
    SELECT
      cp.user_id,
      cp.challenge_id,
      gc.name AS challenge_name,
      gc.reward_drops,
      gc.scoring_model,
      gc.streak_days,
      gc.milestone_threshold,
      cp.current_value
    FROM public.challenge_progress cp
    JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
    WHERE gc.target_drops = 0
      AND cp.is_completed = true
      AND cp.drops_awarded = true
      AND gc.reward_drops > 0
      AND (
        -- Streak: current streak < required streak days
        (gc.scoring_model = 'streak_days'
         AND COALESCE(cp.current_streak_days, cp.current_value::INT, 0) < COALESCE(gc.streak_days, 0))
        OR
        -- Milestone: current value < milestone threshold
        (gc.milestone_threshold IS NOT NULL AND gc.milestone_threshold > 0
         AND cp.current_value < gc.milestone_threshold)
      )
  LOOP
    RAISE NOTICE 'Reversing: user=%, challenge=%, reward_drops=%',
      rec.user_id, rec.challenge_name, rec.reward_drops;

    -- Reset challenge progress
    UPDATE public.challenge_progress
    SET is_completed = false,
        completed_at = NULL,
        drops_awarded = false
    WHERE challenge_id = rec.challenge_id
      AND user_id = rec.user_id;

    -- Remove incorrect badge
    DELETE FROM public.user_badges
    WHERE user_id = rec.user_id
      AND gym_challenge_id = rec.challenge_id;

    -- Claw back drops from profiles
    UPDATE public.profiles
    SET total_drops     = GREATEST(0, total_drops - rec.reward_drops),
        available_drops = GREATEST(0, available_drops - rec.reward_drops),
        weekly_drops    = GREATEST(0, weekly_drops - rec.reward_drops),
        monthly_drops   = GREATEST(0, monthly_drops - rec.reward_drops),
        updated_at      = NOW()
    WHERE id = rec.user_id;

    -- Claw back from gym membership
    UPDATE public.gym_memberships
    SET local_drops_balance = GREATEST(0, local_drops_balance - rec.reward_drops),
        updated_at = NOW()
    WHERE user_id = rec.user_id
      AND gym_id = v_gym_id;

    -- Record the clawback in the ledger
    INSERT INTO public.drops_transactions
      (user_id, gym_id, amount, transaction_type, reference_id, description)
    VALUES
      (rec.user_id, v_gym_id, -rec.reward_drops, 'challenge',
       rec.challenge_id,
       'Correction: premature completion reversed for ' || rec.challenge_name);
  END LOOP;
END;
$$;
