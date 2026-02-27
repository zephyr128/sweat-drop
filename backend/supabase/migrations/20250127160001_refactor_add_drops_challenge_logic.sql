-- Refactor add_drops() Challenge Logic Migration
-- Replaces old challenge progress logic with call to unified update_challenge_progress() function
-- Makes add_drops() simpler and more maintainable

CREATE OR REPLACE FUNCTION public.add_drops(
  p_user_id UUID,
  p_gym_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_membership_id UUID;
  v_challenge_record RECORD;
BEGIN
  -- Update global balance
  UPDATE public.profiles
  SET total_drops = total_drops + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Only update local balance if gym_id is provided
  IF p_gym_id IS NOT NULL THEN
    -- Get or create gym membership
    v_membership_id := public.get_or_create_gym_membership(p_user_id, p_gym_id);

    -- Update local balance
    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance + p_amount,
        updated_at = NOW()
    WHERE id = v_membership_id;
  END IF;

  -- Record transaction
  INSERT INTO public.drops_transactions (
    user_id,
    amount,
    transaction_type,
    reference_id,
    description
  )
  VALUES (
    p_user_id,
    p_amount,
    p_transaction_type,
    p_reference_id,
    p_description
  );

  -- Only update challenge progress if this is not a challenge reward itself (to avoid recursion)
  IF p_transaction_type != 'challenge' AND p_gym_id IS NOT NULL THEN
    -- Update challenge progress using unified function
    -- This function handles all challenge types (daily, weekly, monthly, streak, milestone)
    -- and automatically awards badges when challenges are completed
    PERFORM public.update_challenge_progress(
      p_user_id,
      p_gym_id,
      p_amount,
      CURRENT_DATE
    );
    
    -- Award reward drops for newly completed challenges
    -- Loop through challenges that were just completed
    FOR v_challenge_record IN (
      SELECT 
        cp.challenge_id, 
        c.gym_id, 
        c.reward_drops,
        c.name
      FROM public.challenge_progress cp
      JOIN public.challenges c ON cp.challenge_id = c.id
      WHERE cp.user_id = p_user_id
        AND cp.is_completed = true
        AND cp.completed_at = NOW()  -- Only newly completed (completed just now)
        AND c.gym_id = p_gym_id
    ) LOOP
      -- Award reward drops (both global and local)
      -- Use recursive call to add_drops with 'challenge' type to prevent infinite loop
      PERFORM public.add_drops(
        p_user_id,
        v_challenge_record.gym_id,
        v_challenge_record.reward_drops,
        'challenge',
        v_challenge_record.challenge_id,
        'Challenge reward: ' || v_challenge_record.name
      );
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON FUNCTION public.add_drops IS 'Adds drops to both global (profiles.total_drops) and local (gym_memberships.local_drops_balance) balances. Automatically updates challenge progress using unified update_challenge_progress() function which handles all challenge types. Awards reward drops and badges when challenges are completed.';
