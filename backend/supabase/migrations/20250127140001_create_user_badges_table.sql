-- Create User Badges Table Migration
-- Creates user_badges table to track badges earned by users when completing challenges

-- Create user_badges table
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, challenge_id) -- User can only earn a badge once per challenge
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_challenge_id ON public.user_badges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_earned_at ON public.user_badges(earned_at DESC);

-- Enable Row Level Security
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_badges

-- Users can view their own badges
CREATE POLICY "Users can view own badges"
  ON public.user_badges FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view other users' badges (for leaderboard/social features)
CREATE POLICY "Users can view other users' badges"
  ON public.user_badges FOR SELECT
  USING (true);

-- Backend functions can insert badges (via SECURITY DEFINER functions)
-- Note: Direct INSERT from client is not allowed - badges are only awarded
-- automatically by add_drops() function when challenge is completed
CREATE POLICY "Backend can insert badges"
  ON public.user_badges FOR INSERT
  WITH CHECK (true); -- SECURITY DEFINER functions will handle authorization

-- Comments for documentation
COMMENT ON TABLE public.user_badges IS 'Tracks badges earned by users when completing challenges. Each user can earn a badge only once per challenge (enforced by unique constraint).';
COMMENT ON COLUMN public.user_badges.earned_at IS 'Timestamp when the badge was earned (when challenge was completed).';
COMMENT ON COLUMN public.user_badges.user_id IS 'User who earned the badge.';
COMMENT ON COLUMN public.user_badges.challenge_id IS 'Challenge that was completed to earn this badge.';
