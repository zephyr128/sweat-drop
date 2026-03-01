-- Migration: 20250128000007_update_get_user_badges_rpc.sql
-- Description: Updates get_user_badges RPC function to support polymorphic references (global achievements + gym challenges)
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Updated get_user_badges() to use gym_challenges instead of challenges
-- - Added support for global_achievements (polymorphic references)
-- - Added badge_type and gym_name fields to return value
-- - Updated get_badge_statistics() to use gym_challenges
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Will receive badge_type and gym_name for filtering
-- - Admin Panel: Will receive badge_type for statistics
-- 
-- BREAKING CHANGES:
-- - Return type changed: added badge_type and gym_name fields
-- - Old function signature is replaced
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Update frontend code to handle new return fields

-- Drop old function
DROP FUNCTION IF EXISTS public.get_user_badges(UUID);

-- Create updated function with polymorphic support
CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS TABLE (
  badge_id UUID,
  badge_name TEXT,
  badge_description TEXT,
  badge_image_url TEXT,
  earned_at TIMESTAMPTZ,
  badge_type TEXT, -- 'global' or 'gym'
  gym_name TEXT -- NULL for global achievements
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
    g.name as gym_name
  FROM public.user_badges ub
  LEFT JOIN public.global_achievements ga ON ub.global_achievement_id = ga.id
  LEFT JOIN public.gym_challenges gc ON ub.gym_challenge_id = gc.id
  LEFT JOIN public.gyms g ON gc.gym_id = g.id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.earned_at DESC;
$$;

-- Update get_badge_statistics function to use gym_challenges
DROP FUNCTION IF EXISTS public.get_badge_statistics(UUID);

CREATE OR REPLACE FUNCTION public.get_badge_statistics(
  p_challenge_id UUID
)
RETURNS TABLE(
  total_earned INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::INTEGER AS total_earned
  FROM public.user_badges
  WHERE gym_challenge_id = p_challenge_id;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_badge_statistics(UUID) TO authenticated;

-- Comments
COMMENT ON FUNCTION public.get_user_badges IS 'Returns all badges earned by a user, including both global achievements and gym challenges. Supports polymorphic references. Returns badge_type and gym_name for filtering. Sorted by earned_at DESC (most recent first).';
COMMENT ON FUNCTION public.get_badge_statistics IS 'Returns the total number of users who have earned a badge for a specific gym challenge. Used for admin panel statistics.';
