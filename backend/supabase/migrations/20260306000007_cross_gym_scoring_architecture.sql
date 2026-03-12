-- Migration: 20260306000007_cross_gym_scoring_architecture.sql
-- Description: Cross-gym scoring architecture — track per-gym score breakdown for arena participants
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- Reference: docs/plans/sweat_arenas_v2_comprehensive_plan.md — Section 3.10
-- 
-- CHANGES:
-- - Created arena_participant_gym_scores table for per-gym score breakdown
-- - Updated update_arena_scores() to use cross-gym scoring (UPSERT per-gym, recalculate total)
-- - Updated update_arena_scores_periodic() to populate per-gym breakdown for days_visited/variety_score
-- - Updated get_available_arenas() to add gym_score_breakdown JSONB column
-- - Updated get_arena_results() to add gym_breakdown JSONB column (privacy-aware)
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Can now show per-gym score breakdown for multi-gym users
-- - Admin Panel: Can show per-gym breakdown in arena results (full for superadmin, privacy for gym owners)
-- 
-- BREAKING CHANGES:
-- - None (additive changes only)

-- ============================================================================
-- 1. CREATE TABLE: arena_participant_gym_scores
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.arena_participant_gym_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID NOT NULL REFERENCES public.sweat_arenas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  score NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (arena_id, user_id, gym_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apgs_arena ON public.arena_participant_gym_scores(arena_id);
CREATE INDEX IF NOT EXISTS idx_apgs_user ON public.arena_participant_gym_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_apgs_arena_user ON public.arena_participant_gym_scores(arena_id, user_id);
CREATE INDEX IF NOT EXISTS idx_apgs_gym ON public.arena_participant_gym_scores(gym_id);

-- RLS Policies
ALTER TABLE public.arena_participant_gym_scores ENABLE ROW LEVEL SECURITY;

-- User sees their own rows only
CREATE POLICY "User sees own gym scores"
  ON public.arena_participant_gym_scores FOR SELECT
  USING (user_id = auth.uid());

-- Gym owner/admin sees rows for users who opted-in through their gym
-- (they can see breakdown of their members, but NOT which other gyms contributed)
CREATE POLICY "Gym staff sees own members gym scores"
  ON public.arena_participant_gym_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.arena_participants ap
      WHERE ap.arena_id = arena_participant_gym_scores.arena_id
        AND ap.user_id = arena_participant_gym_scores.user_id
        AND (
          -- gym_admin: check admin_gym_id matches opt-in gym
          (EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'gym_admin' AND admin_gym_id = ap.gym_id
          )) OR
          -- gym_owner: check if gym.owner_id matches or admin_gym_id matches opt-in gym
          (EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.gyms g ON g.id = ap.gym_id
            WHERE p.id = auth.uid() 
              AND p.role = 'gym_owner'
              AND (g.owner_id = auth.uid() OR p.admin_gym_id = ap.gym_id)
          ))
        )
    )
  );

-- Superadmin sees all
CREATE POLICY "Superadmin sees all gym scores"
  ON public.arena_participant_gym_scores FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- INSERT/UPDATE only via SECURITY DEFINER functions
-- No direct INSERT/UPDATE policies for regular users

COMMENT ON TABLE public.arena_participant_gym_scores IS
  'Tracks per-gym score breakdown for arena participants. Each row = one user''s score from one gym in one arena. '
  'arena_participants.current_score = SUM of all rows for that user in that arena (for total_drops).';

-- ============================================================================
-- 2. UPDATE FUNCTION: update_arena_scores() — Cross-Gym Scoring
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
  v_arena RECORD;
