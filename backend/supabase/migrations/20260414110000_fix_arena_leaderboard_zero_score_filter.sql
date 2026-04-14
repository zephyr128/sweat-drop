-- Migration: 20260414110000_fix_arena_leaderboard_zero_score_filter.sql
-- Description: Remove AND ap.current_score > 0 filter from get_leaderboard arena WHEN
--              clause so all opted-in participants are shown regardless of score.
--
-- AGENT NOTE: [2026-04-14] - supabase-dba
-- Reference: docs/plans/bugfix_gym_scoped_data_and_leaderboard_polish.md — Bug 4
--
-- ROOT CAUSE:
--   Migration 20260305200001_fix_arena_leaderboard_score_filter.sql (March 5) correctly
--   removed AND ap.current_score > 0 from the arena WHEN clause so all opted-in
--   participants appear on the leaderboard.
--
--   Migration 20260325000018_fix_leaderboard_earned_score_and_expiry_transparency.sql
--   (March 25) recreated get_leaderboard() and silently re-introduced that filter,
--   undoing the March 5 fix.
--
--   Additionally, migration 20260413000002_award_drops_inline_leaderboard_score_update.sql
--   (April 13) moved arena score updates (arena_participants.current_score) to the async
--   pending_session_side_effects cron. This means current_score may legitimately be 0
--   for seconds to minutes after a workout, making the filter even more harmful.
--
-- FIX:
--   Recreate get_leaderboard() identical to 20260325000018 except the arena WHEN clause
--   no longer includes AND ap.current_score > 0.
--   All opted-in arena participants (ap.arena_id = p_scope_id) are shown, ordered by
--   current_score DESC so those with 0 naturally appear at the bottom.
--
-- CHANGES:
--   - Modified function: public.get_leaderboard
--     Removed AND ap.current_score > 0 from arena WHEN clause WHERE condition.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Arena leaderboard now shows all opted-in participants, including
--     those whose score hasn't been updated by the cron yet. Score of 0 appears
--     at the bottom of the ranked list — correct behaviour.
--   - Admin Panel: No change.
--
-- BREAKING CHANGES: None (function signature unchanged).

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
    JOIN public.gym_memberships gm ON gm.user_id = p.id AND gm.gym_id = p_scope_id
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly' THEN
          COALESCE((
            SELECT SUM(s.drops_earned)
            FROM public.sessions s
            WHERE s.user_id = p.id
              AND s.gym_id = p_scope_id
              AND s.started_at >= date_trunc('week', NOW())
          ), 0)
          + COALESCE((
            SELECT SUM(gc.drops_earned)
            FROM public.gym_checkins gc
            WHERE gc.user_id = p.id
              AND gc.gym_id = p_scope_id
              AND gc.checked_in_at >= date_trunc('week', NOW())
          ), 0)
        WHEN 'monthly' THEN
          COALESCE((
            SELECT SUM(s.drops_earned)
            FROM public.sessions s
            WHERE s.user_id = p.id
              AND s.gym_id = p_scope_id
              AND s.started_at >= date_trunc('month', NOW())
          ), 0)
          + COALESCE((
            SELECT SUM(gc.drops_earned)
            FROM public.gym_checkins gc
            WHERE gc.user_id = p.id
              AND gc.gym_id = p_scope_id
              AND gc.checked_in_at >= date_trunc('month', NOW())
          ), 0)
        ELSE
          -- all_time: use earned-only score from drops_transactions
          COALESCE((
            SELECT SUM(dt.amount)
            FROM public.drops_transactions dt
            WHERE dt.user_id = p.id
              AND dt.gym_id = p_scope_id
              AND dt.amount > 0
              AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
          ), 0)
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
      -- No current_score > 0 filter: show all opted-in participants.
      -- Participants whose score hasn't been updated by the async cron yet
      -- (current_score = 0) appear at the bottom of the ranked list.
    ORDER BY ap.current_score DESC, p.username ASC
    LIMIT p_limit;

  ELSE
    RETURN;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) IS
  'Generic leaderboard RPC. Supports gym, global, challenge, and arena types. '
  'Gym all_time uses earned-only score (not wallet balance). '
  'Arena shows all opted-in participants regardless of current_score (score=0 → bottom). '
  'Replaces get_local_leaderboard() and get_global_leaderboard().';

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;
