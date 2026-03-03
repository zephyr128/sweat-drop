-- Migration: 20260304000001_recreate_missing_phase3_tables.sql
-- Description: Recreates missing Phase 3 tables and adds missing Phase 0 columns
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- Problem: Tables were registered in migration history but never created
-- 
-- CHANGES:
-- - Create missing tables: sweat_arenas, arena_gyms, arena_participants, arena_results, leaderboard_snapshots
-- - Add missing columns to profiles: available_drops, weekly_drops, monthly_drops, streak_days, last_visit_date, expo_push_token, is_newcomer
-- - All operations use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS for idempotency
-- 
-- IMPACT:
-- - All Phase 3 features will work correctly
-- - Phase 0 columns will be available for leaderboards and streaks

-- ============================================================
-- 1. ADD MISSING COLUMNS TO profiles TABLE (Phase 0)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS available_drops INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_drops INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_drops INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_visit_date DATE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_newcomer BOOLEAN DEFAULT true NOT NULL;

-- Add indexes for leaderboard period queries (if not exist)
CREATE INDEX IF NOT EXISTS idx_profiles_weekly_drops ON public.profiles(weekly_drops DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_monthly_drops ON public.profiles(monthly_drops DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_drops ON public.profiles(total_drops DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_streak_days ON public.profiles(streak_days DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_newcomer ON public.profiles(is_newcomer) WHERE is_newcomer = true;
CREATE INDEX IF NOT EXISTS idx_profiles_last_visit_date ON public.profiles(last_visit_date DESC);

-- Add comments
COMMENT ON COLUMN public.profiles.available_drops IS 'Global spendable wallet balance. Reserved for future cross-gym spending. MVP uses gym_memberships.local_drops_balance.';
COMMENT ON COLUMN public.profiles.weekly_drops IS 'Drops earned this week. Reset every Monday 00:00 by cron job. Used for weekly leaderboard.';
COMMENT ON COLUMN public.profiles.monthly_drops IS 'Drops earned this month. Reset 1st of every month by cron job. Used for monthly leaderboard.';
COMMENT ON COLUMN public.profiles.streak_days IS 'Consecutive days of training. Incremented on session end if last_visit_date was yesterday. Reset to 1 if gap > 1 day.';
COMMENT ON COLUMN public.profiles.last_visit_date IS 'Date of last completed workout session. Used for streak calculation.';
COMMENT ON COLUMN public.profiles.expo_push_token IS 'Expo push notification token. Set by mobile app on login/startup.';
COMMENT ON COLUMN public.profiles.is_newcomer IS 'True for first 30 days after signup. Reset by daily cron job. Used for newcomer leaderboard tab.';

-- ============================================================
-- 2. CREATE sweat_arenas TABLE
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

-- RLS Policies will be created after arena_gyms table is created (see end of file)

-- ============================================================
-- 3. CREATE arena_gyms TABLE
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

DROP POLICY IF EXISTS "Superadmin can manage all arena_gyms" ON public.arena_gyms;
CREATE POLICY "Superadmin can manage all arena_gyms"
  ON public.arena_gyms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "Gym owner can manage own gym arena participation" ON public.arena_gyms;
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

DROP POLICY IF EXISTS "Users can view arena_gyms for visible arenas" ON public.arena_gyms;
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
-- 4. CREATE arena_participants TABLE
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

DROP POLICY IF EXISTS "Users can opt into arenas" ON public.arena_participants;
CREATE POLICY "Users can opt into arenas"
  ON public.arena_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own participation" ON public.arena_participants;
CREATE POLICY "Users can view own participation"
  ON public.arena_participants FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view all participants for leaderboard" ON public.arena_participants;
CREATE POLICY "Users can view all participants for leaderboard"
  ON public.arena_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Backend can update arena scores" ON public.arena_participants;
CREATE POLICY "Backend can update arena scores"
  ON public.arena_participants FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. CREATE arena_results TABLE
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

DROP POLICY IF EXISTS "Participants can view arena results" ON public.arena_results;
CREATE POLICY "Participants can view arena results"
  ON public.arena_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.arena_participants
      WHERE arena_id = arena_results.arena_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view all arena results" ON public.arena_results;
CREATE POLICY "Users can view all arena results"
  ON public.arena_results FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage arena results" ON public.arena_results;
CREATE POLICY "Service role can manage arena results"
  ON public.arena_results FOR ALL
  USING (current_user = 'service_role' OR current_user = 'postgres')
  WITH CHECK (current_user = 'service_role' OR current_user = 'postgres');

-- ============================================================
-- 6. CREATE leaderboard_snapshots TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rankings JSONB NOT NULL,
  -- JSONB: [{ "rank": 1, "user_id": "...", "username": "...", "drops": 1234 }, ...]
  prizes_distributed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(gym_id, period, period_end)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_gym_id ON public.leaderboard_snapshots(gym_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_period ON public.leaderboard_snapshots(period, period_end);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_prizes_distributed ON public.leaderboard_snapshots(prizes_distributed) WHERE prizes_distributed = false;

COMMENT ON TABLE public.leaderboard_snapshots IS
  'Snapshots of leaderboards at period end (weekly/monthly) for prize distribution history.';
COMMENT ON COLUMN public.leaderboard_snapshots.rankings IS
  'JSONB array of top rankings: [{ "rank": 1, "user_id": "...", "username": "...", "drops": 1234 }, ...]';
COMMENT ON COLUMN public.leaderboard_snapshots.prizes_distributed IS
  'Whether prizes have been distributed for this snapshot.';

-- RLS Policies
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin can manage all snapshots" ON public.leaderboard_snapshots;
CREATE POLICY "Superadmin can manage all snapshots"
  ON public.leaderboard_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "Gym admin can manage own gym snapshots" ON public.leaderboard_snapshots;
CREATE POLICY "Gym admin can manage own gym snapshots"
  ON public.leaderboard_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'gym_admin'
        AND admin_gym_id = leaderboard_snapshots.gym_id
    )
  );

DROP POLICY IF EXISTS "Users can view own gym snapshots" ON public.leaderboard_snapshots;
CREATE POLICY "Users can view own gym snapshots"
  ON public.leaderboard_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_memberships
      WHERE user_id = auth.uid()
        AND gym_id = leaderboard_snapshots.gym_id
    )
  );

-- ============================================================
-- 7. CREATE RLS POLICIES FOR sweat_arenas (after arena_gyms exists)
-- ============================================================

ALTER TABLE public.sweat_arenas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin can manage all arenas" ON public.sweat_arenas;
CREATE POLICY "Superadmin can manage all arenas"
  ON public.sweat_arenas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "Gym owner can create local arenas" ON public.sweat_arenas;
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

DROP POLICY IF EXISTS "Users can view active arenas for their gyms" ON public.sweat_arenas;
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