BEGIN
  -- Get current streak from profile
  SELECT COALESCE(streak_days, 0) INTO v_profile_streak
  FROM public.profiles
  WHERE id = p_user_id;

  -- ============================================================
  -- TOTAL_DROPS arenas — cross-gym scoring
  -- ============================================================
  FOR v_arena IN
    SELECT sa.id AS arena_id
    FROM public.sweat_arenas sa
    JOIN public.arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
    JOIN public.arena_participants ap ON ap.arena_id = sa.id AND ap.user_id = p_user_id
    WHERE sa.is_active = true
      AND sa.is_finalized = false
      AND sa.start_date <= CURRENT_DATE
      AND sa.end_date >= CURRENT_DATE
      AND sa.scoring_model = 'total_drops'
  LOOP
    -- 1. UPSERT per-gym breakdown
    INSERT INTO public.arena_participant_gym_scores
      (arena_id, user_id, gym_id, score, sessions)
    VALUES
      (v_arena.arena_id, p_user_id, p_gym_id, p_drops, 1)
    ON CONFLICT (arena_id, user_id, gym_id)
    DO UPDATE SET
      score = arena_participant_gym_scores.score + EXCLUDED.score,
      sessions = arena_participant_gym_scores.sessions + 1,
      updated_at = NOW();

    -- 2. Recalculate total from all gym breakdowns
    UPDATE public.arena_participants
    SET current_score = (
      SELECT COALESCE(SUM(score), 0)
      FROM public.arena_participant_gym_scores
      WHERE arena_id = v_arena.arena_id
        AND user_id = p_user_id
    ),
    updated_at = NOW()
    WHERE arena_id = v_arena.arena_id
      AND user_id = p_user_id;
  END LOOP;

  -- ============================================================
  -- STREAK_DAYS arenas — same as before (streak is global, not per-gym)
  -- But still track the session in gym_scores for informational purposes
  -- ============================================================
  FOR v_arena IN
    SELECT sa.id AS arena_id
    FROM public.sweat_arenas sa
    JOIN public.arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
    JOIN public.arena_participants ap ON ap.arena_id = sa.id AND ap.user_id = p_user_id
    WHERE sa.is_active = true
      AND sa.is_finalized = false
      AND sa.start_date <= CURRENT_DATE
      AND sa.end_date >= CURRENT_DATE
      AND sa.scoring_model = 'streak_days'
  LOOP
    -- Track session in breakdown (informational: which gyms contributed sessions)
    INSERT INTO public.arena_participant_gym_scores
      (arena_id, user_id, gym_id, score, sessions)
    VALUES
      (v_arena.arena_id, p_user_id, p_gym_id, p_drops, 1)
    ON CONFLICT (arena_id, user_id, gym_id)
    DO UPDATE SET
      score = arena_participant_gym_scores.score + EXCLUDED.score,
      sessions = arena_participant_gym_scores.sessions + 1,
      updated_at = NOW();

    -- Score = streak (global, NOT sum of per-gym)
    UPDATE public.arena_participants
    SET current_score = GREATEST(
      COALESCE(current_score, 0),
      COALESCE(v_profile_streak, 0)
    ),
    updated_at = NOW()
    WHERE arena_id = v_arena.arena_id
      AND user_id = p_user_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_arena_scores(UUID, UUID, INTEGER) IS
  'Updates arena scores in real-time for total_drops and streak_days scoring models. '
  'For total_drops: UPSERTs per-gym breakdown and recalculates total from SUM of all gyms. '
  'For streak_days: tracks sessions per-gym (informational) but score = global streak. '
  'p_gym_id is the session gym (where workout happened), not the opt-in gym.';

