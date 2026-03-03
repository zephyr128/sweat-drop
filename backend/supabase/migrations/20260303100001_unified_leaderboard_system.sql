-- Migration: 20260303100001_unified_leaderboard_system.sql
-- Description: Phase 3.1 — Unified Leaderboard System + Prize Distribution
--
-- AGENT NOTE: [2026-03-03] - supabase-dba
-- Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.1
--
-- CHANGES:
-- - Created generic get_leaderboard() RPC (replaces individual leaderboard RPCs)
-- - Rewrote get_local_leaderboard() and get_global_leaderboard() as thin wrappers
-- - Created leaderboard_snapshots table
-- - Created distribute_leaderboard_prizes() function
-- - Added RLS policies for leaderboard_snapshots
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Switch to get_leaderboard() for all leaderboard queries. Display score_label.
-- - Admin Panel: New leaderboard history page from leaderboard_snapshots.
--
-- BREAKING CHANGES:
-- - None (old RPCs preserved as wrappers)

-- ============================================================
-- TABLE: leaderboard_snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rankings JSONB NOT NULL,
  -- JSONB: [{ "rank": 1, "user_id": "...", "username": "...", "drops": 1234 }, ...]
  prizes_distributed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, period, period_end)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_gym_period
  ON public.leaderboard_snapshots(gym_id, period, period_end DESC);

ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Superadmin: all access
CREATE POLICY "leaderboard_snapshots_superadmin_all"
  ON public.leaderboard_snapshots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Gym admin/owner: own gym only
CREATE POLICY "leaderboard_snapshots_gym_admin_select"
  ON public.leaderboard_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('gym_owner', 'gym_admin')
        AND admin_gym_id = leaderboard_snapshots.gym_id
    )
  );

-- Authenticated users: read own gym
CREATE POLICY "leaderboard_snapshots_user_select"
  ON public.leaderboard_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_memberships
      WHERE user_id = auth.uid()
        AND gym_id = leaderboard_snapshots.gym_id
    )
  );

COMMENT ON TABLE public.leaderboard_snapshots IS
  'Historical leaderboard rankings captured at the end of each weekly/monthly period. '
  'Used for prize distribution and history viewing.';

-- ============================================================
-- FUNCTION: get_leaderboard() — ONE RPC TO RULE THEM ALL
-- ============================================================
-- Replaces get_local_leaderboard() and get_global_leaderboard().
-- Supports: gym, global, challenge, and arena leaderboard types.

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_type          TEXT,      -- 'gym' | 'global' | 'challenge' | 'arena'
  p_scope_id      UUID,      -- gym_id | NULL | challenge_id | arena_id
  p_period        TEXT DEFAULT 'weekly',  -- 'weekly' | 'monthly' | 'all_time'
  p_limit         INT DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  rank            BIGINT,
  user_id         UUID,
  username        TEXT,
  avatar_url      TEXT,
  score           NUMERIC,
  score_label     TEXT,      -- formatted: "1,240 💧" | "14 days" | "7 machines"
  is_newcomer     BOOLEAN,
  streak_days     INT,
  gym_name        TEXT       -- NULL for gym/global boards, populated for arena
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  CASE p_type

  WHEN 'gym' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY sv.score_val DESC, p.username ASC),
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      sv.score_val::NUMERIC,
      TO_CHAR(sv.score_val, 'FM999,999') || ' 💧',
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.profiles p
    JOIN public.gym_memberships gm ON gm.user_id = p.id AND gm.gym_id = p_scope_id
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly'  THEN p.weekly_drops
        WHEN 'monthly' THEN p.monthly_drops
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
      ROW_NUMBER() OVER (ORDER BY sv.score_val DESC, p.username ASC),
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      sv.score_val::NUMERIC,
      TO_CHAR(sv.score_val, 'FM999,999') || ' 💧',
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
      ROW_NUMBER() OVER (ORDER BY cp.current_value DESC, p.username ASC),
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
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC),
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
  'Returns pre-formatted score_label — frontend never needs to format scores. '
  'Replaces get_local_leaderboard() and get_global_leaderboard().';

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;

-- ============================================================
-- BACKWARD COMPATIBILITY: Thin wrappers for old RPCs
-- ============================================================

