-- Leaderboard RPC Functions Migration
-- Creates optimized RPC functions for local and global leaderboards
-- This replaces direct table queries with optimized functions for better performance

-- Function to get local leaderboard (per gym)
-- Returns ranked users by local_drops_balance for a specific gym
CREATE OR REPLACE FUNCTION public.get_local_leaderboard(
  p_gym_id UUID,
  p_period leaderboard_period DEFAULT 'monthly',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  drops INTEGER,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_users AS (
    SELECT
      gm.user_id,
      p.username,
      gm.local_drops_balance AS drops,
      ROW_NUMBER() OVER (ORDER BY gm.local_drops_balance DESC, p.username ASC) AS rank
    FROM public.gym_memberships gm
    INNER JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.gym_id = p_gym_id
    ORDER BY gm.local_drops_balance DESC, p.username ASC
    LIMIT p_limit
  )
  SELECT
    ru.user_id,
    ru.username,
    ru.drops,
    ru.rank
  FROM ranked_users ru
  ORDER BY ru.rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get global leaderboard (all users)
-- Returns ranked users by total_drops across all gyms
CREATE OR REPLACE FUNCTION public.get_global_leaderboard(
  p_period leaderboard_period DEFAULT 'monthly',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  drops INTEGER,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_users AS (
    SELECT
      p.id AS user_id,
      p.username,
      p.total_drops AS drops,
      ROW_NUMBER() OVER (ORDER BY p.total_drops DESC, p.username ASC) AS rank
    FROM public.profiles p
    WHERE p.total_drops > 0
    ORDER BY p.total_drops DESC, p.username ASC
    LIMIT p_limit
  )
  SELECT
    ru.user_id,
    ru.username,
    ru.drops,
    ru.rank
  FROM ranked_users ru
  ORDER BY ru.rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON FUNCTION public.get_local_leaderboard IS 'Returns ranked leaderboard for a specific gym based on local_drops_balance. Period parameter is reserved for future filtering (currently returns all-time).';
COMMENT ON FUNCTION public.get_global_leaderboard IS 'Returns ranked global leaderboard based on total_drops. Period parameter is reserved for future filtering (currently returns all-time).';
