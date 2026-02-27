-- Rewrite update_challenge_progress Function with Strict UPSERT Logic
-- Fixes issue where challenge_progress table is empty because logic uses UPDATE instead of UPSERT
-- Ensures progress records are always created if they don't exist

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
  v_was_completed_val BOOLEAN;  -- Renamed to avoid ambiguity with column name
  v_completed_now BOOLEAN;
  v_current_drops INTEGER;
  v_current_streak INTEGER;
  v_milestone_balance INTEGER;
  v_challenges_found INTEGER := 0;
  v_challenges_processed INTEGER := 0;
  v_challenge_id_val UUID;  -- Explicit variable to avoid ambiguity
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
      c.gym_id
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
    v_was_completed_val := false;
    
    -- Store challenge_id in explicit variable to avoid ambiguity in ON CONFLICT
    v_challenge_id_val := v_challenge.id;
    
    -- Handle each challenge type differently with STRICT UPSERT logic
    CASE v_challenge.challenge_type
      WHEN 'daily' THEN
        RAISE LOG 'Updating daily challenge % for user %', v_challenge.id, p_user_id;
        
        -- Atomic UPSERT: Create if doesn't exist, update if exists
        INSERT INTO public.challenge_progress (
          user_id, 
          challenge_id, 
          gym_id, 
          current_drops, 
          last_activity_date,
          current_streak_days
        )
        VALUES (
          p_user_id, 
          v_challenge_id_val, 
          p_gym_id, 
          p_drops_earned, 
          p_session_date,
          0
        )
        ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key
        DO UPDATE SET
          current_drops = CASE
            -- If last_activity_date < CURRENT_DATE -> Reset to today's drops
            WHEN challenge_progress.last_activity_date < p_session_date 
              THEN p_drops_earned
            -- Otherwise (same day) -> Add to existing drops
            ELSE challenge_progress.current_drops + p_drops_earned
          END,
          last_activity_date = p_session_date,
          is_completed = false,
          completed_at = NULL,
          updated_at = NOW()
        RETURNING id, challenge_progress.current_drops, challenge_progress.is_completed INTO v_progress_id, v_current_drops, v_was_completed_val;
        
        RAISE LOG 'Daily challenge updated: progress_id=%, current_drops=%, was_completed=%', 
          v_progress_id, v_current_drops, v_was_completed_val;
        
        -- Check if completed now (only if not already completed)
        IF v_current_drops >= v_challenge.target_drops AND NOT v_was_completed_val THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG 'Daily challenge % completed! Current drops: %, Target: %', 
            v_challenge.id, v_current_drops, v_challenge.target_drops;
        END IF;
        
        -- Return result
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_current_drops,
          v_challenge.target_drops,
          COALESCE(v_completed_now, v_was_completed_val),
          v_completed_now,
          v_challenge.reward_drops;
      
      WHEN 'weekly', 'monthly' THEN
        RAISE LOG 'Updating % challenge % for user %', v_challenge.challenge_type, v_challenge.id, p_user_id;
        
        -- Atomic UPSERT: Create if doesn't exist, update if exists
        -- For weekly/monthly: Just sum drops (no reset logic)
        INSERT INTO public.challenge_progress (
          user_id, 
          challenge_id, 
          gym_id, 
          current_drops, 
          last_activity_date,
          current_streak_days
        )
        VALUES (
          p_user_id, 
          v_challenge_id_val, 
          p_gym_id, 
          p_drops_earned, 
          p_session_date,
          0
        )
        ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key
        DO UPDATE SET
          current_drops = challenge_progress.current_drops + p_drops_earned,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, challenge_progress.current_drops, challenge_progress.is_completed INTO v_progress_id, v_current_drops, v_was_completed_val;
        
        RAISE LOG '% challenge updated: progress_id=%, current_drops=%, was_completed=%', 
          v_challenge.challenge_type, v_progress_id, v_current_drops, v_was_completed_val;
        
        -- Check if completed now (only if not already completed)
        IF v_current_drops >= v_challenge.target_drops AND NOT v_was_completed_val THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG '% challenge % completed! Current drops: %, Target: %', 
            v_challenge.challenge_type, v_challenge.id, v_current_drops, v_challenge.target_drops;
        END IF;
        
        -- Return result
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_current_drops,
          v_challenge.target_drops,
          COALESCE(v_completed_now, v_was_completed_val),
          v_completed_now,
          v_challenge.reward_drops;
      
      WHEN 'streak' THEN
        RAISE LOG 'Updating streak challenge % for user %', v_challenge.id, p_user_id;
        
        -- Atomic UPSERT: Create if doesn't exist, update if exists
        -- Strict streak logic:
        -- - If last_activity_date IS NULL (first training) -> current_streak_days = 1
        -- - If last_activity_date == CURRENT_DATE -> Don't change streak (already recorded today)
        -- - If last_activity_date == CURRENT_DATE - 1 -> current_streak_days = current_streak_days + 1
        -- - Otherwise (gap > 1 day) -> current_streak_days = 1
        INSERT INTO public.challenge_progress (
          user_id, 
          challenge_id, 
          gym_id, 
          current_streak_days, 
          last_activity_date,
          current_drops
        )
        VALUES (
          p_user_id, 
          v_challenge.id, 
          p_gym_id, 
          1,  -- First time: streak = 1
          p_session_date,
          0
        )
        ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key
        DO UPDATE SET
          current_streak_days = CASE
            -- If last_activity_date IS NULL (first training) -> Set to 1
            WHEN challenge_progress.last_activity_date IS NULL THEN 1
            -- If last_activity_date == CURRENT_DATE -> Don't change (already recorded today)
            WHEN challenge_progress.last_activity_date = p_session_date 
              THEN challenge_progress.current_streak_days
            -- If last_activity_date == CURRENT_DATE - 1 -> Increment by 1
            WHEN challenge_progress.last_activity_date = p_session_date - INTERVAL '1 day' 
              THEN challenge_progress.current_streak_days + 1
            -- Otherwise (gap > 1 day) -> Reset to 1
            ELSE 1
          END,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, challenge_progress.current_streak_days, challenge_progress.is_completed INTO v_progress_id, v_current_streak, v_was_completed_val;
        
        -- Debug: Log streak update
        RAISE NOTICE 'Streak update for user %: current value %', p_user_id, v_current_streak;
        RAISE LOG 'Streak challenge updated: progress_id=%, current_streak=%, was_completed=%', 
          v_progress_id, v_current_streak, v_was_completed_val;
        
        -- Check if completed now (only if not already completed)
        -- Return completed_now = true ONLY when streak reaches target
        IF v_challenge.streak_days IS NOT NULL 
          AND v_current_streak >= v_challenge.streak_days 
          AND NOT v_was_completed_val THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG 'Streak challenge % completed! Current streak: %, Target: %', 
            v_challenge.id, v_current_streak, v_challenge.streak_days;
        END IF;
        
        -- Return result (for streak, current_progress is streak_days, target is streak_days)
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_current_streak,
          COALESCE(v_challenge.streak_days, 0),
          COALESCE(v_completed_now, v_was_completed_val),
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
        
        -- Atomic UPSERT: Create if doesn't exist, update if exists
        INSERT INTO public.challenge_progress (
          user_id, 
          challenge_id, 
          gym_id, 
          current_drops, 
          last_activity_date,
          current_streak_days
        )
        VALUES (
          p_user_id, 
          v_challenge.id, 
          p_gym_id, 
          v_milestone_balance, 
          p_session_date,
          0
        )
        ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key
        DO UPDATE SET
          current_drops = v_milestone_balance,
          last_activity_date = p_session_date,
          updated_at = NOW()
        RETURNING id, challenge_progress.is_completed INTO v_progress_id, v_was_completed_val;
        
        RAISE LOG 'Milestone challenge updated: progress_id=%, current_drops=%, was_completed=%', 
          v_progress_id, v_milestone_balance, v_was_completed_val;
        
        -- Check if completed now (only if not already completed)
        IF v_challenge.milestone_threshold IS NOT NULL 
          AND v_milestone_balance >= v_challenge.milestone_threshold 
          AND NOT v_was_completed_val THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = v_progress_id;
          v_completed_now := true;
          RAISE LOG 'Milestone challenge % completed! Current balance: %, Target: %', 
            v_challenge.id, v_milestone_balance, v_challenge.milestone_threshold;
        END IF;
        
        -- Return result
        RETURN QUERY
        SELECT
          v_challenge.id,
          v_challenge.name,
          v_challenge.challenge_type,
          v_milestone_balance,
          COALESCE(v_challenge.milestone_threshold, 0),
          COALESCE(v_completed_now, v_was_completed_val),
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
      VALUES (p_user_id, v_challenge_id_val, NOW())
      ON CONFLICT ON CONSTRAINT user_badges_user_id_challenge_id_key DO NOTHING; -- Prevent duplicate badges
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
COMMENT ON FUNCTION public.update_challenge_progress IS 'Unified function that handles all 5 challenge types (daily, weekly, monthly, streak, milestone) using STRICT UPSERT logic. Always creates progress records if they don''t exist. Streak logic: NULL->1, same day->no change, next day->+1, gap->reset to 1. Daily logic: different day->reset, same day->add. Weekly/monthly: just sum. Returns completed_now=true only when threshold is reached. Uses SECURITY DEFINER to bypass RLS.';
