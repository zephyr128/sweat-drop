-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000002_checkin_system_with_gps.sql
-- Description: Reception check-in system with GPS validation
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/master_execution_plan.md — Phase 1, Migration B
--
-- CHANGES:
--   - gyms: added checkin_drops, lat, lng, gps_radius_m columns
--   - challenge_type ENUM: added 'checkin_streak', 'checkin_count' values
--   - gym_checkins table with GPS audit columns
--   - haversine_distance_m() helper function
--   - perform_checkin(gym_id, lat, lng) RPC with GPS validation
--   - update_checkin_challenge_progress() RPC
--   - get_checkin_status() RPC
--
-- IMPACT ON FRONTEND:
--   - Mobile: Scanner can call perform_checkin(), new checkin-result screen
--   - Admin: Gym settings gets checkin_drops + GPS fields, check-in stats table
--
-- BREAKING CHANGES: None (additive)
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- 1. Add checkin_drops + GPS columns to gyms
-- ============================================================

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS checkin_drops INTEGER NOT NULL DEFAULT 20
    CHECK (checkin_drops >= 0 AND checkin_drops <= 500),
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS gps_radius_m INTEGER NOT NULL DEFAULT 200
    CHECK (gps_radius_m BETWEEN 50 AND 1000);

COMMENT ON COLUMN public.gyms.checkin_drops IS
  'Drops awarded per reception QR check-in. 0 = check-in disabled.';
COMMENT ON COLUMN public.gyms.lat IS
  'Latitude. Populated via geocoding when gym address is saved.';
COMMENT ON COLUMN public.gyms.lng IS
  'Longitude.';
COMMENT ON COLUMN public.gyms.gps_radius_m IS
  'Check-in allowed radius in meters. Default 200m. Increase for basements/malls.';

-- ============================================================
-- 2. Extend challenge_type ENUM with check-in types
-- ============================================================

ALTER TYPE public.challenge_type ADD VALUE IF NOT EXISTS 'checkin_streak';
ALTER TYPE public.challenge_type ADD VALUE IF NOT EXISTS 'checkin_count';

-- ============================================================
-- 3. Create gym_checkins table (with GPS audit columns)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gym_checkins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id         UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drops_earned   INTEGER NOT NULL DEFAULT 0,
  gps_verified   BOOLEAN NOT NULL DEFAULT false,
  gps_distance_m INTEGER,
  gps_lat        NUMERIC(10, 7),
  gps_lng        NUMERIC(10, 7),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_checkins_daily
  ON public.gym_checkins (user_id, gym_id,
    DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade'));
CREATE INDEX IF NOT EXISTS idx_gym_checkins_user
  ON public.gym_checkins (user_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_gym_checkins_gym
  ON public.gym_checkins (gym_id, checked_in_at DESC);

COMMENT ON TABLE public.gym_checkins IS
  'Reception QR check-ins. One per user per gym per day. GPS audit trail included.';

ALTER TABLE public.gym_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkins"
  ON public.gym_checkins FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Gym staff can view gym checkins"
  ON public.gym_checkins FOR SELECT
  USING (
    gym_id IN (SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.user_id = auth.uid() AND gs.gym_id = gym_checkins.gym_id
    )
  );

CREATE POLICY "Superadmin can view all checkins"
  ON public.gym_checkins FOR SELECT
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "No direct insert"
  ON public.gym_checkins FOR INSERT
  WITH CHECK (false);

-- ============================================================
-- 4. Helper: Haversine distance in meters
-- ============================================================

CREATE OR REPLACE FUNCTION public.haversine_distance_m(
  lat1 NUMERIC, lng1 NUMERIC,
  lat2 NUMERIC, lng2 NUMERIC
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    6371000 * 2 * ASIN(
      SQRT(
        POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
        COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
        POWER(SIN(RADIANS(lng2 - lng1) / 2), 2)
      )
    )
  )::INTEGER;
$$;

COMMENT ON FUNCTION public.haversine_distance_m(NUMERIC, NUMERIC, NUMERIC, NUMERIC) IS
  'Returns approximate great-circle distance in meters between two lat/lng points.';

-- ============================================================
-- 5. RPC: perform_checkin (with GPS validation)
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

  -- GPS validation (only when both user and gym have coordinates)
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

  -- Daily uniqueness check
  SELECT EXISTS (
    SELECT 1 FROM public.gym_checkins
    WHERE user_id = v_user_id AND gym_id = p_gym_id
      AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = CURRENT_DATE
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_checked_in',
      'gym_name', v_gym_name, 'checkin_drops', v_drops);
  END IF;

  -- Insert check-in with GPS audit data
  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_user_id, p_gym_id, v_drops, v_gps_verified, v_distance_m, p_lat, p_lng)
  RETURNING id INTO v_checkin_id;

  -- Streak calculation (guard against double-count with award_drops)
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

  -- Update streak ONLY if not already visited today
  IF v_last_visit IS NULL OR v_last_visit != CURRENT_DATE THEN
    IF v_last_visit = CURRENT_DATE - 1
       OR EXISTS (
         SELECT 1 FROM public.sessions
         WHERE user_id = v_user_id AND is_active = false
           AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') = CURRENT_DATE - 1
       )
    THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;

    UPDATE public.profiles
    SET streak_days = v_streak,
        last_visit_date = CURRENT_DATE
    WHERE id = v_user_id;
  END IF;

  -- Update gym membership local balance
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_drops,
      updated_at = NOW()
  WHERE user_id = v_user_id AND gym_id = p_gym_id;

  -- Create membership if first visit
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
  'validates GPS if coordinates provided. Returns success/error JSONB.';

-- ============================================================
-- 6. RPC: update_checkin_challenge_progress
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
  v_today     DATE := CURRENT_DATE;
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

COMMENT ON FUNCTION public.update_checkin_challenge_progress(UUID, UUID) IS
  'Updates challenge_progress for checkin_streak and checkin_count challenges. '
  'Called by perform_checkin() and implicit check-in in award_drops().';

-- ============================================================
-- 7. RPC: get_checkin_status
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
        AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = CURRENT_DATE
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

COMMENT ON FUNCTION public.get_checkin_status(UUID) IS
  'Returns current check-in status for a gym: already_checked_in, checkin_drops, gym_name, total_checkins.';
