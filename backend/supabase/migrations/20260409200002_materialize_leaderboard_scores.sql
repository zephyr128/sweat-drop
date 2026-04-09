-- Migration: 20260409200002_materialize_leaderboard_scores.sql
-- Description: Materialized leaderboard scores table + cron refresh.
--              Replaces per-call SUM() aggregation across sessions/checkins/drops_transactions
--              with a pre-computed table refreshed every 5 minutes.
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- get_leaderboard('gym', ...) currently does:
--   SUM(sessions.drops_earned) + SUM(gym_checkins.drops_earned)
--   for EVERY gym member on EVERY call from 6 different mobile screens.
--
-- At 20k users with 200k sessions, this is a full aggregation scan each time.
-- Solution: pre-compute scores into leaderboard_live_scores, refresh via cron.
--
-- CHANGES:
--   - Created leaderboard_live_scores table
--   - Created refresh_leaderboard_live_scores() function
--   - Scheduled cron job every 5 minutes
--   - Rewrote get_leaderboard('gym') branch to read from materialized table
--   - get_leaderboard('global'), ('challenge'), ('arena') unchanged
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Leaderboard data may be up to 5 min stale (acceptable for rankings)
--   - Admin Panel: Same
--
-- BREAKING CHANGES: None (return type of get_leaderboard unchanged)

-- ============================================================
-- 1. Materialized scores table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_live_scores (
  gym_id       UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekly_score NUMERIC NOT NULL DEFAULT 0,
  monthly_score NUMERIC NOT NULL DEFAULT 0,
  alltime_score NUMERIC NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gym_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lb_live_gym_weekly
  ON public.leaderboard_live_scores (gym_id, weekly_score DESC);
CREATE INDEX IF NOT EXISTS idx_lb_live_gym_monthly
  ON public.leaderboard_live_scores (gym_id, monthly_score DESC);
CREATE INDEX IF NOT EXISTS idx_lb_live_gym_alltime
  ON public.leaderboard_live_scores (gym_id, alltime_score DESC);

ALTER TABLE public.leaderboard_live_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leaderboard scores"
  ON public.leaderboard_live_scores FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- 2. Refresh function
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_leaderboard_live_scores()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start TIMESTAMPTZ := date_trunc('week', NOW());
  v_month_start TIMESTAMPTZ := date_trunc('month', NOW());
  v_count INTEGER;
BEGIN
  -- Upsert all scores in one pass per period type
  INSERT INTO public.leaderboard_live_scores (gym_id, user_id, weekly_score, monthly_score, alltime_score, refreshed_at)
  SELECT
    gm.gym_id,
    gm.user_id,
    -- Weekly: sessions + checkins since week start
    COALESCE((
      SELECT SUM(s.drops_earned)
      FROM public.sessions s
      WHERE s.user_id = gm.user_id AND s.gym_id = gm.gym_id
        AND s.started_at >= v_week_start
    ), 0)
    + COALESCE((
      SELECT SUM(gc.drops_earned)
      FROM public.gym_checkins gc
      WHERE gc.user_id = gm.user_id AND gc.gym_id = gm.gym_id
        AND gc.checked_in_at >= v_week_start
    ), 0),
    -- Monthly: sessions + checkins since month start
    COALESCE((
      SELECT SUM(s.drops_earned)
      FROM public.sessions s
      WHERE s.user_id = gm.user_id AND s.gym_id = gm.gym_id
        AND s.started_at >= v_month_start
    ), 0)
    + COALESCE((
      SELECT SUM(gc.drops_earned)
      FROM public.gym_checkins gc
      WHERE gc.user_id = gm.user_id AND gc.gym_id = gm.gym_id
        AND gc.checked_in_at >= v_month_start
    ), 0),
    -- All-time: earned drops from transactions
    COALESCE((
      SELECT SUM(dt.amount)
      FROM public.drops_transactions dt
      WHERE dt.user_id = gm.user_id AND dt.gym_id = gm.gym_id
        AND dt.amount > 0
        AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    ), 0),
    NOW()
  FROM public.gym_memberships gm
  ON CONFLICT (gym_id, user_id) DO UPDATE SET
    weekly_score = EXCLUDED.weekly_score,
    monthly_score = EXCLUDED.monthly_score,
    alltime_score = EXCLUDED.alltime_score,
    refreshed_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Remove stale rows for deleted memberships
  DELETE FROM public.leaderboard_live_scores ls
  WHERE NOT EXISTS (
    SELECT 1 FROM public.gym_memberships gm
    WHERE gm.gym_id = ls.gym_id AND gm.user_id = ls.user_id
  );

  RETURN v_count;
END;
$$;

-- Seed the table on migration apply
SELECT public.refresh_leaderboard_live_scores();

-- ============================================================
-- 3. Schedule cron: every 5 minutes
-- ============================================================
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh-leaderboard-live-scores');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $outer$;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'refresh-leaderboard-live-scores',
      '*/5 * * * *',
      $$SELECT public.refresh_leaderboard_live_scores();$$
    );
    RAISE NOTICE 'pg_cron: refresh-leaderboard-live-scores scheduled every 5 minutes.';
  END IF;