-- Drop and recreate to update signatures
DROP FUNCTION IF EXISTS public.get_local_leaderboard(UUID, TEXT, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_local_leaderboard(
  p_gym_id UUID,
  p_period TEXT DEFAULT 'weekly',
  p_limit INTEGER DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  drops INTEGER,
  rank BIGINT,
  is_newcomer BOOLEAN,
  streak_days INTEGER
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    lb.user_id,
    lb.username,
    lb.avatar_url,
    lb.score::INTEGER,
    lb.rank,
    lb.is_newcomer,
    lb.streak_days
  FROM public.get_leaderboard('gym', p_gym_id, p_period, p_limit, p_newcomer_only) lb;
$$;

COMMENT ON FUNCTION public.get_local_leaderboard(UUID, TEXT, INTEGER, BOOLEAN) IS
  'Backward-compatible wrapper around get_leaderboard(). '
  'Use get_leaderboard() directly for new code.';

GRANT EXECUTE ON FUNCTION public.get_local_leaderboard(UUID, TEXT, INTEGER, BOOLEAN) TO authenticated;

-- Drop and recreate
DROP FUNCTION IF EXISTS public.get_global_leaderboard(TEXT, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_global_leaderboard(
  p_period TEXT DEFAULT 'weekly',
  p_limit INTEGER DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  drops INTEGER,
  rank BIGINT,
  is_newcomer BOOLEAN,
  streak_days INTEGER
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    lb.user_id,
    lb.username,
    lb.avatar_url,
    lb.score::INTEGER,
    lb.rank,
    lb.is_newcomer,
    lb.streak_days
  FROM public.get_leaderboard('global', NULL, p_period, p_limit, p_newcomer_only) lb;
$$;

COMMENT ON FUNCTION public.get_global_leaderboard(TEXT, INTEGER, BOOLEAN) IS
  'Backward-compatible wrapper around get_leaderboard(). '
  'Use get_leaderboard() directly for new code.';

GRANT EXECUTE ON FUNCTION public.get_global_leaderboard(TEXT, INTEGER, BOOLEAN) TO authenticated;

-- ============================================================
-- FUNCTION: distribute_leaderboard_prizes()
-- ============================================================
-- Called by edge function at period end. Snapshots top 3, matches
-- to leaderboard_rewards, creates redemption entries for winners.

CREATE OR REPLACE FUNCTION public.distribute_leaderboard_prizes(
  p_gym_id UUID,
  p_period TEXT  -- 'weekly' | 'monthly'
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $distribute$
DECLARE
  v_top3        RECORD;
  v_reward      RECORD;
  v_gym_name    TEXT;
  v_rankings    JSONB := '[]'::JSONB;
  v_winners     INTEGER := 0;
  v_period_start DATE;
  v_period_end   DATE;
  v_redemption_id UUID;
BEGIN
  -- Determine period boundaries
  IF p_period = 'weekly' THEN
    -- Current week: Monday to Sunday
    v_period_start := date_trunc('week', CURRENT_DATE)::DATE;
    v_period_end := v_period_start + INTERVAL '6 days';
  ELSIF p_period = 'monthly' THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
    v_period_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  ELSE
    RAISE EXCEPTION 'Invalid period: %. Must be weekly or monthly.', p_period;
  END IF;

  -- Get gym name
  SELECT name INTO v_gym_name FROM public.gyms WHERE id = p_gym_id;

  -- Build rankings JSONB from top results
  FOR v_top3 IN
    SELECT lb.rank, lb.user_id, lb.username, lb.score
    FROM public.get_leaderboard('gym', p_gym_id, p_period, 10, false) lb
    ORDER BY lb.rank ASC
    LIMIT 10
  LOOP
    v_rankings := v_rankings || jsonb_build_object(
      'rank', v_top3.rank,
      'user_id', v_top3.user_id,
      'username', v_top3.username,
      'drops', v_top3.score
    );
  END LOOP;

  -- If no participants, skip
  IF jsonb_array_length(v_rankings) = 0 THEN
    RETURN 0;
  END IF;

  -- Save snapshot
  INSERT INTO public.leaderboard_snapshots
    (gym_id, period, period_start, period_end, rankings, prizes_distributed)
  VALUES
    (p_gym_id, p_period, v_period_start, v_period_end, v_rankings, true)
  ON CONFLICT (gym_id, period, period_end) DO UPDATE
    SET rankings = EXCLUDED.rankings,
        prizes_distributed = true;

  -- Match top positions to leaderboard_rewards and create redemptions
  FOR v_top3 IN
    SELECT lb.rank, lb.user_id, lb.username
    FROM public.get_leaderboard('gym', p_gym_id, p_period, 3, false) lb
    ORDER BY lb.rank ASC
    LIMIT 3
  LOOP
    -- Find matching reward for this rank + period
    SELECT * INTO v_reward
    FROM public.leaderboard_rewards
    WHERE gym_id = p_gym_id
      AND rank_position = v_top3.rank
      AND period::TEXT = p_period
      AND is_active = true;

    IF v_reward IS NOT NULL THEN
      -- Create redemption entry for the winner
      INSERT INTO public.redemptions (
        user_id,
        reward_id,
        gym_id,
        drops_spent,
        status,
        source_type,
        description
      ) VALUES (
        v_top3.user_id,
        NULL,  -- no reward_id for leaderboard prizes
        p_gym_id,
        0,     -- leaderboard prizes cost no drops
        'claimed',
        'leaderboard_prize',
        format('Leaderboard Prize: #%s %s at %s — %s',
          v_top3.rank, initcap(p_period), v_gym_name,
          COALESCE(v_reward.reward_description, v_reward.reward_name))
      )
      RETURNING id INTO v_redemption_id;

      v_winners := v_winners + 1;
    END IF;
  END LOOP;

  RETURN v_winners;
END;
$distribute$;

COMMENT ON FUNCTION public.distribute_leaderboard_prizes(UUID, TEXT) IS
  'Snapshots the current leaderboard for a gym/period, matches top 3 to '
  'configured leaderboard_rewards, and creates redemption entries for winners. '
  'Called by distribute-leaderboard-prizes edge function before period reset.';

GRANT EXECUTE ON FUNCTION public.distribute_leaderboard_prizes(UUID, TEXT) TO service_role;
