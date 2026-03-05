-- Migration: 20260305200001_fix_arena_leaderboard_score_filter.sql
-- Description: Fix arena leaderboard regression — remove current_score > 0 filter
-- 
-- AGENT NOTE: [2026-03-05] - supabase-dba
-- 
-- ROOT CAUSE:
-- The 20260305100001 migration re-introduced `AND ap.current_score > 0` in the
-- arena case of get_leaderboard(). This was previously fixed by 20260304100001.
-- Result: Arena leaderboard shows "no leaderboard data" despite having 3 participants,
-- because their current_score is 0 (newly opted in, or scores not yet updated).
--
-- ALSO FIXES:
-- - Arena scores may be 0 because update_arena_scores() only updates total_drops
--   and streak_days models in real-time. For days_visited and variety_score, the 
--   cron job (update_arena_scores_periodic) is responsible. Even for total_drops,
--   participants who opted in AFTER earning drops would have 0 until their next session.
--   Showing 0-score participants ensures the leaderboard is always populated.
-- 
-- CHANGES:
-- - Removed `AND ap.current_score > 0` filter from arena WHEN clause
-- - All other leaderboard types (gym, global, challenge) remain unchanged
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Arena leaderboard now shows all opted-in participants, including those
--   who haven't earned any score yet (displayed as "0 💧" etc.)
-- 
-- BREAKING CHANGES: None
-- IDEMPOTENT: Uses CREATE OR REPLACE

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
    JOIN public.gym_memberships gm ON gm.user_id = p.id AND gm.gym_id = p_scope_id
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly' THEN COALESCE((
          SELECT SUM(s.drops_earned)
          FROM public.sessions s
          WHERE s.user_id = p.id
            AND s.gym_id = p_scope_id
            AND s.started_at >= date_trunc('week', NOW())
        ), 0)
        WHEN 'monthly' THEN COALESCE((
          SELECT SUM(s.drops_earned)
          FROM public.sessions s
          WHERE s.user_id = p.id
            AND s.gym_id = p_scope_id
            AND s.started_at >= date_trunc('month', NOW())
        ), 0)
        ELSE gm.local_drops_balance
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
    -- NOTE: Show ALL opted-in participants (no current_score > 0 filter).
    -- Arena participants who just joined should be visible on the leaderboard
    -- even before they earn any score. Scores are updated by:
    --   - award_drops() → update_arena_scores() for total_drops/streak_days (real-time)
    --   - update_arena_scores_periodic() cron for days_visited/variety_score (every 15 min)
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
    -- NO current_score > 0 filter — show all opted-in participants
    ORDER BY ap.current_score DESC, p.username ASC
    LIMIT p_limit;

  ELSE
    -- Unknown type, return empty
    RETURN;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) IS
  'Generic leaderboard RPC. Supports gym, global, challenge, and arena types. '
  'GYM type: weekly/monthly computed from sessions table per-gym. '
  'ARENA type: shows ALL opted-in participants (no score > 0 filter). '
  'Returns pre-formatted score_label — frontend never needs to format scores.';

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;
