-- Dual-Wallet Drops System Migration
-- This creates gym_memberships table to track local drops balance per gym

-- Create gym_memberships table
CREATE TABLE IF NOT EXISTS public.gym_memberships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  local_drops_balance INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, gym_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_gym_memberships_user_id ON public.gym_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_gym_memberships_gym_id ON public.gym_memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_memberships_user_gym ON public.gym_memberships(user_id, gym_id);

-- Enable Row Level Security
ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gym_memberships
CREATE POLICY "Users can view own gym memberships"
  ON public.gym_memberships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view other users' memberships (for leaderboards)"
  ON public.gym_memberships FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own gym memberships"
  ON public.gym_memberships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gym memberships"
  ON public.gym_memberships FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to get or create gym membership
CREATE OR REPLACE FUNCTION public.get_or_create_gym_membership(p_user_id UUID, p_gym_id UUID)
RETURNS UUID AS $$
DECLARE
  v_membership_id UUID;
BEGIN
  -- Try to get existing membership
  SELECT id INTO v_membership_id
  FROM public.gym_memberships
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  -- If not found, create one
  IF v_membership_id IS NULL THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (p_user_id, p_gym_id, 0)
    RETURNING id INTO v_membership_id;
  END IF;

  RETURN v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the old add_drops function first (if it exists with old signature)
-- Old signature: add_drops(p_user_id UUID, p_amount INTEGER, p_transaction_type TEXT, p_reference_id UUID, p_description TEXT)
DROP FUNCTION IF EXISTS public.add_drops(UUID, INTEGER, TEXT, UUID, TEXT) CASCADE;

-- Function to add drops (both global and local)
-- This replaces the old add_drops function to support dual-wallet system
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

-- Function to spend drops (local only)
CREATE OR REPLACE FUNCTION public.spend_local_drops(
  p_user_id UUID,
  p_gym_id UUID,
  p_amount INTEGER,
  p_reward_id UUID,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_membership_id UUID;
  v_current_balance INTEGER;
BEGIN
  -- Get or create gym membership
  v_membership_id := public.get_or_create_gym_membership(p_user_id, p_gym_id);

  -- Get current balance
  SELECT local_drops_balance INTO v_current_balance
  FROM public.gym_memberships
  WHERE id = v_membership_id;

  -- Check if user has enough drops
  IF v_current_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  -- Deduct from local balance
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - p_amount,
      updated_at = NOW()
  WHERE id = v_membership_id;

  -- Record transaction (negative amount)
  INSERT INTO public.drops_transactions (
    user_id,
    amount,
    transaction_type,
    reference_id,
    description
  )
  VALUES (
    p_user_id,
    -p_amount,
    'reward',
    p_reward_id,
    p_description
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update end_session function to use new dual-wallet add_drops
-- Drop old version first
DROP FUNCTION IF EXISTS public.end_session(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.end_session(
  p_session_id UUID,
  p_drops_earned INTEGER
)
RETURNS void AS $$
DECLARE
  v_user_id UUID;
  v_gym_id UUID;
BEGIN
  -- Get user_id and gym_id from session
  SELECT user_id, gym_id INTO v_user_id, v_gym_id
  FROM public.sessions
  WHERE id = p_session_id;

  -- Verify that session exists and has required data
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Session % is missing gym_id', p_session_id;
  END IF;

  -- Update session
  UPDATE public.sessions
  SET ended_at = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
      drops_earned = p_drops_earned,
      is_active = false,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Add drops (both global and local) using new dual-wallet function
  PERFORM public.add_drops(
    v_user_id,
    v_gym_id,
    p_drops_earned,
    'session',
    p_session_id,
    'Workout session'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON TABLE public.gym_memberships IS 'Tracks user membership and local drops balance per gym';
COMMENT ON COLUMN public.gym_memberships.local_drops_balance IS 'Drops balance specific to this gym. Cannot be used in other gyms.';
COMMENT ON FUNCTION add_drops IS 'Adds drops to both global (profiles.total_drops) and local (gym_memberships.local_drops_balance) balances';
COMMENT ON FUNCTION spend_local_drops IS 'Spends local drops from gym_memberships. Returns true if successful, false if insufficient balance';
