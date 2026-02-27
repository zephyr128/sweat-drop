-- Create Get User Badges RPC Functions Migration
-- Creates RPC functions for retrieving user badges and badge statistics

-- Function to get all badges earned by a user
CREATE OR REPLACE FUNCTION public.get_user_badges(
  p_user_id UUID
)
RETURNS TABLE(
  badge_id UUID,
  challenge_id UUID,
  challenge_name TEXT,
  badge_image_url TEXT,
  earned_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ub.id AS badge_id,
    ub.challenge_id,
    c.name AS challenge_name,
    c.badge_image_url,
    ub.earned_at
  FROM public.user_badges ub
  INNER JOIN public.challenges c ON ub.challenge_id = c.id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.earned_at DESC; -- Most recent badges first
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get badge statistics for a challenge (for admin panel)
CREATE OR REPLACE FUNCTION public.get_badge_statistics(
  p_challenge_id UUID
)
RETURNS TABLE(
  total_earned INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_earned
  FROM public.user_badges
  WHERE challenge_id = p_challenge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_badge_statistics(UUID) TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.get_user_badges IS 'Returns all badges earned by a user, including challenge name and badge image URL. Sorted by earned_at DESC (most recent first).';
COMMENT ON FUNCTION public.get_badge_statistics IS 'Returns the total number of users who have earned a badge for a specific challenge. Used for admin panel statistics.';
