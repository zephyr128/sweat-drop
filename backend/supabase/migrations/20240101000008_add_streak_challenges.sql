-- Add Streak Challenge Support
-- Allows challenges like "3 days streak" or "7 days streak"

-- 1. Update frequency column to include 'streak'
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_frequency_check;
  
ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_frequency_check 
  CHECK (frequency IN ('daily', 'weekly', 'one-time', 'streak'));

-- 2. Add streak_days column for streak challenges
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS streak_days INTEGER;

-- 3. Add comment to explain streak_days
COMMENT ON COLUMN public.challenges.streak_days IS 'Number of consecutive days required for streak challenges (only used when frequency = streak)';

-- 4. Drop and recreate get_active_challenges_for_user to include streak challenges
DROP FUNCTION IF EXISTS public.get_active_challenges_for_user(uuid, uuid, text) CASCADE;

CREATE FUNCTION public.get_active_challenges_for_user(
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
  progress_percentage NUMERIC,
  streak_days INTEGER
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
    END,
    c.streak_days
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
      -- Streak challenges: within date range
      (c.frequency = 'streak' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
      OR
      -- One-time challenges: within date range
      (c.frequency = 'one-time' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
    )
  ORDER BY
    CASE c.frequency
      WHEN 'daily' THEN 1
      WHEN 'weekly' THEN 2
      WHEN 'streak' THEN 3
      WHEN 'one-time' THEN 4
    END,
    c.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Drop and recreate update_challenge_progress_minutes to handle streak challenges
DROP FUNCTION IF EXISTS public.update_challenge_progress_minutes(uuid, uuid, integer, text) CASCADE;

CREATE FUNCTION public.update_challenge_progress_minutes(
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
    SELECT c.id, c.name, c.required_minutes, c.drops_bounty, c.frequency, c.streak_days
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
        -- Streak challenges: within date range
        (c.frequency = 'streak' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE)
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

    -- For streak challenges, we need to track daily progress differently
    -- For now, we'll update minutes similar to daily challenges
    -- TODO: Implement proper streak tracking (consecutive days logic)
    UPDATE public.user_challenge_progress
    SET current_minutes = user_challenge_progress.current_minutes + p_minutes,
        last_updated = NOW(),
        updated_at = NOW()
    WHERE id = v_progress_id;

    -- Check if completed now
    -- For streak challenges, completion is based on streak_days * required_minutes
    IF v_challenge.frequency = 'streak' AND v_challenge.streak_days IS NOT NULL THEN
      SELECT (ucp.current_minutes >= (v_challenge.required_minutes * v_challenge.streak_days)) INTO v_completed_now
      FROM public.user_challenge_progress ucp
      WHERE ucp.id = v_progress_id;
    ELSE
      SELECT ucp.current_minutes >= v_challenge.required_minutes INTO v_completed_now
      FROM public.user_challenge_progress ucp
      WHERE ucp.id = v_progress_id;
    END IF;

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
      CASE
        WHEN v_challenge.frequency = 'streak' AND v_challenge.streak_days IS NOT NULL THEN
          v_challenge.required_minutes * v_challenge.streak_days
        ELSE
          v_challenge.required_minutes
      END,
      v_completed_now,
      v_drops_awarded;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