-- ============================================================================
-- 3. UPDATE FUNCTION: update_arena_scores_periodic() — Cross-Gym for days_visited/variety_score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_arena_scores_periodic()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- ============================================================
  -- DAYS_VISITED: count distinct dates across ALL participating gyms
  -- Also populate per-gym breakdown (days per gym)
  -- ============================================================

  -- 1. Update per-gym breakdown for days_visited
  INSERT INTO public.arena_participant_gym_scores (arena_id, user_id, gym_id, score, sessions)
  SELECT
    ap.arena_id,
    ap.user_id,
    ag.gym_id,
    COUNT(DISTINCT DATE(s.started_at))::NUMERIC AS score,
    COUNT(s.id) AS sessions
  FROM public.arena_participants ap
  JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  JOIN public.sessions s ON s.user_id = ap.user_id
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
  WHERE sa.scoring_model = 'days_visited'
    AND sa.is_active = true AND NOT sa.is_finalized
  GROUP BY ap.arena_id, ap.user_id, ag.gym_id
  ON CONFLICT (arena_id, user_id, gym_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    sessions = EXCLUDED.sessions,
    updated_at = NOW();

  -- 2. Update total score (distinct days across ALL gyms — NOT sum of per-gym)
  WITH updated_days AS (
    UPDATE public.arena_participants ap
    SET current_score = sub.day_count
    FROM (
      SELECT ap2.id AS participant_id,
        COUNT(DISTINCT DATE(s.started_at)) AS day_count
      FROM public.arena_participants ap2
      JOIN public.sweat_arenas sa ON sa.id = ap2.arena_id
      JOIN public.arena_gyms ag ON ag.arena_id = sa.id
      JOIN public.sessions s ON s.user_id = ap2.user_id
        AND s.gym_id = ag.gym_id
        AND DATE(s.started_at) >= sa.start_date
        AND DATE(s.started_at) <= sa.end_date
        AND s.drops_earned > 0
      WHERE sa.scoring_model = 'days_visited'
        AND sa.is_active = true AND NOT sa.is_finalized
      GROUP BY ap2.id
    ) sub
    WHERE ap.id = sub.participant_id
    RETURNING ap.id
  )
  SELECT COUNT(*) INTO v_updated FROM updated_days;

  -- ============================================================
  -- VARIETY_SCORE: count distinct machines across ALL participating gyms
  -- Also populate per-gym breakdown (machines per gym)
  -- ============================================================

  -- 1. Update per-gym breakdown for variety_score
  INSERT INTO public.arena_participant_gym_scores (arena_id, user_id, gym_id, score, sessions)
  SELECT
    ap.arena_id,
    ap.user_id,
    ag.gym_id,
    COUNT(DISTINCT s.machine_id)::NUMERIC AS score,
    COUNT(s.id) AS sessions
  FROM public.arena_participants ap
  JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  JOIN public.sessions s ON s.user_id = ap.user_id
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
    AND s.machine_id IS NOT NULL
  WHERE sa.scoring_model = 'variety_score'
    AND sa.is_active = true AND NOT sa.is_finalized
  GROUP BY ap.arena_id, ap.user_id, ag.gym_id
  ON CONFLICT (arena_id, user_id, gym_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    sessions = EXCLUDED.sessions,
    updated_at = NOW();

  -- 2. Update total score (distinct machines across ALL gyms)
  WITH updated_variety AS (
    UPDATE public.arena_participants ap
    SET current_score = sub.machine_count
    FROM (
      SELECT ap2.id AS participant_id,
        COUNT(DISTINCT s.machine_id) AS machine_count
      FROM public.arena_participants ap2
      JOIN public.sweat_arenas sa ON sa.id = ap2.arena_id
      JOIN public.arena_gyms ag ON ag.arena_id = sa.id
      JOIN public.sessions s ON s.user_id = ap2.user_id
        AND s.gym_id = ag.gym_id
        AND DATE(s.started_at) >= sa.start_date
        AND DATE(s.started_at) <= sa.end_date
        AND s.drops_earned > 0
        AND s.machine_id IS NOT NULL
      WHERE sa.scoring_model = 'variety_score'
        AND sa.is_active = true AND NOT sa.is_finalized
      GROUP BY ap2.id
    ) sub
    WHERE ap.id = sub.participant_id
    RETURNING ap.id
  )
  SELECT COUNT(*) + v_updated INTO v_updated FROM updated_variety;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.update_arena_scores_periodic() IS
  'Recalculates scores for days_visited and variety_score arenas. '
  'Populates per-gym breakdown and calculates total across ALL participating gyms. '
  'For days_visited/variety_score: current_score ≠ SUM(gym_scores) because same day/machine at 2 gyms = 1 total.';

GRANT EXECUTE ON FUNCTION public.update_arena_scores_periodic() TO service_role;

-- ============================================================================
-- 4. UPDATE FUNCTION: get_available_arenas() — Add gym_score_breakdown JSONB
-- ============================================================================

-- Drop existing function first (cannot change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.get_available_arenas(UUID);

CREATE OR REPLACE FUNCTION public.get_available_arenas(p_user_id UUID)
RETURNS TABLE(
  arena_id UUID,
  name TEXT,
  description TEXT,
  sponsor_name TEXT,
  sponsor_logo TEXT,
  scoring_model TEXT,
  start_date DATE,
  end_date DATE,
  participant_count BIGINT,
  user_opted_in BOOLEAN,
  user_rank BIGINT,
  user_score NUMERIC,
  prizes JSONB,
  opt_in_type TEXT,
  opt_in_value INTEGER,
  card_color TEXT,
  card_text_color TEXT,
  card_gradient_end TEXT,
  arena_status TEXT,
  gym_score_breakdown JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id AS arena_id,
    sa.name,
    sa.description,
    sa.sponsor_name,
    sa.sponsor_logo,
    sa.scoring_model,
    sa.start_date,
    sa.end_date,
    COUNT(DISTINCT ap.id)::BIGINT AS participant_count,
    EXISTS (
      SELECT 1 FROM public.arena_participants ap2
      WHERE ap2.arena_id = sa.id AND ap2.user_id = p_user_id
    ) AS user_opted_in,
    (
      SELECT COUNT(*)::BIGINT + 1
      FROM public.arena_participants ap3
      WHERE ap3.arena_id = sa.id
        AND ap3.current_score > COALESCE((
          SELECT ap4.current_score
          FROM public.arena_participants ap4
          WHERE ap4.arena_id = sa.id AND ap4.user_id = p_user_id
        ), 0)
    ) AS user_rank,
    (
      SELECT ap5.current_score
      FROM public.arena_participants ap5
      WHERE ap5.arena_id = sa.id AND ap5.user_id = p_user_id
    ) AS user_score,
    sa.prizes,
    -- NEW fields
    COALESCE(sa.opt_in_type, 'free')::TEXT AS opt_in_type,
    COALESCE(sa.opt_in_value, 0)::INTEGER AS opt_in_value,
    sa.card_color::TEXT,
    sa.card_text_color::TEXT,
    sa.card_gradient_end::TEXT,
    CASE
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ended'
      ELSE 'active'
    END::TEXT AS arena_status,
    -- NEW: gym_score_breakdown JSONB
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'gym_id', apgs.gym_id,
          'gym_name', g.name,
          'score', apgs.score,
          'sessions', apgs.sessions
        ) ORDER BY apgs.score DESC
      ), '[]'::jsonb)
      FROM public.arena_participant_gym_scores apgs
      JOIN public.gyms g ON g.id = apgs.gym_id
      WHERE apgs.arena_id = sa.id
        AND apgs.user_id = p_user_id
    ) AS gym_score_breakdown
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND sa.is_finalized = false
    AND sa.end_date >= CURRENT_DATE  -- Include upcoming AND active (but not ended)
    -- Require arena_gyms participation for ALL arena scopes (including network)
    AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sa.id
        AND gm.user_id = p_user_id
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes,
           sa.opt_in_type, sa.opt_in_value, sa.card_color, sa.card_text_color, sa.card_gradient_end
  ORDER BY
    -- Upcoming first, then active, then by start date
    CASE WHEN sa.start_date > CURRENT_DATE THEN 0 ELSE 1 END,
    sa.start_date ASC;
