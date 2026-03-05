-- Migration: 20260305000001_fix_gym_leaderboard_and_user_badges.sql
-- Description: Fix gym leaderboard to use gym-specific weekly/monthly drops,
--              and add gym_id to get_user_badges for reliable client filtering.
-- 
-- AGENT NOTE: [2026-03-05] - mobile-coder (backend fix required)
-- 
-- CHANGES:
-- 1. get_leaderboard('gym', ...): Weekly/monthly now sum drops from sessions
--    table filtered by gym_id, instead of using global profiles.weekly_drops
-- 2. get_user_badges(): Added gym_id to return value so client can filter
--    badges by specific gym without relying on gym_name string matching
-- 
-- ROOT CAUSE:
-- - Leaderboard: profiles.weekly_drops and profiles.monthly_drops are GLOBAL
--   totals across all gyms. When a user switches to a new gym, the leaderboard
--   showed their global drops (e.g. 608) instead of gym-specific drops (e.g. 1).
-- - Trophy Room: Without gym_id in user_badges, the client filtered by gym_name
--   string which is fragile and the orphan merge showed badges from all gyms.
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Leaderboard will now show correct per-gym weekly/monthly drops
-- - Mobile App: TrophyRoom can now filter badges by gym_id
-- 
-- BREAKING CHANGES: None (additive change to get_user_badges return)
-- 
-- IDEMPOTENT: Uses CREATE OR REPLACE

-- ============================================================
-- 1. FIX get_leaderboard() - Gym-specific weekly/monthly drops
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
    -- Unknown type, return empty
    RETURN;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) IS
  'Generic leaderboard RPC. Supports gym, global, challenge, and arena types. '
  'GYM type: weekly/monthly now computed from sessions table per-gym (not global profile drops). '
  'Returns pre-formatted score_label — frontend never needs to format scores.';

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;


-- ============================================================
-- 2. ADD gym_id to get_user_badges() return
-- ============================================================

DROP FUNCTION IF EXISTS public.get_user_badges(UUID);

CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS TABLE (
  badge_id UUID,
  badge_name TEXT,
  badge_description TEXT,
  badge_image_url TEXT,
  earned_at TIMESTAMPTZ,
  badge_type TEXT,
  gym_name TEXT,
  gym_id UUID          -- NEW: gym_id for reliable client-side filtering
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ub.id as badge_id,
    COALESCE(ga.name, gc.name) as badge_name,
    COALESCE(ga.description, gc.description) as badge_description,
    COALESCE(ga.badge_image_url, gc.badge_image_url) as badge_image_url,
    ub.earned_at,
    CASE 
      WHEN ub.global_achievement_id IS NOT NULL THEN 'global' 
      ELSE 'gym' 
    END as badge_type,
    g.name as gym_name,
    gc.gym_id as gym_id    -- NEW
  FROM public.user_badges ub
  LEFT JOIN public.global_achievements ga ON ub.global_achievement_id = ga.id
  LEFT JOIN public.gym_challenges gc ON ub.gym_challenge_id = gc.id
  LEFT JOIN public.gyms g ON gc.gym_id = g.id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.earned_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_badges(UUID) IS
  'Returns all badges earned by a user, including both global achievements and gym challenges. '
  'Supports polymorphic references. Returns badge_type, gym_name, and gym_id for filtering. '
  'Sorted by earned_at DESC (most recent first).';

GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO authenticated;
