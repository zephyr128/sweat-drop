-- Migration: 20260302000010_phase1_fix_leaderboard_rpcs.sql
-- Description: Phase 1 — Fixes leaderboard RPCs to actually use period columns + newcomer filter
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 1, Tasks 1.5-1.6)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- PREVIOUS PROBLEM:
-- get_local_leaderboard() and get_global_leaderboard() accept p_period parameter
-- but always return all-time data. The period parameter was "reserved for future."
--
-- THIS FIX:
-- - weekly → ORDER BY profiles.weekly_drops
-- - monthly → ORDER BY profiles.monthly_drops
-- - all_time → ORDER BY gym_memberships.local_drops_balance (local) or profiles.total_drops (global)
-- - p_newcomer_only → filter to is_newcomer = true (Q5: separate tab)
--
-- INTERFACE CONTRACT:
-- get_local_leaderboard(p_gym_id, p_period TEXT, p_limit, p_newcomer_only)
-- → RETURNS TABLE(user_id, username, avatar_url, drops, rank, is_newcomer, streak_days)
--
-- BREAKING CHANGE: Return type expanded (added avatar_url, is_newcomer, streak_days).
-- Parameter type changed from leaderboard_period ENUM to TEXT.
-- Old function signatures are dropped and recreated.

-- Drop old functions (different signatures)
DROP FUNCTION IF EXISTS public.get_local_leaderboard(UUID, leaderboard_period, INTEGER);
DROP FUNCTION IF EXISTS public.get_local_leaderboard(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.get_local_leaderboard(UUID, TEXT, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_local_leaderboard(
  p_gym_id        UUID,
  p_period        TEXT DEFAULT 'weekly',
  p_limit         INTEGER DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  user_id     UUID,
  username    TEXT,
  avatar_url  TEXT,
  drops       INTEGER,
  rank        BIGINT,
  is_newcomer BOOLEAN,
  streak_days INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username::TEXT,
    p.avatar_url::TEXT,
    (CASE p_period
      WHEN 'weekly'   THEN p.weekly_drops
      WHEN 'monthly'  THEN p.monthly_drops
      ELSE gm.local_drops_balance
    END)::INTEGER AS drops,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE p_period
          WHEN 'weekly'  THEN p.weekly_drops
          WHEN 'monthly' THEN p.monthly_drops
          ELSE gm.local_drops_balance
        END DESC,
        p.username ASC
    ) AS rank,
    p.is_newcomer,
    p.streak_days
  FROM public.profiles p
  JOIN public.gym_memberships gm
    ON gm.user_id = p.id AND gm.gym_id = p_gym_id
  WHERE p.role = 'user'
    AND (p_newcomer_only = false OR p.is_newcomer = true)
    AND (CASE p_period
      WHEN 'weekly'  THEN p.weekly_drops
      WHEN 'monthly' THEN p.monthly_drops
      ELSE gm.local_drops_balance
    END) > 0
  ORDER BY drops DESC, p.username ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_local_leaderboard(UUID, TEXT, INTEGER, BOOLEAN) IS
  'Returns gym-scoped leaderboard ranked by period. '
  'weekly → profiles.weekly_drops, monthly → profiles.monthly_drops, all_time → local_drops_balance. '
  'p_newcomer_only = true → separate newcomer tab (Q5).';

GRANT EXECUTE ON FUNCTION public.get_local_leaderboard(UUID, TEXT, INTEGER, BOOLEAN) TO authenticated;


-- ============================================================
-- get_global_leaderboard — Fixed
-- ============================================================

DROP FUNCTION IF EXISTS public.get_global_leaderboard(leaderboard_period, INTEGER);
DROP FUNCTION IF EXISTS public.get_global_leaderboard(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.get_global_leaderboard(TEXT, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_global_leaderboard(
  p_period        TEXT DEFAULT 'weekly',
  p_limit         INTEGER DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  user_id     UUID,
  username    TEXT,
  avatar_url  TEXT,
  drops       INTEGER,
  rank        BIGINT,
  is_newcomer BOOLEAN,
  streak_days INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username::TEXT,
    p.avatar_url::TEXT,
    (CASE p_period
      WHEN 'weekly'  THEN p.weekly_drops
      WHEN 'monthly' THEN p.monthly_drops
      ELSE p.total_drops
    END)::INTEGER AS drops,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE p_period
          WHEN 'weekly'  THEN p.weekly_drops
          WHEN 'monthly' THEN p.monthly_drops
          ELSE p.total_drops
        END DESC,
        p.username ASC
    ) AS rank,
    p.is_newcomer,
    p.streak_days
  FROM public.profiles p
  WHERE p.role = 'user'
    AND (p_newcomer_only = false OR p.is_newcomer = true)
    AND (CASE p_period
      WHEN 'weekly'  THEN p.weekly_drops
      WHEN 'monthly' THEN p.monthly_drops
      ELSE p.total_drops
    END) > 0
  ORDER BY drops DESC, p.username ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_global_leaderboard(TEXT, INTEGER, BOOLEAN) IS
  'Returns global leaderboard ranked by period. '
  'weekly → profiles.weekly_drops, monthly → profiles.monthly_drops, all_time → profiles.total_drops. '
  'p_newcomer_only = true → separate newcomer ranking (Q5).';

GRANT EXECUTE ON FUNCTION public.get_global_leaderboard(TEXT, INTEGER, BOOLEAN) TO authenticated;
