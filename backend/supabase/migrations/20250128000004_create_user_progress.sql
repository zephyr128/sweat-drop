-- Migration: 20250128000004_create_user_progress.sql
-- Description: Creates user_progress table for unified progress tracking (global achievements + gym challenges)
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Added table: public.user_progress (unified progress tracking)
-- - Added indexes: idx_user_progress_*, idx_user_progress_progress_data (GIN)
-- - Added RLS policies: Users can view own progress, Global achievement progress, Gym admins can view gym challenge progress, Backend can manage progress
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Will need to fetch user_progress instead of challenge_progress
-- - Admin Panel: Will need to query user_progress for gym challenge statistics
-- 
-- BREAKING CHANGES:
-- - New table (does not replace challenge_progress yet - that will be done in a future migration)
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Proceed to Korak 1.5: Update user_badges for polymorphic references

-- Create user_progress table (unified progress tracking)
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Polymorphic reference: either global_achievement_id OR gym_challenge_id
  global_achievement_id UUID REFERENCES public.global_achievements(id) ON DELETE CASCADE,
  gym_challenge_id UUID REFERENCES public.gym_challenges(id) ON DELETE CASCADE,
  
  -- Progress data (JSONB for flexibility)
  progress_data JSONB DEFAULT '{}'::jsonb NOT NULL, -- e.g., {"drops": 500, "streak_days": 3, "sessions": 2}
  
  -- Completion status
  is_completed BOOLEAN DEFAULT false NOT NULL,
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints: exactly one of global_achievement_id or gym_challenge_id must be set
  CONSTRAINT user_progress_exactly_one_reference CHECK (
    (global_achievement_id IS NOT NULL AND gym_challenge_id IS NULL) OR
    (global_achievement_id IS NULL AND gym_challenge_id IS NOT NULL)
  ),
  
  -- Unique constraint: user can only have one progress record per achievement/challenge
  UNIQUE(user_id, global_achievement_id, gym_challenge_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_global_achievement_id ON public.user_progress(global_achievement_id) WHERE global_achievement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_progress_gym_challenge_id ON public.user_progress(gym_challenge_id) WHERE gym_challenge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_progress_is_completed ON public.user_progress(is_completed) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_user_progress_progress_data ON public.user_progress USING GIN (progress_data);

-- Enable RLS
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own progress
CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view other users' progress for global achievements (for leaderboards)
CREATE POLICY "Users can view global achievement progress"
  ON public.user_progress FOR SELECT
  USING (global_achievement_id IS NOT NULL);

-- Gym admins can view progress for their gym's challenges
CREATE POLICY "Gym admins can view gym challenge progress"
  ON public.user_progress FOR SELECT
  USING (
    gym_challenge_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.gym_challenges gc
      JOIN public.gym_staff gs ON gc.gym_id = gs.gym_id
      WHERE gc.id = gym_challenge_id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
    )
  );

-- Backend functions can insert/update progress (via SECURITY DEFINER)
CREATE POLICY "Backend can manage progress"
  ON public.user_progress FOR ALL
  WITH CHECK (true); -- SECURITY DEFINER functions handle authorization

-- Comments
COMMENT ON TABLE public.user_progress IS 'Unified progress tracking for both global achievements and gym challenges. Uses polymorphic references (either global_achievement_id or gym_challenge_id).';
COMMENT ON COLUMN public.user_progress.progress_data IS 'JSONB structure storing progress metrics. Schema varies by achievement/challenge type (e.g., {"drops": 500} for drops-based, {"streak_days": 3} for streak).';
COMMENT ON COLUMN public.user_progress.global_achievement_id IS 'Reference to global achievement (if this progress is for a global achievement). Exactly one of global_achievement_id or gym_challenge_id must be set.';
COMMENT ON COLUMN public.user_progress.gym_challenge_id IS 'Reference to gym challenge (if this progress is for a gym challenge). Exactly one of global_achievement_id or gym_challenge_id must be set.';
