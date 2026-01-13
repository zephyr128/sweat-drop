-- Secure Redemption System
-- Enhanced redemption flow with validations, refunds, and better security

-- 1. Add redemption_code (unique QR code for validation)
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS redemption_code TEXT UNIQUE;

-- 2. Add cancelled_by and cancellation_reason
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 3. Create index for redemption_code
CREATE INDEX IF NOT EXISTS idx_redemptions_code ON public.redemptions(redemption_code);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON public.redemptions(status);
CREATE INDEX IF NOT EXISTS idx_redemptions_gym_status ON public.redemptions(gym_id, status);

-- 4. Function to generate unique redemption code
CREATE OR REPLACE FUNCTION public.generate_redemption_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- Generate code: RED-{8 chars uppercase}
    v_code := 'RED-' || upper(substring(gen_random_uuid()::text from 1 for 8));
    
    -- Check if it exists
    SELECT EXISTS(SELECT 1 FROM public.redemptions WHERE redemption_code = v_code) INTO v_exists;
    
    -- Exit if unique or after 10 attempts
    EXIT WHEN NOT v_exists OR v_attempts >= 10;
  END LOOP;
  
  -- If still exists, append timestamp
  IF v_exists THEN
    v_code := 'RED-' || upper(substring(gen_random_uuid()::text from 1 for 8)) || '-' || to_char(EXTRACT(EPOCH FROM NOW())::bigint, 'FM9999999999');
  END IF;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- 5. Enhanced function to create redemption with validation
