-- Add Debug Logging and Fix Challenge Progress Function
-- This migration adds comprehensive debug logging and fixes potential issues:
-- 1. Adds RAISE LOG statements to track function execution
-- 2. Verifies gym_id matching between challenges and function parameter
-- 3. Ensures INSERT ... ON CONFLICT works correctly for new users
-- 4. Adds logging to see if challenges are found and processed

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
  v_challenges_found INTEGER := 0;
  v_challenges_processed INTEGER := 0;
BEGIN
  -- Debug: Log function call
  RAISE LOG 'update_challenge_progress called: user_id=%, gym_id=%, drops_earned=%, session_date=%', 
    p_user_id, p_gym_id, p_drops_earned, p_session_date;
  
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE LOG 'ERROR: p_user_id is NULL';
    RETURN;
  END IF;
  
  IF p_gym_id IS NULL THEN
    RAISE LOG 'ERROR: p_gym_id is NULL';
    RETURN;
  END IF;
  
  IF p_drops_earned IS NULL OR p_drops_earned <= 0 THEN
    RAISE LOG 'WARNING: p_drops_earned is NULL or <= 0: %', p_drops_earned;
    RETURN;
  END IF;
  
  -- Temporarily disable RLS for this function execution
  PERFORM set_config('row_security', 'off', true);
  
  -- Count active challenges for this gym
  SELECT COUNT(*) INTO v_challenges_found
  FROM public.challenges c
  WHERE c.gym_id = p_gym_id
    AND c.is_active = true
    AND c.start_date <= p_session_date
    AND c.end_date >= p_session_date;
  
  RAISE LOG 'Found % active challenges for gym_id=% and session_date=%', 
    v_challenges_found, p_gym_id, p_session_date;
  
  -- If no challenges found, log and return
  IF v_challenges_found = 0 THEN
    RAISE LOG 'No active challenges found for gym_id=% and session_date=%. Check: is_active=true, start_date<=%, end_date>=%', 
      p_gym_id, p_session_date, p_session_date, p_session_date;
    RETURN;
  END IF;
  
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
      c.end_date,
      c.gym_id  -- Include gym_id to verify matching
    FROM public.challenges c
    WHERE c.gym_id = p_gym_id
      AND c.is_active = true
      AND c.start_date <= p_session_date
      AND c.end_date >= p_session_date
  LOOP
    v_challenges_processed := v_challenges_processed + 1;
    
    -- Debug: Log challenge being processed
    RAISE LOG 'Processing challenge % (type: %, name: %) for user %', 
      v_challenge.id, v_challenge.challenge_type, v_challenge.name, p_user_id;
    
    -- Verify gym_id matches
    IF v_challenge.gym_id != p_gym_id THEN
      RAISE LOG 'ERROR: Challenge gym_id (%) does not match p_gym_id (%)', 
        v_challenge.gym_id, p_gym_id;
      CONTINUE;
    END IF;
    
    v_completed_now := false;
    v_was_completed := false;
    
    -- Handle each challenge type differently
    CASE v_challenge.challenge_type
      WHEN 'daily' THEN
        RAISE LOG 'Updating daily challenge % for user %', v_challenge.id, p_user_id;
        
        -- Get or create progress record (UPSERT)
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
        
        RAISE LOG 'Daily challenge updated: progress_id=%, current_drops=%, was_completed=%', 
          v_progress_id, v_current_drops, v_was_completed;
        
        -- Check if completed now (only if not already completed)
        IF v_current_drops >= v_challenge.target_drops AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG 'Daily challenge % completed!', v_challenge.id;
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
        RAISE LOG 'Updating % challenge % for user %', v_challenge.challenge_type, v_challenge.id, p_user_id;
        
        -- Get or create progress record (UPSERT)
        INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_drops, last_activity_date)
        VALUES (p_user_id, v_challenge.id, p_gym_id, p_drops_earned, p_session_date)
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          current_drops = challenge_progress.current_drops + p_drops_earned,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, current_drops, is_completed INTO v_progress_id, v_current_drops, v_was_completed;
        
        RAISE LOG '% challenge updated: progress_id=%, current_drops=%, was_completed=%', 
          v_challenge.challenge_type, v_progress_id, v_current_drops, v_was_completed;
        
        -- Check if completed now (only if not already completed)
        IF v_current_drops >= v_challenge.target_drops AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG '% challenge % completed!', v_challenge.challenge_type, v_challenge.id;
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
        RAISE LOG 'Updating streak challenge % for user %', v_challenge.id, p_user_id;
        
        -- Get or create progress record with atomic streak update (UPSERT)
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
        
        RAISE LOG 'Streak challenge updated: progress_id=%, current_streak=%, was_completed=%', 
          v_progress_id, v_current_streak, v_was_completed;
        
        -- Check if completed now (streak_days must be set, only if not already completed)
        IF v_challenge.streak_days IS NOT NULL 
          AND v_current_streak >= v_challenge.streak_days 
          AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG 'Streak challenge % completed!', v_challenge.id;
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
        RAISE LOG 'Updating milestone challenge % for user %', v_challenge.id, p_user_id;
        
        -- Get current all-time balance from gym_memberships
        SELECT COALESCE(local_drops_balance, 0) INTO v_milestone_balance
        FROM public.gym_memberships
        WHERE user_id = p_user_id
          AND gym_id = p_gym_id;
        
        RAISE LOG 'Milestone balance for user % in gym %: %', p_user_id, p_gym_id, v_milestone_balance;
        
        -- Get or create progress record (for milestone, we track completion status) (UPSERT)
        INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_drops, last_activity_date)
        VALUES (p_user_id, v_challenge.id, p_gym_id, v_milestone_balance, p_session_date)
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          current_drops = v_milestone_balance,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, is_completed INTO v_progress_id, v_was_completed;
        
        RAISE LOG 'Milestone challenge updated: progress_id=%, current_drops=%, was_completed=%', 
          v_progress_id, v_milestone_balance, v_was_completed;
        
        -- Check if completed now (only if not already completed)
        IF v_challenge.milestone_threshold IS NOT NULL 
          AND v_milestone_balance >= v_challenge.milestone_threshold 
          AND NOT v_was_completed THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG 'Milestone challenge % completed!', v_challenge.id;
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
        RAISE LOG 'WARNING: Unknown challenge type % for challenge %', v_challenge.challenge_type, v_challenge.id;
        CONTINUE;
    END CASE;
    
    -- Award badge if challenge was just completed
    IF v_completed_now THEN
      RAISE LOG 'Awarding badge for challenge % to user %', v_challenge.id, p_user_id;
      INSERT INTO public.user_badges (user_id, challenge_id, earned_at)
      VALUES (p_user_id, v_challenge.id, NOW())
      ON CONFLICT (user_id, challenge_id) DO NOTHING; -- Prevent duplicate badges
    END IF;
  END LOOP;
  
  -- Summary log
  RAISE LOG 'update_challenge_progress completed: processed % out of % challenges for user % in gym %', 
    v_challenges_processed, v_challenges_found, p_user_id, p_gym_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, DATE) TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.update_challenge_progress IS 'Unified function that handles all 5 challenge types (daily, weekly, monthly, streak, milestone). Automatically awards badges when challenges are completed. Uses set_config to disable RLS for insert/update operations. Includes comprehensive debug logging - check Supabase logs for RAISE LOG messages. Returns progress information for each challenge.';
