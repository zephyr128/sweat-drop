-- Migration: 20260423200000_exclude_demo_users_from_global_and_arena_leaderboards.sql
-- Description: Exclude demo/test accounts from global and arena leaderboards.
--
-- AGENT NOTE: [2026-04-23] - supabase-dba
--
-- CHANGES:
--   - Patched get_leaderboard(): 'global' and 'arena' branches now filter COALESCE(p.is_demo, false) = false
--   - Seeded is_demo = true for all members of SweatDrop test gym (id = e247acc4-1c4b-4610-99c6-48f9964facad)
--   - Added COMMENT ON FUNCTION documenting the demo-exclusion policy
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Demo/test usernames will no longer appear on Global or Arena leaderboards
--   - Admin Panel: No change
--
-- BREAKING CHANGES: None
--
-- NEXT STEPS:
--   1. Update MIGRATION_NOTES.md with a [2026-04-23] entry
--   2. Do NOT regenerate database.types.ts (no schema change)

-- ============================================================
-- 1. Seed is_demo = true for all members of the SweatDrop test gym
-- ============================================================
UPDATE public.profiles
SET is_demo = true, updated_at = NOW()
WHERE id IN (
  SELECT gm.user_id
  FROM public.gym_memberships gm
  WHERE gm.gym_id = 'e247acc4-1c4b-4610-99c6-48f9964facad'
)
AND COALESCE(is_demo, false) = false;

-- ============================================================
-- 2. Patch get_leaderboard() — add is_demo filter on global + arena branches
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
      AND COALESCE(p.is_demo, false) = false
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
      AND COALESCE(p.is_demo, false) = false
    ORDER BY ap.current_score DESC, p.username ASC
    LIMIT p_limit;

  ELSE
    RETURN;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;

-- ============================================================
-- 3. Document the demo-exclusion policy
-- ============================================================
COMMENT ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) IS
  'Global and arena branches exclude profiles.is_demo = true. '
  'Gym and challenge branches are already scope-isolated and do not filter demo flag. '
  'Production: test accounts in SweatDrop Gym (e247acc4-1c4b-4610-99c6-48f9964facad) must have is_demo = true.';
