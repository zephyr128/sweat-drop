-- Migration: 20250128000008_update_add_drops_function.sql
-- Description: Updates add_drops function to use gym_challenges instead of challenges table
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Updated add_drops() function to use gym_challenges instead of challenges
-- - All references to public.challenges changed to public.gym_challenges
-- 
-- IMPACT ON FRONTEND:
-- - No frontend changes required (function is called internally)
-- 
-- BREAKING CHANGES:
-- - None (internal function only)
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Test: Verify challenge progress updates correctly

-- Update add_drops function to use gym_challenges
CREATE OR REPLACE FUNCTION public.add_drops(
  p_user_id UUID,
  p_gym_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Update profile total
  UPDATE public.profiles
  SET total_drops = total_drops + p_amount
  WHERE id = p_user_id;

  -- Update gym membership local balance
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND gym_id = p_gym_id;

  -- Insert transaction record
  INSERT INTO public.drops_transactions (user_id, amount, transaction_type, reference_id, description)
  VALUES (p_user_id, p_amount, p_transaction_type, p_reference_id, p_description);

  -- Only update challenge progress if this is not a challenge reward itself (to avoid recursion)
  IF p_transaction_type != 'challenge' THEN
    -- Update challenge progress (using local drops for challenge tracking)
    UPDATE public.challenge_progress cp
    SET current_drops = current_drops + p_amount,
        updated_at = NOW()
    FROM public.gym_challenges c
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
    FROM public.gym_challenges c
    WHERE cp.challenge_id = c.id
      AND cp.user_id = p_user_id
      AND cp.is_completed = false
      AND cp.current_drops >= c.target_drops
      AND c.gym_id = p_gym_id;

    -- Award challenge rewards (both global and local) for newly completed challenges
    WITH completed_challenges AS (
      SELECT cp.challenge_id, c.gym_id, c.reward_drops, c.name
      FROM public.challenge_progress cp
      JOIN public.gym_challenges c ON cp.challenge_id = c.id
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
      JOIN public.gym_challenges c ON cp.challenge_id = c.id
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

-- Comments
COMMENT ON FUNCTION public.add_drops IS 'Adds drops to user profile and gym membership. Updates challenge progress using gym_challenges table. Awards challenge rewards when challenges are completed.';
