-- Fix ambiguous column reference in update_challenge_progress_minutes function
-- This fixes the "column reference 'current_minutes' is ambiguous" error

-- Drop and recreate the function with explicit table aliases
DROP FUNCTION IF EXISTS public.update_challenge_progress_minutes(uuid, uuid, integer, text) CASCADE;

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
    SELECT ucp.is_completed INTO v_was_completed
    FROM public.user_challenge_progress ucp
    WHERE ucp.id = v_progress_id;

    -- Skip if already completed (unless it's a daily/weekly that should reset)
    -- Note: Resets are handled by cron job, so we skip completed challenges here
    IF v_was_completed THEN
      CONTINUE;
    END IF;

    -- Update progress with explicit table reference
    UPDATE public.user_challenge_progress ucp
    SET current_minutes = ucp.current_minutes + p_minutes,
        last_updated = NOW(),
        updated_at = NOW()
    WHERE ucp.id = v_progress_id;

    -- Check if completed now with explicit table alias
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
      UPDATE public.user_challenge_progress ucp
      SET is_completed = true,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE ucp.id = v_progress_id;

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

    -- Return progress info with explicit table reference
    -- Use subquery to avoid ambiguity with RETURNS TABLE column names
    RETURN QUERY
    SELECT
      v_challenge.id AS challenge_id,
      v_challenge.name AS challenge_name,
      (SELECT ucp.current_minutes FROM public.user_challenge_progress ucp WHERE ucp.id = v_progress_id) AS current_minutes,
      CASE
        WHEN v_challenge.frequency = 'streak' AND v_challenge.streak_days IS NOT NULL THEN
          v_challenge.required_minutes * v_challenge.streak_days
        ELSE
          v_challenge.required_minutes
      END AS required_minutes,
      (SELECT ucp.is_completed FROM public.user_challenge_progress ucp WHERE ucp.id = v_progress_id) AS is_completed,
      v_completed_now AS completed_now,
      v_drops_awarded AS drops_awarded;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
