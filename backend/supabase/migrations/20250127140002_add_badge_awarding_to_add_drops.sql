-- Add Badge Awarding to add_drops() Function Migration
-- Modifies add_drops() function to automatically award badges when challenges are completed

-- Modify add_drops() function to award badges when challenges are completed
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
  IF p_transaction_type != 'challenge' THEN
    -- Update challenge progress (using local drops for challenge tracking)
    UPDATE public.challenge_progress cp
    SET current_drops = current_drops + p_amount,
        updated_at = NOW()
    FROM public.challenges c
    WHERE cp.challenge_id = c.id
      AND cp.user_id = p_user_id
      AND c.is_active = true
      AND c.start_date <= CURRENT_DATE
      AND c.end_date >= CURRENT_DATE
      AND cp.is_completed = false
      AND c.gym_id = p_gym_id; -- Only update challenge for the gym where drops were earned

    -- Mark completed challenges
    UPDATE public.challenge_progress cp
    SET is_completed = true,
        completed_at = NOW(),
        updated_at = NOW()
    FROM public.challenges c
    WHERE cp.challenge_id = c.id
      AND cp.user_id = p_user_id
      AND cp.is_completed = false
      AND cp.current_drops >= c.target_drops
      AND c.gym_id = p_gym_id;

    -- Award badges for newly completed challenges
    -- Insert badge into user_badges table if it doesn't already exist
    INSERT INTO public.user_badges (user_id, challenge_id, earned_at)
    SELECT 
      p_user_id,
      cp.challenge_id,
      NOW()
    FROM public.challenge_progress cp
    JOIN public.challenges c ON cp.challenge_id = c.id
    WHERE cp.user_id = p_user_id
      AND cp.is_completed = true
      AND cp.completed_at = NOW()
      AND c.gym_id = p_gym_id
    ON CONFLICT (user_id, challenge_id) DO NOTHING; -- Prevent duplicate badges

    -- Award challenge rewards (both global and local) for newly completed challenges
    WITH completed_challenges AS (
      SELECT cp.challenge_id, c.gym_id, c.reward_drops, c.name
      FROM public.challenge_progress cp
      JOIN public.challenges c ON cp.challenge_id = c.id
      WHERE cp.user_id = p_user_id
        AND cp.is_completed = true
        AND cp.completed_at = NOW()
        AND c.gym_id = p_gym_id
    )
    INSERT INTO public.drops_transactions (user_id, amount, transaction_type, reference_id, description)
    SELECT p_user_id, reward_drops, 'challenge', challenge_id, 'Challenge reward: ' || name
    FROM completed_challenges
    ON CONFLICT DO NOTHING;

    -- Add challenge reward drops (both global and local) for newly completed challenges
    -- Use a loop to call add_drops for each completed challenge
    FOR v_challenge_record IN (
      SELECT cp.challenge_id, c.gym_id, c.reward_drops
      FROM public.challenge_progress cp
      JOIN public.challenges c ON cp.challenge_id = c.id
      WHERE cp.user_id = p_user_id
        AND cp.is_completed = true
        AND cp.completed_at = NOW()
        AND c.gym_id = p_gym_id
    ) LOOP
      PERFORM public.add_drops(
        p_user_id,
        v_challenge_record.gym_id,
        v_challenge_record.reward_drops,
        'challenge',
        v_challenge_record.challenge_id,
        'Challenge reward'
      );
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON FUNCTION public.add_drops IS 'Adds drops to both global (profiles.total_drops) and local (gym_memberships.local_drops_balance) balances. Automatically updates challenge progress and awards badges when challenges are completed. Badges are awarded only once per challenge (enforced by unique constraint on user_badges table).';