END $outer$;

-- ============================================================
-- 4. Rewrite get_leaderboard to use materialized scores for 'gym' branch
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_type          TEXT,
  p_scope_id      UUID,
  p_period        TEXT DEFAULT 'weekly',
  p_limit         INT DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  rank            BIGINT,
  user_id         UUID,
  username        TEXT,
  avatar_url      TEXT,
  score           NUMERIC,
  score_label     TEXT,
  is_newcomer     BOOLEAN,
  streak_days     INT,
  gym_name        TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_type

  WHEN 'gym' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY sv.score_val DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      sv.score_val::NUMERIC,
      TO_CHAR(sv.score_val, 'FM999,999') || ' 💧'::TEXT,
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.profiles p
    JOIN public.leaderboard_live_scores ls
      ON ls.user_id = p.id AND ls.gym_id = p_scope_id
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly'  THEN ls.weekly_score
        WHEN 'monthly' THEN ls.monthly_score
        ELSE ls.alltime_score
      END AS score_val
    ) sv
    WHERE p.role = 'user'
      AND (NOT p_newcomer_only OR p.is_newcomer = true)
      AND sv.score_val > 0
    ORDER BY sv.score_val DESC, p.username ASC
    LIMIT p_limit;

  WHEN 'global' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY sv.score_val DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      sv.score_val::NUMERIC,
      TO_CHAR(sv.score_val, 'FM999,999') || ' 💧'::TEXT,
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.profiles p
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly'  THEN p.weekly_drops
        WHEN 'monthly' THEN p.monthly_drops
        ELSE p.total_drops
      END AS score_val
    ) sv
    WHERE p.role = 'user'
      AND (NOT p_newcomer_only OR p.is_newcomer = true)
      AND sv.score_val > 0
    ORDER BY sv.score_val DESC, p.username ASC
    LIMIT p_limit;

  WHEN 'challenge' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY cp.current_value DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      cp.current_value::NUMERIC,
      CASE gc.scoring_model
        WHEN 'total_drops'  THEN TO_CHAR(cp.current_value, 'FM999,999') || ' 💧'
        WHEN 'distance_km'  THEN TO_CHAR(cp.current_value, 'FM999,999.0') || ' km'
        WHEN 'days_visited'  THEN cp.current_value::TEXT || ' days'
        WHEN 'streak_days'   THEN '🔥 ' || cp.current_value::TEXT || ' days'
        ELSE cp.current_value::TEXT
      END::TEXT,
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.challenge_progress cp
    JOIN public.profiles p ON p.id = cp.user_id
    JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
    WHERE cp.challenge_id = p_scope_id
      AND cp.current_value > 0
    ORDER BY cp.current_value DESC, p.username ASC
    LIMIT p_limit;

  WHEN 'arena' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      ap.current_score::NUMERIC,
      CASE sa.scoring_model
        WHEN 'total_drops'   THEN TO_CHAR(ap.current_score::INTEGER, 'FM999,999') || ' 💧'
        WHEN 'days_visited'  THEN ap.current_score::INTEGER::TEXT || ' days'
        WHEN 'variety_score' THEN ap.current_score::INTEGER::TEXT || ' machines'
        WHEN 'streak_days'   THEN '🔥 ' || ap.current_score::INTEGER::TEXT || ' days'
        ELSE ap.current_score::TEXT
      END::TEXT,
      p.is_newcomer,
      p.streak_days,
      g.name::TEXT
    FROM public.arena_participants ap
    JOIN public.profiles p ON p.id = ap.user_id
    JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
    LEFT JOIN public.gyms g ON g.id = ap.gym_id
    WHERE ap.arena_id = p_scope_id
      AND ap.current_score > 0
    ORDER BY ap.current_score DESC, p.username ASC
    LIMIT p_limit;

  ELSE
    RETURN;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;
