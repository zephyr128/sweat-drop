-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000005_fix_streak_calculation.sql
-- Description: Fix streak calculation timezone bug, recalculate streaks, revoke invalid badges
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/bugs_and_features_plan.md — B2 Streak Badge Audit
--
-- ROOT CAUSE:
--   award_drops(), perform_checkin(), update_checkin_challenge_progress(), and
--   get_checkin_status() all use CURRENT_DATE which returns the UTC date.
--   Serbia is UTC+1 (UTC+2 DST). Late-night workouts (after midnight Belgrade time)
--   get the wrong date → streaks inflate or miss increments → false streak badges.
--
-- FIXES:
--   1. Replace all CURRENT_DATE with (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE
--   2. Recalculate all user streak_days from actual session + check-in data
--   3. Revoke streak badges awarded to users whose max historical streak
--      never actually reached the badge criteria
--
-- IMPACT ON FRONTEND:
--   - Mobile: Streaks now accurately reflect Belgrade-timezone days
--   - Admin: Some users may lose incorrectly awarded streak badges
--
-- BREAKING CHANGES: None (behavioral fix only)
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- 1. Fix award_drops() — use Belgrade timezone for streak
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_drops(
  p_session_id UUID
)
RETURNS TABLE(
  drops_earned  INTEGER,
  multiplier    NUMERIC,
  badges_earned TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session      RECORD;
  v_profile      RECORD;
  v_base_drops   INTEGER;
  v_multiplier   NUMERIC := 1.0;
  v_final_drops  INTEGER;
  v_balance_after INTEGER;
  v_new_streak   INTEGER;
  v_badges       TEXT[] := ARRAY[]::TEXT[];
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  -- 1. LOCK SESSION ROW
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- 2. IDEMPOTENCY
  IF v_session.drops_earned > 0 THEN
    RETURN QUERY SELECT
      v_session.drops_earned::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- 3. GET PROFILE
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

  -- 4. SERVER-SIDE DROPS CALCULATION
  v_base_drops := GREATEST(1, ROUND(
    COALESCE(
      v_session.calories,
      (v_session.duration_seconds / 60.0) * 7.0
    ) * 2.5
  ));

  -- 5. STREAK CALCULATION (Belgrade timezone)
  v_new_streak := CASE
    WHEN v_profile.last_visit_date IS NULL THEN 1
    WHEN v_profile.last_visit_date = v_today THEN
      v_profile.streak_days
    WHEN v_profile.last_visit_date = v_today - 1 THEN
      v_profile.streak_days + 1
    ELSE 1
  END;

  -- 6. STREAK MULTIPLIER
  v_multiplier := CASE
    WHEN v_new_streak >= 14 THEN 2.0
    WHEN v_new_streak >= 7  THEN 1.5
    WHEN v_new_streak >= 3  THEN 1.2
    ELSE 1.0
  END;

  -- 7. FINAL DROPS
  v_final_drops := GREATEST(1, ROUND(v_base_drops * v_multiplier));

  -- 8. UPDATE SESSION
  UPDATE public.sessions
  SET drops_earned    = v_final_drops,
      multiplier      = v_multiplier,
      ended_at        = COALESCE(ended_at, NOW()),
      is_active       = false,
      updated_at      = NOW()
  WHERE id = p_session_id;

  -- 9. UPDATE PROFILE BALANCES (Belgrade date for last_visit_date)
  UPDATE public.profiles
  SET total_drops     = total_drops + v_final_drops,
      available_drops = available_drops + v_final_drops,
      weekly_drops    = weekly_drops + v_final_drops,
      monthly_drops   = monthly_drops + v_final_drops,
      last_visit_date = v_today,
      streak_days     = v_new_streak,
      updated_at      = NOW()
  WHERE id = v_session.user_id;

  -- 10. UPDATE GYM MEMBERSHIP LOCAL BALANCE
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_final_drops,
      updated_at          = NOW()
  WHERE user_id = v_session.user_id
    AND gym_id  = v_session.gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_session.user_id, v_session.gym_id, v_final_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + v_final_drops;
  END IF;

  -- 11. GET BALANCE SNAPSHOT
  SELECT available_drops INTO v_balance_after
  FROM public.profiles
  WHERE id = v_session.user_id;

  -- 12. APPEND TO DROPS LEDGER
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type,
     reference_id, balance_after, expires_at, description)
  VALUES
    (v_session.user_id, v_session.gym_id,
     v_final_drops, 'session',
     p_session_id, v_balance_after,
     NOW() + INTERVAL '90 days',
     'Workout session — ' || v_final_drops || ' drops (×' || v_multiplier || ')');

  -- 13. UPDATE CHALLENGE PROGRESS
  PERFORM public.update_challenge_progress(
    v_session.user_id,
    v_session.gym_id,
    v_final_drops,
    p_session_id
  );

  -- 13b. UPDATE ARENA SCORES
  PERFORM public.update_arena_scores(
    v_session.user_id,
    v_session.gym_id,
    v_final_drops
  );

  -- 14. EVALUATE BADGES
  SELECT COALESCE(array_agg(bn.badge_name), ARRAY[]::TEXT[])
  INTO v_badges
  FROM public.evaluate_badges(v_session.user_id, p_session_id) AS bn(badge_name);

  -- 15. IMPLICIT CHECK-IN
  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_session.user_id, v_session.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);

  -- 16. RETURN
  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$$;