CREATE OR REPLACE FUNCTION public.create_redemption(
  p_user_id UUID,
  p_reward_id UUID,
  p_gym_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  redemption_id UUID,
  redemption_code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_reward RECORD;
  v_user_balance INTEGER;
  v_membership_id UUID;
  v_redemption_id UUID;
  v_redemption_code TEXT;
BEGIN
  -- Get reward details
  SELECT * INTO v_reward
  FROM public.rewards
  WHERE id = p_reward_id
    AND gym_id = p_gym_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward not found or inactive'::TEXT;
    RETURN;
  END IF;

  -- Check stock
  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is out of stock'::TEXT;
    RETURN;
  END IF;

  -- Get user's local balance
  v_membership_id := public.get_or_create_gym_membership(p_user_id, p_gym_id);
  
  SELECT local_drops_balance INTO v_user_balance
  FROM public.gym_memberships
  WHERE id = v_membership_id;

  -- Check balance
  IF v_user_balance < v_reward.price_drops THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 
      format('Insufficient drops. You have %s, need %s', v_user_balance, v_reward.price_drops)::TEXT;
    RETURN;
  END IF;

  -- Generate redemption code
  v_redemption_code := public.generate_redemption_code();

  -- Spend drops first (atomic operation)
  IF NOT public.spend_local_drops(
    p_user_id,
    p_gym_id,
    v_reward.price_drops,
    p_reward_id,
    format('Redeemed: %s', v_reward.name)
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Failed to deduct drops'::TEXT;
    RETURN;
  END IF;

  -- Create redemption record
  INSERT INTO public.redemptions (
    user_id,
    reward_id,
    gym_id,
    drops_spent,
    status,
    redemption_code
  )
  VALUES (
    p_user_id,
    p_reward_id,
    p_gym_id,
    v_reward.price_drops,
    'pending',
    v_redemption_code
  )
  RETURNING id INTO v_redemption_id;

  -- Decrease stock if limited
  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards
    SET stock = stock - 1,
        updated_at = NOW()
    WHERE id = p_reward_id;
  END IF;

  RETURN QUERY SELECT true, v_redemption_id, v_redemption_code, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to confirm redemption
CREATE OR REPLACE FUNCTION public.confirm_redemption(
  p_redemption_id UUID,
  p_confirmed_by UUID
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_redemption RECORD;
BEGIN
  -- Get redemption
  SELECT * INTO v_redemption
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Redemption not found'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status != 'pending' THEN
    RETURN QUERY SELECT false, format('Redemption is already %s', v_redemption.status)::TEXT;
    RETURN;
  END IF;

  -- Confirm redemption
  UPDATE public.redemptions
  SET status = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_redemption_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to cancel redemption with refund
CREATE OR REPLACE FUNCTION public.cancel_redemption(
  p_redemption_id UUID,
  p_cancelled_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_redemption RECORD;
BEGIN
  -- Get redemption
  SELECT * INTO v_redemption
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Redemption not found'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status = 'confirmed' THEN
    RETURN QUERY SELECT false, 'Cannot cancel confirmed redemption'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status = 'cancelled' THEN
    RETURN QUERY SELECT false, 'Redemption is already cancelled'::TEXT;
    RETURN;
  END IF;

  -- Refund drops
  PERFORM public.add_drops(
    v_redemption.user_id,
    v_redemption.gym_id,
    v_redemption.drops_spent,
    'refund',
    v_redemption.reward_id,
    format('Refund: %s', COALESCE(p_reason, 'Redemption cancelled'))
  );

  -- Restore stock if limited
  UPDATE public.rewards
  SET stock = COALESCE(stock, 0) + 1,
      updated_at = NOW()
  WHERE id = v_redemption.reward_id
    AND stock IS NOT NULL;

  -- Cancel redemption
  UPDATE public.redemptions
  SET status = 'cancelled',
      cancelled_by = p_cancelled_by,
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_redemption_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to find redemption by code (for QR scanning)
CREATE OR REPLACE FUNCTION public.find_redemption_by_code(
  p_code TEXT
)
RETURNS TABLE(
  redemption_id UUID,
  user_id UUID,
  username TEXT,
  reward_name TEXT,
  reward_type TEXT,
  drops_spent INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  gym_id UUID,
  gym_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.user_id,
    p.username,
    rew.name,
    rew.reward_type,
    r.drops_spent,
    r.status,
    r.created_at,
    r.gym_id,
    g.name
  FROM public.redemptions r
  JOIN public.profiles p ON r.user_id = p.id
  JOIN public.rewards rew ON r.reward_id = rew.id
  JOIN public.gyms g ON r.gym_id = g.id
  WHERE r.redemption_code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Update RLS policies for redemptions
DROP POLICY IF EXISTS "Users can view own redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Users can insert own redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Gym staff can view gym redemptions" ON public.redemptions;

-- Users can view their own redemptions
CREATE POLICY "Users can view own redemptions"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own redemptions (via function)
CREATE POLICY "Users can insert own redemptions"
  ON public.redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Gym admins and receptionists can view redemptions for their gym
CREATE POLICY "Gym staff can view gym redemptions"
  ON public.redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (
        (profiles.role = 'gym_admin' AND profiles.admin_gym_id = redemptions.gym_id)
        OR
        (profiles.role = 'receptionist' AND profiles.admin_gym_id = redemptions.gym_id)
        OR
        (profiles.role = 'superadmin')
      )
    )
  );

-- Gym admins and receptionists can update redemptions for their gym
CREATE POLICY "Gym staff can update gym redemptions"
  ON public.redemptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (
        (profiles.role = 'gym_admin' AND profiles.admin_gym_id = redemptions.gym_id)
        OR
        (profiles.role = 'receptionist' AND profiles.admin_gym_id = redemptions.gym_id)
        OR
        (profiles.role = 'superadmin')
      )
    )
  );

-- 10. Trigger to auto-generate redemption_code if not provided
CREATE OR REPLACE FUNCTION public.set_redemption_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.redemption_code IS NULL THEN
    NEW.redemption_code := public.generate_redemption_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_redemption_code ON public.redemptions;
CREATE TRIGGER trigger_set_redemption_code
  BEFORE INSERT ON public.redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_redemption_code();

-- 11. Add comments
COMMENT ON COLUMN public.redemptions.redemption_code IS 'Unique QR code for redemption validation';
COMMENT ON FUNCTION public.create_redemption IS 'Creates a redemption with full validation. Returns success, redemption_id, code, and error_message';
COMMENT ON FUNCTION public.confirm_redemption IS 'Confirms a pending redemption. Only works for pending redemptions.';
COMMENT ON FUNCTION public.cancel_redemption IS 'Cancels a redemption and refunds drops. Restores stock if limited.';
COMMENT ON FUNCTION public.find_redemption_by_code IS 'Finds redemption by QR code for validation. Used by gym staff.';
