-- Migration: 20260425220000_get_user_badges_include_tier_category.sql
-- Description: Extend get_user_badges RPC to return `tier` and `category`
--              so member profile screens can render the same Trophy-Room-style
--              tier rings and category groupings as the user's own Trophy Room.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- CONTEXT:
-- The mobile member profile screen (app/user/[id].tsx) shows a flat grid of
-- badge thumbnails with no tier/category metadata. As a result, global
-- achievements visually blend in with gym badges and the user can't tell
-- them apart. The Trophy Room screen reads tier+category from
-- global_achievements directly and styles BadgeCard accordingly. To get the
-- same visual identity on member profiles (which only see *earned* badges
-- via this RPC), we surface tier/category from the underlying achievement
-- row so the client doesn't need a second fetch + join.
--
-- CHANGES:
-- 1. get_user_badges(): Added `tier` and `category` columns. Both are
--    sourced from global_achievements (gym challenges have no tier/category
--    today and return NULL).
--
-- BREAKING CHANGES: None — additive return columns.
-- IDEMPOTENT: DROP + CREATE pattern keeps re-runs safe.

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
  gym_id UUID,
  tier TEXT,
  category TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ub.id AS badge_id,
    COALESCE(ga.name, gc.name) AS badge_name,
    COALESCE(ga.description, gc.description) AS badge_description,
    COALESCE(ga.badge_image_url, gc.badge_image_url) AS badge_image_url,
    ub.earned_at,
    CASE
      WHEN ub.global_achievement_id IS NOT NULL THEN 'global'
      ELSE 'gym'
    END AS badge_type,
    g.name AS gym_name,
    gc.gym_id AS gym_id,
    ga.tier AS tier,           -- NEW: tier (bronze/silver/gold/platinum/diamond) for global achievements; NULL for gym challenges
    ga.category AS category    -- NEW: category grouping for global achievements; NULL for gym challenges
  FROM public.user_badges ub
  LEFT JOIN public.global_achievements ga ON ub.global_achievement_id = ga.id
  LEFT JOIN public.gym_challenges gc ON ub.gym_challenge_id = gc.id
  LEFT JOIN public.gyms g ON gc.gym_id = g.id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.earned_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_badges(UUID) IS
  'Returns all badges earned by a user, including both global achievements and gym challenges. '
  'Polymorphic via user_badges.global_achievement_id / gym_challenge_id. '
  'Returns badge_type, gym_name, gym_id, tier, and category so the mobile app can render '
  'Trophy-Room-style tier rings and category groupings without a second fetch. '
  'Sorted by earned_at DESC (most recent first).';

GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO authenticated;