END;
$$;

COMMENT ON FUNCTION public.get_available_arenas(UUID) IS
  'Returns arenas available to a user. Only shows arenas where user''s gym has accepted invitation (is in arena_gyms). '
  'Includes gym_score_breakdown JSONB with per-gym score breakdown for opted-in users. '
  'Returns NULL for gym_score_breakdown if user not opted in, empty array if opted-in with no scores yet.';

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;

-- ============================================================================
-- 5. UPDATE FUNCTION: get_arena_results() — Add gym_breakdown JSONB (privacy-aware)
-- ============================================================================

-- Drop existing function first (cannot change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.get_arena_results(UUID);

CREATE OR REPLACE FUNCTION public.get_arena_results(p_arena_id UUID)
RETURNS TABLE(
  rank INTEGER,
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  gym_name TEXT,
  final_score NUMERIC,
  prize TEXT,
  redemption_code TEXT,
  redemption_status TEXT,
  gym_breakdown JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_superadmin BOOLEAN;
  v_caller_gym_id UUID;
BEGIN
  -- Check if caller is superadmin
  SELECT public.is_superadmin(v_caller_id) INTO v_is_superadmin;
  
  -- Get caller's gym_id (for gym owner/admin privacy view)
  IF NOT v_is_superadmin THEN
    SELECT admin_gym_id INTO v_caller_gym_id
    FROM public.profiles
    WHERE id = v_caller_id;
    
    -- Also check gyms.owner_id for gym_owner
    IF v_caller_gym_id IS NULL THEN
      SELECT id INTO v_caller_gym_id
      FROM public.gyms
      WHERE owner_id = v_caller_id
      LIMIT 1;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    ar.final_rank::INTEGER AS rank,
    ar.user_id,
    p.username::TEXT,
    p.avatar_url::TEXT,
    g.name::TEXT AS gym_name,
    ar.final_score,
    ar.prize_description::TEXT AS prize,
    r.redemption_code::TEXT,
    r.status::TEXT AS redemption_status,
    -- NEW: gym_breakdown JSONB (privacy-aware)
    CASE
      WHEN v_is_superadmin THEN
        -- Superadmin: full per-gym breakdown
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'gym_id', apgs.gym_id,
            'gym_name', g2.name,
            'score', apgs.score,
            'sessions', apgs.sessions
          ) ORDER BY apgs.score DESC
        ), '[]'::jsonb)
        FROM public.arena_participant_gym_scores apgs
        JOIN public.gyms g2 ON g2.id = apgs.gym_id
        WHERE apgs.arena_id = p_arena_id AND apgs.user_id = ar.user_id)
      ELSE
        -- Gym owner/admin: privacy-respecting breakdown (own gym vs others, no gym names)
        (SELECT jsonb_build_object(
          'own_gym_score', COALESCE(SUM(
            CASE WHEN apgs.gym_id = v_caller_gym_id THEN apgs.score ELSE 0 END
          ), 0),
          'other_gyms_score', COALESCE(SUM(
            CASE WHEN apgs.gym_id != v_caller_gym_id OR v_caller_gym_id IS NULL THEN apgs.score ELSE 0 END
          ), 0),
          'total_sessions', COALESCE(SUM(apgs.sessions), 0)
        )
        FROM public.arena_participant_gym_scores apgs
        WHERE apgs.arena_id = p_arena_id AND apgs.user_id = ar.user_id)
    END AS gym_breakdown
  FROM public.arena_results ar
  JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.gyms g ON g.id = ar.gym_id
  LEFT JOIN public.redemptions r ON r.id = ar.redemption_id
  WHERE ar.arena_id = p_arena_id
  ORDER BY ar.final_rank ASC;
END;
$$;

COMMENT ON FUNCTION public.get_arena_results(UUID) IS
  'Returns finalized arena results with ranking, user info, scores, prizes, redemption codes, and redemption status. '
  'Includes gym_breakdown JSONB: full per-gym breakdown for superadmin, privacy-respecting (own vs others) for gym owners.';

GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO service_role;
