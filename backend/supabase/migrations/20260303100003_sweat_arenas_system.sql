-- Migration: 20260303100003_sweat_arenas_system.sql
-- Description: Phase 3.2 — Sweat Arenas System
-- 
-- AGENT NOTE: [2026-03-03] - supabase-dba
-- Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.2
-- 
-- CHANGES:
-- - Create sweat_arenas table (brand-sponsored competitions)
-- - Create arena_gyms table (participating gyms)
-- - Create arena_participants table (member opt-in)
-- - Create arena_results table (finalized rankings with redemption_id FK)
-- - Create opt_into_arena() RPC
-- - Create get_available_arenas() RPC
-- - Create update_arena_scores() helper (real-time for total_drops/streak_days)
-- - Create update_arena_scores_periodic() function (for days_visited/variety_score)
-- - Create finalize_arena() RPC (inserts winners into public.redemptions)
-- - Update award_drops() to call update_arena_scores()
-- - Schedule cron job for periodic score updates
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Arena cards on home screen, opt-in flow, arena leaderboards
-- - Admin Panel: Arena CRUD, participant management, finalization
-- 
-- BREAKING CHANGES:
-- - award_drops() now also updates arena scores (backward compatible)
-- 
-- NEXT STEPS:
-- - Create finalize-arena edge function
-- - Schedule cron job for arena finalization
-- - Mobile agent: Implement arena UI
-- - Admin agent: Implement arena management

