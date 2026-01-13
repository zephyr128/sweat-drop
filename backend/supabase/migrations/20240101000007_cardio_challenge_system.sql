-- Cardio Challenge System Migration
-- Adds minutes-based challenges for Treadmill and Bike equipment

-- 1. Add new columns to challenges table
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'one-time')) DEFAULT 'one-time',
  ADD COLUMN IF NOT EXISTS required_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS machine_type TEXT CHECK (machine_type IN ('treadmill', 'bike', 'any')) DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS drops_bounty INTEGER DEFAULT 0;

-- 2. Create user_challenge_progress table for minutes-based tracking
CREATE TABLE IF NOT EXISTS public.user_challenge_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  current_minutes INTEGER DEFAULT 0 NOT NULL,
  is_completed BOOLEAN DEFAULT false NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, challenge_id, gym_id)
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_challenge_progress_user_id ON public.user_challenge_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenge_progress_challenge_id ON public.user_challenge_progress(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_challenge_progress_gym_id ON public.user_challenge_progress(gym_id);
CREATE INDEX IF NOT EXISTS idx_user_challenge_progress_is_completed ON public.user_challenge_progress(is_completed);
CREATE INDEX IF NOT EXISTS idx_challenges_frequency ON public.challenges(frequency);
CREATE INDEX IF NOT EXISTS idx_challenges_machine_type ON public.challenges(machine_type);

-- 4. Enable RLS on user_challenge_progress
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for user_challenge_progress
CREATE POLICY "Users can view their own challenge progress"
  ON public.user_challenge_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own challenge progress"
  ON public.user_challenge_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own challenge progress"
  ON public.user_challenge_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Gym admins can view all progress for their gym
CREATE POLICY "Gym admins can view challenge progress for their gym"
  ON public.user_challenge_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'superadmin' OR
        (profiles.role = 'gym_admin' AND profiles.admin_gym_id = user_challenge_progress.gym_id)
      )
    )
  );

