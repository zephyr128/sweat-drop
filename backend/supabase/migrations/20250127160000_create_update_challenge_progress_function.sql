-- Create Update Challenge Progress Function Migration
-- Creates unified function that handles all 5 challenge types (daily, weekly, monthly, streak, milestone)
-- Includes atomic streak tracking without race conditions

CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops_earned INTEGER,
  p_session_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  challenge_id UUID,
  challenge_name TEXT,
  challenge_type challenge_type,
  current_progress INTEGER,
  target_progress INTEGER,
  is_completed BOOLEAN,
  completed_now BOOLEAN,
  reward_drops INTEGER
) AS $$
DECLARE
  v_challenge RECORD;
  v_progress_id UUID;
  v_was_completed BOOLEAN;
  v_completed_now BOOLEAN;
  v_current_drops INTEGER;
  v_current_streak INTEGER;
  v_milestone_balance INTEGER;
BEGIN
  -- Temporarily disable RLS for this function execution
  -- SECURITY DEFINER functions need to bypass RLS to insert/update challenge_progress
  SET LOCAL row_security = off;
  
  -- Loop through all active challenges for this gym
  FOR v_challenge IN
    SELECT 
      c.id,
      c.name,
      c.challenge_type,
      c.target_drops,
      c.milestone_threshold,
      c.reward_drops,
      c.streak_days,
      c.start_date,
      c.end_date
    FROM public.challenges c
    WHERE c.gym_id = p_gym_id
      AND c.is_active = true
      AND c.start_date <= p_session_date
      AND c.end_date >= p_session_date
  LOOP
    -- Skip if challenge is not applicable to this session date
    -- (already filtered above, but keeping for clarity)
    
    v_completed_now := false;
    v_was_completed := false;
    
    -- Handle each challenge type differently
    CASE v_challenge.challenge_type
      WHEN 'daily' THEN
        -- Daily: Only count drops earned on p_session_date
        -- Reset current_drops to 0 if last update was not today
        
        -- Get or create progress record
        INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_drops, last_activity_date)
        VALUES (p_user_id, v_challenge.id, p_gym_id, p_drops_earned, p_session_date)
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          current_drops = CASE
            -- If same day, add to existing drops
            WHEN challenge_progress.last_activity_date = p_session_date 
              THEN challenge_progress.current_drops + p_drops_earned
            -- If different day, reset to today's drops
            ELSE p_drops_earned
          END,
          last_activity_date = p_session_date,
          is_completed = false,
          completed_at = NULL,
          updated_at = NOW()
        RETURNING id, current_drops, is_completed INTO v_progress_id, v_current_drops, v_was_completed;
        
        -- Check if completed now
        IF v_current_drops >= v_challenge.target_drops AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
        END IF;
        
        -- Return result
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_current_drops,
          v_challenge.target_drops,
          COALESCE(v_completed_now, v_was_completed),
          v_completed_now,
          v_challenge.reward_drops;
      
      WHEN 'weekly', 'monthly' THEN
        -- Weekly/Monthly: Cumulative drops in date range
        -- Sum drops from start_date to end_date
        
        -- Get or create progress record
        INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_drops, last_activity_date)
        VALUES (p_user_id, v_challenge.id, p_gym_id, p_drops_earned, p_session_date)
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          current_drops = challenge_progress.current_drops + p_drops_earned,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, current_drops, is_completed INTO v_progress_id, v_current_drops, v_was_completed;
        
        -- Check if completed now
        IF v_current_drops >= v_challenge.target_drops AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
        END IF;
        
        -- Return result
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_current_drops,
          v_challenge.target_drops,
          COALESCE(v_completed_now, v_was_completed),
          v_completed_now,
          v_challenge.reward_drops;
      
      WHEN 'streak' THEN
        -- Streak: Consecutive days with at least 1 drop
        -- If p_session_date is the day after last_activity_date, increment streak
        -- If p_session_date is more than 1 day after, reset streak to 1
        -- If same day, don't increment (already counted)
        
        -- Get or create progress record with atomic streak update
        INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_streak_days, last_activity_date)
        VALUES (p_user_id, v_challenge.id, p_gym_id, 1, p_session_date)
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          current_streak_days = CASE
            -- If same day, don't increment (already counted)
            WHEN challenge_progress.last_activity_date = p_session_date 
              THEN challenge_progress.current_streak_days
            -- If next day, increment streak
            WHEN challenge_progress.last_activity_date = p_session_date - INTERVAL '1 day' 
              THEN challenge_progress.current_streak_days + 1
            -- If gap (more than 1 day), reset to 1
            ELSE 1
          END,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, current_streak_days, is_completed INTO v_progress_id, v_current_streak, v_was_completed;
        
        -- Check if completed now (streak_days must be set)
        IF v_challenge.streak_days IS NOT NULL 
          AND v_current_streak >= v_challenge.streak_days 
          AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
        END IF;
        
        -- Return result (for streak, current_progress is streak_days, target is streak_days)
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_current_streak,
          COALESCE(v_challenge.streak_days, 0),
          COALESCE(v_completed_now, v_was_completed),
          v_completed_now,
          v_challenge.reward_drops;
      
      WHEN 'milestone' THEN
        -- Milestone: All-time drops in gym
        -- Query gym_memberships.local_drops_balance for total all-time drops
        
        -- Get current all-time balance from gym_memberships
        SELECT COALESCE(local_drops_balance, 0) INTO v_milestone_balance
        FROM public.gym_memberships
        WHERE user_id = p_user_id
          AND gym_id = p_gym_id;
        
        -- Get or create progress record (for milestone, we track completion status)
        INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_drops, last_activity_date)
        VALUES (p_user_id, v_challenge.id, p_gym_id, v_milestone_balance, p_session_date)
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          current_drops = v_milestone_balance,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, is_completed INTO v_progress_id, v_was_completed;
        
        -- Check if completed now
        IF v_challenge.milestone_threshold IS NOT NULL 
          AND v_milestone_balance >= v_challenge.milestone_threshold 
          AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
        END IF;
        
        -- Return result
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_milestone_balance,
          COALESCE(v_challenge.milestone_threshold, 0),
          COALESCE(v_completed_now, v_was_completed),
          v_completed_now,
          v_challenge.reward_drops;
      
      ELSE
        -- Unknown challenge type - skip
        CONTINUE;
    END CASE;
    
    -- Award badge if challenge was just completed
    IF v_completed_now THEN
      INSERT INTO public.user_badges (user_id, challenge_id, earned_at)
      VALUES (p_user_id, v_challenge.id, NOW())
      ON CONFLICT (user_id, challenge_id) DO NOTHING; -- Prevent duplicate badges
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, DATE) TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.update_challenge_progress IS 'Unified function that handles all 5 challenge types (daily, weekly, monthly, streak, milestone). Automatically awards badges when challenges are completed. Returns progress information for each challenge.';
