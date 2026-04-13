-- Migration: 20260413000016_prizes_rpc_include_arena.sql
-- Description: Extend get_my_leaderboard_prizes to also return arena_prize redemptions
--              so the home screen "You won a prize!" banner covers both leaderboard
--              AND arena prizes.
--
-- CHANGE: WHERE clause filter goes from source_type = 'leaderboard_prize'
--         to source_type IN ('leaderboard_prize', 'arena_prize')

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_prizes(
  p_gym_id UUID DEFAULT NULL,
  p_limit  INT  DEFAULT 20
)
RETURNS TABLE(
  id              UUID,
  gym_id          UUID,
  gym_name        TEXT,
  status          TEXT,
  redemption_code TEXT,
  description     TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  source_type     TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.gym_id,
    g.name AS gym_name,
    r.status,
    r.redemption_code,
    r.description,
    r.expires_at,
    r.created_at,
    r.confirmed_at,
    r.source_type
  FROM public.redemptions r
  LEFT JOIN public.gyms g ON g.id = r.gym_id
  WHERE r.user_id    = auth.uid()
    AND r.source_type IN ('leaderboard_prize', 'arena_prize')
    AND (p_gym_id IS NULL OR r.gym_id = p_gym_id)
  ORDER BY r.created_at DESC
  LIMIT p_limit;
$$;