-- 6. Function to get or create user challenge progress
CREATE OR REPLACE FUNCTION public.get_or_create_user_challenge_progress(
  p_user_id UUID,
  p_challenge_id UUID,
  p_gym_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_progress_id UUID;
BEGIN
  -- Try to get existing progress
  SELECT id INTO v_progress_id
  FROM public.user_challenge_progress
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND gym_id = p_gym_id;

  -- If not found, create it
  IF v_progress_id IS NULL THEN
    INSERT INTO public.user_challenge_progress (user_id, challenge_id, gym_id)
    VALUES (p_user_id, p_challenge_id, p_gym_id)
    RETURNING id INTO v_progress_id;
  END IF;

  RETURN v_progress_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to update challenge progress with minutes
CREATE OR REPLACE FUNCTION public.update_challenge_progress_minutes(
  p_user_id UUID,
  p_gym_id UUID,
  p_minutes INTEGER,
  p_machine_type TEXT
)
RETURNS TABLE(
  challenge_id UUID,
  challenge_name TEXT,
  current_minutes INTEGER,
  required_minutes INTEGER,
  is_completed BOOLEAN,
  completed_now BOOLEAN,
  drops_awarded INTEGER
) AS $$
DECLARE
  v_challenge RECORD;
  v_progress_id UUID;
  v_was_completed BOOLEAN;
  v_completed_now BOOLEAN := false;
  v_drops_awarded INTEGER := 0;
BEGIN
  -- Loop through all active challenges that match the machine type
  FOR v_challenge IN
    SELECT c.id, c.name, c.required_minutes, c.drops_bounty, c.frequency
    FROM public.challenges c
    WHERE c.gym_id = p_gym_id
      AND c.is_active = true
      AND (
        c.machine_type = p_machine_type OR
        c.machine_type = 'any'
      )
      AND c.required_minutes IS NOT NULL
      AND (
        -- Daily challenges: active today
        (c.frequency = 'daily' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
        OR
        -- Weekly challenges: active this week
        (c.frequency = 'weekly' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
        OR
        -- One-time challenges: within date range
        (c.frequency = 'one-time' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
      )
  LOOP
    -- Get or create progress record
    v_progress_id := public.get_or_create_user_challenge_progress(
      p_user_id,
      v_challenge.id,
      p_gym_id
    );

    -- Check if already completed
    SELECT is_completed INTO v_was_completed
    FROM public.user_challenge_progress
    WHERE id = v_progress_id;

    -- Skip if already completed (unless it's a daily/weekly that should reset)
    -- Note: Resets are handled by cron job, so we skip completed challenges here
    IF v_was_completed THEN
      CONTINUE;
    END IF;

    -- Update progress
    UPDATE public.user_challenge_progress
    SET current_minutes = user_challenge_progress.current_minutes + p_minutes,
        last_updated = NOW(),
        updated_at = NOW()
    WHERE id = v_progress_id;

    -- Check if completed now
    SELECT ucp.current_minutes >= v_challenge.required_minutes INTO v_completed_now
    FROM public.user_challenge_progress ucp
    WHERE ucp.id = v_progress_id;

    IF v_completed_now AND NOT v_was_completed THEN
      -- Mark as completed
      UPDATE public.user_challenge_progress
      SET is_completed = true,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_progress_id;

      -- Award drops if bounty is set
      IF v_challenge.drops_bounty > 0 THEN
        -- Award to local gym balance
        PERFORM public.add_drops(
          p_user_id,
          p_gym_id,
          v_challenge.drops_bounty,
          'challenge',
          v_challenge.id,
          'Challenge completed: ' || v_challenge.name
        );
        v_drops_awarded := v_challenge.drops_bounty;
      END IF;
    END IF;

    -- Return progress info
    RETURN QUERY
    SELECT
      v_challenge.id,
      v_challenge.name,
      (SELECT current_minutes FROM public.user_challenge_progress WHERE id = v_progress_id),
      v_challenge.required_minutes,
      (SELECT is_completed FROM public.user_challenge_progress WHERE id = v_progress_id),
      v_completed_now,
      v_drops_awarded;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to reset daily challenges (called by cron)
CREATE OR REPLACE FUNCTION public.reset_daily_challenges()
RETURNS void AS $$
BEGIN
  UPDATE public.user_challenge_progress ucp
  SET current_minutes = 0,
      is_completed = false,
      completed_at = NULL,
      last_updated = NOW(),
      updated_at = NOW()
  FROM public.challenges c
  WHERE ucp.challenge_id = c.id
    AND c.frequency = 'daily'
    AND c.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function to reset weekly challenges (called by cron on Monday 00:00)
CREATE OR REPLACE FUNCTION public.reset_weekly_challenges()
RETURNS void AS $$
BEGIN
  UPDATE public.user_challenge_progress ucp
  SET current_minutes = 0,
      is_completed = false,
      completed_at = NULL,
      last_updated = NOW(),
      updated_at = NOW()
  FROM public.challenges c
  WHERE ucp.challenge_id = c.id
    AND c.frequency = 'weekly'
    AND c.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Function to get active challenges for a user in a gym
CREATE OR REPLACE FUNCTION public.get_active_challenges_for_user(
  p_user_id UUID,
  p_gym_id UUID,
  p_machine_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  challenge_id UUID,
  challenge_name TEXT,
  description TEXT,
  frequency TEXT,
  required_minutes INTEGER,
  machine_type TEXT,
  drops_bounty INTEGER,
  current_minutes INTEGER,
  is_completed BOOLEAN,
  progress_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.frequency,
    c.required_minutes,
    c.machine_type,
    c.drops_bounty,
    COALESCE(ucp.current_minutes, 0)::INTEGER,
    COALESCE(ucp.is_completed, false),
    CASE
      WHEN c.required_minutes > 0 THEN
        ROUND((COALESCE(ucp.current_minutes, 0)::NUMERIC / c.required_minutes::NUMERIC) * 100, 2)
      ELSE 0
    END
  FROM public.challenges c
  LEFT JOIN public.user_challenge_progress ucp
    ON ucp.challenge_id = c.id
    AND ucp.user_id = p_user_id
    AND ucp.gym_id = p_gym_id
  WHERE c.gym_id = p_gym_id
    AND c.is_active = true
    AND c.required_minutes IS NOT NULL
    AND (
      p_machine_type IS NULL OR
      c.machine_type = p_machine_type OR
      c.machine_type = 'any'
    )
    AND (
      -- Daily challenges: active today
      (c.frequency = 'daily' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
      OR
      -- Weekly challenges: active this week
      (c.frequency = 'weekly' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
      OR
      -- One-time challenges: within date range
      (c.frequency = 'one-time' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
    )
  ORDER BY
    CASE c.frequency
      WHEN 'daily' THEN 1
      WHEN 'weekly' THEN 2
      WHEN 'one-time' THEN 3
    END,
    c.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Function to get challenge completion stats for admin
CREATE OR REPLACE FUNCTION public.get_challenge_completion_stats(
  p_challenge_id UUID
)
RETURNS TABLE(
  total_users INTEGER,
  completed_users INTEGER,
  completion_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT ucp.user_id)::INTEGER,
    COUNT(DISTINCT CASE WHEN ucp.is_completed THEN ucp.user_id END)::INTEGER,
    CASE
      WHEN COUNT(DISTINCT ucp.user_id) > 0 THEN
        ROUND((COUNT(DISTINCT CASE WHEN ucp.is_completed THEN ucp.user_id END)::NUMERIC / COUNT(DISTINCT ucp.user_id)::NUMERIC) * 100, 2)
      ELSE 0
    END
  FROM public.user_challenge_progress ucp
  WHERE ucp.challenge_id = p_challenge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Comments for documentation
COMMENT ON COLUMN public.challenges.frequency IS 'Challenge frequency: daily (resets every 24h), weekly (resets every Monday), one-time (no reset)';
COMMENT ON COLUMN public.challenges.required_minutes IS 'Target minutes required to complete the challenge';
COMMENT ON COLUMN public.challenges.machine_type IS 'Equipment type: treadmill, bike, or any';
COMMENT ON COLUMN public.challenges.drops_bounty IS 'Drops awarded upon challenge completion';
COMMENT ON TABLE public.user_challenge_progress IS 'Tracks user progress on minutes-based cardio challenges';