COMMENT ON FUNCTION public.award_drops(UUID) IS
  'Server-side drops calculation and distribution. Idempotent — safe to call multiple times. '
  'Calculates: base_drops = calories × 2.5 × streak_multiplier. '
  'Updates: profiles, gym_memberships, drops_transactions, challenge_progress, arena_scores, badges. '
  'Also inserts implicit gym check-in (drops=0, gps=false). '
  'Uses Europe/Belgrade timezone for streak date calculations.';

-- ============================================================
-- 2. Fix perform_checkin() — use Belgrade timezone throughout
-- ============================================================

CREATE OR REPLACE FUNCTION public.perform_checkin(
  p_gym_id UUID,
  p_lat    NUMERIC DEFAULT NULL,
  p_lng    NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_drops        INTEGER;
  v_gym_name     TEXT;
  v_suspended    BOOLEAN;
  v_already      BOOLEAN;
  v_checkin_id   UUID;
  v_streak       INTEGER;
  v_last_visit   DATE;
  v_gym_lat      NUMERIC;
  v_gym_lng      NUMERIC;
  v_radius_m     INTEGER;
  v_distance_m   INTEGER := NULL;
  v_gps_verified BOOLEAN := false;
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT name, is_suspended, checkin_drops, lat, lng, gps_radius_m
  INTO v_gym_name, v_suspended, v_drops, v_gym_lat, v_gym_lng, v_radius_m
  FROM public.gyms WHERE id = p_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'gym_not_found');
  END IF;
  IF v_suspended THEN
    RETURN jsonb_build_object('success', false, 'error', 'gym_suspended');
  END IF;
  IF v_drops = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'checkin_disabled');
  END IF;

  -- GPS validation
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    IF v_gym_lat IS NOT NULL AND v_gym_lng IS NOT NULL THEN
      v_distance_m := haversine_distance_m(p_lat, p_lng, v_gym_lat, v_gym_lng);
      IF v_distance_m <= v_radius_m THEN
        v_gps_verified := true;
      ELSE
        RETURN jsonb_build_object(
          'success', false, 'error', 'too_far',
          'distance_m', v_distance_m, 'radius_m', v_radius_m
        );
      END IF;
    END IF;
  END IF;

  -- Daily uniqueness check (Belgrade timezone)
  SELECT EXISTS (
    SELECT 1 FROM public.gym_checkins
    WHERE user_id = v_user_id AND gym_id = p_gym_id
      AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = v_today
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_checked_in',
      'gym_name', v_gym_name, 'checkin_drops', v_drops);
  END IF;

  -- Insert check-in
  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_user_id, p_gym_id, v_drops, v_gps_verified, v_distance_m, p_lat, p_lng)
  RETURNING id INTO v_checkin_id;

  -- Streak calculation (Belgrade timezone, guard against double-count with award_drops)
  SELECT streak_days, last_visit_date
  INTO v_streak, v_last_visit
  FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  -- Award drops
  UPDATE public.profiles
  SET total_drops     = total_drops + v_drops,
      available_drops = available_drops + v_drops,
      weekly_drops    = weekly_drops + v_drops,
      monthly_drops   = monthly_drops + v_drops,
      updated_at      = NOW()
  WHERE id = v_user_id;

  -- Update streak ONLY if not already visited today (Belgrade date)
  IF v_last_visit IS NULL OR v_last_visit != v_today THEN
    IF v_last_visit = v_today - 1
       OR EXISTS (
         SELECT 1 FROM public.sessions
         WHERE user_id = v_user_id AND is_active = false
           AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') = v_today - 1
       )
    THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;

    UPDATE public.profiles
    SET streak_days = v_streak,
        last_visit_date = v_today
    WHERE id = v_user_id;
  END IF;

  -- Update gym membership local balance
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_drops,
      updated_at = NOW()
  WHERE user_id = v_user_id AND gym_id = p_gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_user_id, p_gym_id, v_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + v_drops;
  END IF;

  -- Drops transaction ledger
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, description)
  VALUES
    (v_user_id, p_gym_id, v_drops, 'checkin', 'Reception check-in');

  -- Update check-in challenge progress
  PERFORM public.update_checkin_challenge_progress(v_user_id, p_gym_id);

  RETURN jsonb_build_object(
    'success', true,
    'drops_earned', v_drops,
    'gym_name', v_gym_name,
    'checkin_id', v_checkin_id,
    'streak_days', v_streak,
    'gps_verified', v_gps_verified,
    'distance_m', v_distance_m
  );

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_checked_in',
    'gym_name', v_gym_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_checkin(UUID, NUMERIC, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.perform_checkin(UUID, NUMERIC, NUMERIC) IS
  'Reception check-in via QR scan. Awards checkin_drops, updates streak (guarded vs award_drops), '
  'validates GPS if coordinates provided. Uses Europe/Belgrade timezone for dates. Returns JSONB.';

-- ============================================================
-- 3. Fix update_checkin_challenge_progress() — Belgrade timezone
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_checkin_challenge_progress(
  p_user_id UUID, p_gym_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_streak    INTEGER;
  v_count     INTEGER;
  v_today     DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  SELECT streak_days INTO v_streak FROM public.profiles WHERE id = p_user_id;

  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id AND is_active = true
      AND challenge_type IN ('checkin_streak', 'checkin_count')
      AND start_date <= v_today AND end_date >= v_today
  LOOP
    IF v_challenge.challenge_type = 'checkin_streak' THEN
      INSERT INTO public.challenge_progress
        (user_id, challenge_id, gym_id, current_streak_days, updated_at)
      VALUES
        (p_user_id, v_challenge.id, p_gym_id, v_streak, NOW())
      ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
        SET current_streak_days = v_streak,
            is_completed = (v_streak >= v_challenge.streak_days),
            updated_at = NOW();

    ELSIF v_challenge.challenge_type = 'checkin_count' THEN
      SELECT COUNT(*) INTO v_count FROM public.gym_checkins
      WHERE user_id = p_user_id AND gym_id = p_gym_id
        AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade')
            BETWEEN v_challenge.start_date AND v_today;

      INSERT INTO public.challenge_progress
        (user_id, challenge_id, gym_id, current_drops, updated_at)
      VALUES
        (p_user_id, v_challenge.id, p_gym_id, v_count, NOW())
      ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
        SET current_drops = v_count,
            is_completed = (v_count >= v_challenge.target_drops),
            updated_at = NOW();
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_checkin_challenge_progress(UUID, UUID) TO authenticated;

-- ============================================================
-- 4. Fix get_checkin_status() — Belgrade timezone
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_checkin_status(p_gym_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'already_checked_in', EXISTS (
      SELECT 1 FROM public.gym_checkins
      WHERE user_id = auth.uid() AND gym_id = p_gym_id
        AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade')
            = (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE
    ),
    'checkin_drops', g.checkin_drops,
    'gym_name', g.name,
    'total_checkins', (
      SELECT COUNT(*) FROM public.gym_checkins
      WHERE user_id = auth.uid() AND gym_id = p_gym_id
    )
  ) FROM public.gyms g WHERE g.id = p_gym_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_checkin_status(UUID) TO authenticated;

-- ============================================================
-- 5. Recalculate ALL user streaks from actual visit data
-- ============================================================

DO $$
DECLARE
  v_user    RECORD;
  v_streak  INTEGER;
  v_last    DATE;
BEGIN
  FOR v_user IN
    WITH visit_dates AS (
      SELECT user_id, DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS visit_date
      FROM public.sessions
      WHERE is_active = false AND drops_earned > 0
      UNION
      SELECT user_id, DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS visit_date
      FROM public.gym_checkins
    ),
    unique_visits AS (
      SELECT DISTINCT user_id, visit_date
      FROM visit_dates
    ),
    numbered AS (
      SELECT user_id, visit_date,
        visit_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date))::INT AS grp
      FROM unique_visits
    ),
    streak_groups AS (
      SELECT user_id, grp, COUNT(*) AS streak_len, MAX(visit_date) AS last_date
      FROM numbered
      GROUP BY user_id, grp
    ),
    latest_streak AS (
      SELECT DISTINCT ON (user_id)
        user_id, streak_len, last_date
      FROM streak_groups
      ORDER BY user_id, last_date DESC
    )
    SELECT * FROM latest_streak
  LOOP
    UPDATE public.profiles
    SET streak_days     = v_user.streak_len,
        last_visit_date = v_user.last_date
    WHERE id = v_user.user_id;
  END LOOP;

  -- Users with NO visits: reset to 0
  UPDATE public.profiles
  SET streak_days = 0, last_visit_date = NULL
  WHERE id NOT IN (
    SELECT DISTINCT user_id FROM public.sessions WHERE is_active = false AND drops_earned > 0
    UNION
    SELECT DISTINCT user_id FROM public.gym_checkins
  )
  AND (streak_days > 0 OR last_visit_date IS NOT NULL);

  RAISE NOTICE 'Streak recalculation complete';
END;
$$;

-- ============================================================
-- 6. Revoke streak badges that were never legitimately earned
-- ============================================================

DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH visit_dates AS (
    SELECT user_id, DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS visit_date
    FROM public.sessions
    WHERE is_active = false AND drops_earned > 0
    UNION
    SELECT user_id, DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS visit_date
    FROM public.gym_checkins
  ),
  unique_visits AS (
    SELECT DISTINCT user_id, visit_date
    FROM visit_dates
  ),
  numbered AS (
    SELECT user_id, visit_date,
      visit_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date))::INT AS grp
    FROM unique_visits
  ),
  max_streaks AS (
    SELECT user_id, MAX(streak_len) AS max_streak
    FROM (
      SELECT user_id, grp, COUNT(*) AS streak_len
      FROM numbered
      GROUP BY user_id, grp
    ) sub
    GROUP BY user_id
  )
  DELETE FROM public.user_badges ub
  USING public.global_achievements ga
  WHERE ub.global_achievement_id = ga.id
    AND ga.criteria->>'type' = 'streak_days'
    AND NOT EXISTS (
      SELECT 1 FROM max_streaks ms
      WHERE ms.user_id = ub.user_id
        AND ms.max_streak >= (ga.criteria->>'value')::INTEGER
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Revoked % incorrectly awarded streak badges', v_deleted;
END;
$$;