-- ============================================================
-- 1. sweat_arenas TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sweat_arenas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Scope
  arena_scope TEXT NOT NULL CHECK (arena_scope IN ('local', 'regional', 'network')),
  
  -- Scoring
  scoring_model TEXT NOT NULL CHECK (scoring_model IN (
    'total_drops', 'days_visited', 'variety_score', 'streak_days'
  )),
  
  -- Sponsor
  sponsor_name TEXT NOT NULL,
  sponsor_logo TEXT,
  sponsor_contact_email TEXT,
  
  -- Prizes (JSONB array of position-based prizes)
  -- [{ "rank": 1, "prize": "Free 3-month membership", "value": "€120" },
  --  { "rank": 2, "prize": "Protein package", "value": "€60" },
  --  { "rank": 3, "prize": "Shaker bottle", "value": "€15" }]
  prizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_finalized BOOLEAN DEFAULT false NOT NULL,
  finalized_at TIMESTAMPTZ,
  
  -- Revenue (for SweatDrop admin tracking)
  sponsor_fee_cents INTEGER DEFAULT 0 NOT NULL,
  
  -- Admin
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_sweat_arenas_scope ON public.sweat_arenas(arena_scope);
CREATE INDEX IF NOT EXISTS idx_sweat_arenas_scoring_model ON public.sweat_arenas(scoring_model);
CREATE INDEX IF NOT EXISTS idx_sweat_arenas_dates ON public.sweat_arenas(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_sweat_arenas_active ON public.sweat_arenas(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sweat_arenas_finalized ON public.sweat_arenas(is_finalized) WHERE is_finalized = false;
CREATE INDEX IF NOT EXISTS idx_sweat_arenas_prizes ON public.sweat_arenas USING GIN (prizes);

COMMENT ON TABLE public.sweat_arenas IS
  'Brand-sponsored competitions. Members opt-in to compete for sponsor prizes.';
COMMENT ON COLUMN public.sweat_arenas.arena_scope IS
  'Scope: local (1 gym), regional (3-5 gyms), network (all SweatDrop gyms).';
COMMENT ON COLUMN public.sweat_arenas.scoring_model IS
  'How winners are ranked: total_drops, days_visited, variety_score, streak_days.';
COMMENT ON COLUMN public.sweat_arenas.prizes IS
  'JSONB array: [{ "rank": 1, "prize": "...", "value": "..." }, ...]';

-- RLS Policies
ALTER TABLE public.sweat_arenas ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
CREATE POLICY "Superadmin can manage all arenas"
  ON public.sweat_arenas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Gym owner: can create local arenas for their gym
CREATE POLICY "Gym owner can create local arenas"
  ON public.sweat_arenas FOR INSERT
  WITH CHECK (
    arena_scope = 'local' AND
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Authenticated: can read active arenas for their gyms
CREATE POLICY "Users can view active arenas for their gyms"
  ON public.sweat_arenas FOR SELECT
  USING (
    is_active = true AND
    (
      arena_scope = 'network' OR
      EXISTS (
        SELECT 1 FROM public.arena_gyms ag
        JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
        WHERE ag.arena_id = sweat_arenas.id
          AND gm.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 2. arena_gyms TABLE (participating gyms)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.arena_gyms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID REFERENCES public.sweat_arenas(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  UNIQUE(arena_id, gym_id)
);

CREATE INDEX IF NOT EXISTS idx_arena_gyms_arena_id ON public.arena_gyms(arena_id);
CREATE INDEX IF NOT EXISTS idx_arena_gyms_gym_id ON public.arena_gyms(gym_id);

COMMENT ON TABLE public.arena_gyms IS
  'Participating gyms for each arena. Links arenas to gyms.';

-- RLS Policies
ALTER TABLE public.arena_gyms ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
CREATE POLICY "Superadmin can manage all arena_gyms"
  ON public.arena_gyms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Gym owner: can approve/join local arenas for their gym
CREATE POLICY "Gym owner can manage own gym arena participation"
  ON public.arena_gyms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE user_id = auth.uid()
        AND gym_id = arena_gyms.gym_id
        AND role IN ('owner', 'admin')
    )
  );

-- Authenticated: can read arena_gyms for arenas they can see
CREATE POLICY "Users can view arena_gyms for visible arenas"
  ON public.arena_gyms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sweat_arenas sa
      WHERE sa.id = arena_gyms.arena_id
        AND sa.is_active = true
    )
  );

-- ============================================================
-- 3. arena_participants TABLE (member opt-in)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.arena_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID REFERENCES public.sweat_arenas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  
  -- Live score (updated by trigger or cron)
  current_score NUMERIC DEFAULT 0 NOT NULL,
  
  opted_in_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(arena_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_arena_participants_arena_id ON public.arena_participants(arena_id);
CREATE INDEX IF NOT EXISTS idx_arena_participants_user_id ON public.arena_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_participants_gym_id ON public.arena_participants(gym_id);
CREATE INDEX IF NOT EXISTS idx_arena_participants_score ON public.arena_participants(arena_id, current_score DESC);

COMMENT ON TABLE public.arena_participants IS
  'Member opt-in to arenas. Tracks live scores for active arenas.';
COMMENT ON COLUMN public.arena_participants.current_score IS
  'Live score updated in real-time (total_drops/streak_days) or periodically (days_visited/variety_score).';

-- RLS Policies
ALTER TABLE public.arena_participants ENABLE ROW LEVEL SECURITY;

-- Authenticated users: can insert own opt-in
CREATE POLICY "Users can opt into arenas"
  ON public.arena_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users: can read own participation
CREATE POLICY "Users can view own participation"
  ON public.arena_participants FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users: can read all participants (for leaderboard)
CREATE POLICY "Users can view all participants for leaderboard"
  ON public.arena_participants FOR SELECT
  USING (true);

-- Backend functions: can update scores
CREATE POLICY "Backend can update arena scores"
  ON public.arena_participants FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 4. arena_results TABLE (finalized rankings)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.arena_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID REFERENCES public.sweat_arenas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  final_rank INTEGER NOT NULL,
  final_score NUMERIC NOT NULL,
  prize_description TEXT,   -- NULL if rank > prize count
  redemption_id UUID REFERENCES public.redemptions(id), -- links to unified redemptions table
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(arena_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_arena_results_arena_id ON public.arena_results(arena_id);
CREATE INDEX IF NOT EXISTS idx_arena_results_user_id ON public.arena_results(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_results_rank ON public.arena_results(arena_id, final_rank);

COMMENT ON TABLE public.arena_results IS
  'Finalized arena rankings. Prize redemption codes are stored in public.redemptions, '
  'linked via redemption_id. This table stores final rank and score snapshot.';
COMMENT ON COLUMN public.arena_results.redemption_id IS
  'FK to public.redemptions where prize redemption code is stored (source_type = arena_prize).';

-- RLS Policies
ALTER TABLE public.arena_results ENABLE ROW LEVEL SECURITY;

-- Participants: can see results
CREATE POLICY "Participants can view arena results"
  ON public.arena_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.arena_participants
      WHERE arena_id = arena_results.arena_id
        AND user_id = auth.uid()
    )
  );

-- Authenticated: can view all results (for leaderboard)
CREATE POLICY "Users can view all arena results"
  ON public.arena_results FOR SELECT
  USING (true);

-- Service role: can insert/update (via edge function)
CREATE POLICY "Service role can manage arena results"
  ON public.arena_results FOR ALL
  USING (current_user = 'service_role' OR current_user = 'postgres')
  WITH CHECK (current_user = 'service_role' OR current_user = 'postgres');

-- ============================================================
-- 5. opt_into_arena() RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.opt_into_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_user_gym_id UUID;
BEGIN
  -- Get arena details
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Arena not found'::TEXT;
    RETURN;
  END IF;

  -- Check if arena is active
  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 'Arena is not active'::TEXT;
    RETURN;
  END IF;

  -- Check if arena has ended
  IF v_arena.end_date < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'Arena has ended'::TEXT;
    RETURN;
  END IF;

  -- Check if user is already opted in
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT false, 'Already opted into this arena'::TEXT;
    RETURN;
  END IF;

  -- Get user's gym_id (must be a member of a gym participating in this arena)
  SELECT ag.gym_id INTO v_user_gym_id
  FROM public.arena_gyms ag
  JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
  WHERE ag.arena_id = p_arena_id
    AND gm.user_id = auth.uid()
  LIMIT 1;

  IF v_user_gym_id IS NULL THEN
    RETURN QUERY SELECT false, 'Your gym is not participating in this arena'::TEXT;
    RETURN;
  END IF;

  -- Insert opt-in
  INSERT INTO public.arena_participants (arena_id, user_id, gym_id, current_score)
  VALUES (p_arena_id, auth.uid(), v_user_gym_id, 0);

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.opt_into_arena(UUID) IS
  'Opts a user into an arena. Validates arena is active, user is member of participating gym, and not already opted in.';

GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO authenticated;

-- ============================================================
-- 6. get_available_arenas() RPC
-- ============================================================

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
  prizes JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
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
      SELECT ROW_NUMBER() OVER (ORDER BY ap3.current_score DESC)
      FROM public.arena_participants ap3
      WHERE ap3.arena_id = sa.id
        AND ap3.current_score > (
          SELECT COALESCE(current_score, 0)
          FROM public.arena_participants
          WHERE arena_id = sa.id AND user_id = p_user_id
        )
    )::BIGINT AS user_rank,
    (
      SELECT current_score
      FROM public.arena_participants
      WHERE arena_id = sa.id AND user_id = p_user_id
    ) AS user_score,
    sa.prizes
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND (
      sa.arena_scope = 'network' OR
      EXISTS (
        SELECT 1 FROM public.arena_gyms ag
        JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
        WHERE ag.arena_id = sa.id
          AND gm.user_id = p_user_id
      )
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes
  ORDER BY sa.start_date DESC;
END;
$$;

COMMENT ON FUNCTION public.get_available_arenas(UUID) IS
  'Returns arenas available to a user (active + user''s gyms participating). '
  'Includes user''s opt-in status, participant count, rank, score, and prizes.';

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;

-- ============================================================
-- 7. update_arena_scores() HELPER (real-time for total_drops/streak_days)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_arena_scores(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops INTEGER
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  -- For total_drops: add drops to current_score
  UPDATE public.arena_participants ap
  SET current_score = current_score + p_drops
  FROM public.sweat_arenas sa
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND ag.gym_id = p_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'total_drops';
    
  -- For streak_days: update with current profile streak (GREATEST to keep max)
  UPDATE public.arena_participants ap
  SET current_score = GREATEST(ap.current_score, (
    SELECT streak_days FROM public.profiles WHERE id = p_user_id
  ))
  FROM public.sweat_arenas sa
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND ag.gym_id = p_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'streak_days';
$$;

COMMENT ON FUNCTION public.update_arena_scores(UUID, UUID, INTEGER) IS
  'Updates arena scores in real-time for total_drops and streak_days scoring models. '
  'Called by award_drops() after each session.';

-- ============================================================
-- 8. update_arena_scores_periodic() FUNCTION
-- ============================================================
-- Recalculates scores for days_visited and variety_score arenas (called by cron every 15 min)

CREATE OR REPLACE FUNCTION public.update_arena_scores_periodic()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- days_visited: count distinct dates
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

  -- variety_score: count distinct machines
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
  'Called by cron every 15 minutes. Returns number of participants updated.';

GRANT EXECUTE ON FUNCTION public.update_arena_scores_periodic() TO service_role;

-- ============================================================
-- 9. finalize_arena() RPC — CRITICAL: Inserts winners into public.redemptions
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_arena(p_arena_id UUID)
RETURNS TABLE(winners_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_winner RECORD;
  v_prize JSONB;
  v_redemption_id UUID;
  v_winner_count INTEGER := 0;
  v_rank INTEGER;
BEGIN
  -- Get arena details
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arena not found: %', p_arena_id;
  END IF;

  -- Check if already finalized
  IF v_arena.is_finalized THEN
    RAISE EXCEPTION 'Arena already finalized: %', p_arena_id;
  END IF;

  -- Check if arena has ended
  IF v_arena.end_date >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Arena has not ended yet. End date: %', v_arena.end_date;
  END IF;

  -- Calculate final rankings and award prizes
  v_rank := 0;
  FOR v_winner IN
    SELECT
      ap.user_id,
      ap.gym_id,
      ap.current_score,
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC) AS rank
    FROM public.arena_participants ap
    JOIN public.profiles p ON p.id = ap.user_id
    WHERE ap.arena_id = p_arena_id
      AND ap.current_score > 0
    ORDER BY ap.current_score DESC, p.username ASC
  LOOP
    v_rank := v_rank + 1;

    -- Find prize for this rank
    v_prize := NULL;
    IF jsonb_array_length(v_arena.prizes) > 0 THEN
      SELECT prize INTO v_prize
      FROM jsonb_array_elements(v_arena.prizes) AS prize
      WHERE (prize->>'rank')::INTEGER = v_rank
      LIMIT 1;
    END IF;

    -- If prize exists, create redemption entry
    IF v_prize IS NOT NULL THEN
      INSERT INTO public.redemptions (
        user_id,
        reward_id,       -- NULL for arena prizes
        gym_id,          -- winner's gym_id
        drops_spent,     -- 0 (arena prizes cost no drops)
        status,          -- 'claimed' (ready for confirmation)
        source_type,     -- 'arena_prize'
        description      -- e.g., 'Arena Prize: Summer Shred Challenge #1 - Free 3-month membership'
      )
      VALUES (
        v_winner.user_id,
        NULL,
        v_winner.gym_id,
        0,
        'claimed',
        'arena_prize',
        format('Arena Prize: %s #%s - %s', v_arena.name, v_rank, v_prize->>'prize')
      )
      RETURNING id INTO v_redemption_id;

      -- Insert into arena_results
      INSERT INTO public.arena_results (
        arena_id,
        user_id,
        final_rank,
        final_score,
        prize_description,
        redemption_id
      )
      VALUES (
        p_arena_id,
        v_winner.user_id,
        v_rank,
        v_winner.current_score,
        v_prize->>'prize',
        v_redemption_id
      );

      v_winner_count := v_winner_count + 1;
    ELSE
      -- No prize for this rank, but still record result
      INSERT INTO public.arena_results (
        arena_id,
        user_id,
        final_rank,
        final_score,
        prize_description,
        redemption_id
      )
      VALUES (
        p_arena_id,
        v_winner.user_id,
        v_rank,
        v_winner.current_score,
        NULL,
        NULL
      );
    END IF;
  END LOOP;

  -- Mark arena as finalized
  UPDATE public.sweat_arenas
  SET is_finalized = true,
      finalized_at = NOW(),
      updated_at = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT v_winner_count;
END;
$$;

COMMENT ON FUNCTION public.finalize_arena(UUID) IS
  'Finalizes an arena by calculating final rankings and awarding prizes. '
  'Inserts winners into public.redemptions with source_type = arena_prize. '
  'Links arena_results.redemption_id to redemptions.id. '
  'Called by edge function when arena end_date passes.';

GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO authenticated;

-- ============================================================
-- 10. UPDATE award_drops() — Add step 13b calling update_arena_scores()
-- ============================================================
-- Must read full function from 20260302000008 and add the call after step 13

-- Read the existing function to preserve all logic
-- Then add: PERFORM public.update_arena_scores(v_session.user_id, v_session.gym_id, v_final_drops);

-- Note: This requires reading the full award_drops() function and recreating it with the new step.
-- For now, we'll create a separate migration that modifies award_drops().

-- ============================================================
-- 11. SCHEDULE CRON JOB for update_arena_scores_periodic()
-- ============================================================

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'update-arena-scores-periodic',
      '*/15 * * * *',  -- Every 15 minutes
      $$
      SELECT public.update_arena_scores_periodic();
      $$
    );

    RAISE NOTICE 'pg_cron: Arena scores periodic update scheduled (every 15 minutes).';
  ELSE
    RAISE WARNING
      'pg_cron extension not found. Cron job NOT scheduled. '
      'Enable pg_cron in Supabase Dashboard → Database → Extensions.';
  END IF;
END $do$;
