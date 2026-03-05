-- Migration: 20260305000003_fix_arena_scores_where_clause.sql
-- Description: Fix update_arena_scores() WHERE clause - should update all arenas user is in, not filter by gym_id
-- 
-- AGENT NOTE: [2026-03-05] - supabase-dba
-- 
-- PROBLEM:
-- update_arena_scores() uses WHERE ag.gym_id = p_gym_id, which requires the arena to have that gym in arena_gyms.
-- But the user might have opted into the arena from a different gym, or the arena might be network-wide.
-- The function should update scores for ALL arenas the user is participating in, regardless of which gym the session was in.
-- 
-- CHANGES:
-- - Remove ag.gym_id = p_gym_id filter from WHERE clause
-- - Update all arenas where user is a participant, regardless of session gym_id
-- - For total_drops: add drops to score (works across all gyms)
-- - For streak_days: update with profile streak (works across all gyms)
-- 
-- IMPACT ON FRONTEND:
-- - Arena scores will now update correctly regardless of which gym the session was in
-- 
-- BREAKING CHANGES:
-- - None (bug fix)

-- ============================================================================
-- FIX: update_arena_scores() - Remove gym_id filter from WHERE clause
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_arena_scores(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_streak INTEGER;
  v_updated_total INTEGER := 0;
  v_updated_streak INTEGER := 0;
BEGIN
  -- Get current streak from profile (once, reuse for all streak_days arenas)
  SELECT COALESCE(streak_days, 0) INTO v_profile_streak
  FROM public.profiles
  WHERE id = p_user_id;

  -- For total_drops: add drops to current_score
  -- FIX: Remove ag.gym_id = p_gym_id filter - update ALL arenas user is in
  UPDATE public.arena_participants ap
  SET current_score = current_score + p_drops,
      updated_at = NOW()
  FROM public.sweat_arenas sa
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'total_drops';
  
  GET DIAGNOSTICS v_updated_total = ROW_COUNT;
  
  -- For streak_days: update with current profile streak
  -- FIX: Remove ag.gym_id = p_gym_id filter - update ALL arenas user is in
  UPDATE public.arena_participants ap
  SET current_score = GREATEST(
    COALESCE(ap.current_score, 0),
    COALESCE(v_profile_streak, 0)
  ),
  updated_at = NOW()
  FROM public.sweat_arenas sa
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'streak_days';
  
  GET DIAGNOSTICS v_updated_streak = ROW_COUNT;
  
  -- Log for debugging (can be removed in production)
  IF v_updated_total > 0 OR v_updated_streak > 0 THEN
    RAISE LOG 'update_arena_scores: user_id=%, gym_id=%, drops=%, updated_total=%, updated_streak=%',
      p_user_id, p_gym_id, p_drops, v_updated_total, v_updated_streak;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_arena_scores(UUID, UUID, INTEGER) IS
  'Updates arena scores in real-time for total_drops and streak_days scoring models. '
  'Called by award_drops() after each session. '
  'FIXED: Now updates ALL arenas the user is participating in, regardless of session gym_id. '
  'Removed gym_id filter that was preventing score updates.';
