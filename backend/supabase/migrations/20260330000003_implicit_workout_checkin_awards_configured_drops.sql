-- Migration: 20260330000003_implicit_workout_checkin_awards_configured_drops.sql
-- Description:
--   Ensure users receive configured check-in drops even when they start workout
--   directly (without explicit check-in flow). award_drops() already inserts an
--   implicit gym_checkin with drops_earned=0; this trigger tops it up to gym
--   checkin_drops and credits balances/ledger exactly once.
--
-- Notes:
--   - Explicit perform_checkin inserts positive drops_earned and is unaffected.
--   - Unique daily check-in constraint still prevents duplicates.

CREATE OR REPLACE FUNCTION public.apply_implicit_checkin_drops()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checkin_drops INTEGER := 0;
BEGIN
  -- Explicit check-ins already set drops_earned > 0 and manage their own accounting.
  IF COALESCE(NEW.drops_earned, 0) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(g.checkin_drops, 0)
  INTO v_checkin_drops
  FROM public.gyms g
  WHERE g.id = NEW.gym_id;

  IF v_checkin_drops <= 0 THEN
    RETURN NEW;
  END IF;

  -- Mark this implicit check-in with configured drops exactly once.
  UPDATE public.gym_checkins
  SET drops_earned = v_checkin_drops
  WHERE id = NEW.id
    AND drops_earned = 0;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Credit profile balances.
  UPDATE public.profiles
  SET total_drops = total_drops + v_checkin_drops,
      available_drops = available_drops + v_checkin_drops,
      weekly_drops = weekly_drops + v_checkin_drops,
      monthly_drops = monthly_drops + v_checkin_drops,
      updated_at = NOW()
  WHERE id = NEW.user_id;

  -- Credit local gym balance.
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_checkin_drops,
      updated_at = NOW()
  WHERE user_id = NEW.user_id
    AND gym_id = NEW.gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (NEW.user_id, NEW.gym_id, v_checkin_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + EXCLUDED.local_drops_balance,
                  updated_at = NOW();
  END IF;

  -- Ledger entry for visibility/transparency.
  INSERT INTO public.drops_transactions (
    user_id,
    gym_id,
    amount,
    transaction_type,
    reference_id,
    balance_after,
    expires_at,
    description
  )
  SELECT
    NEW.user_id,
    NEW.gym_id,
    v_checkin_drops,
    'checkin',
    NEW.id,
    p.available_drops,
    NOW() + INTERVAL '90 days',
    'Implicit workout check-in'
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_implicit_checkin_drops ON public.gym_checkins;

CREATE TRIGGER trg_apply_implicit_checkin_drops
AFTER INSERT ON public.gym_checkins
FOR EACH ROW
EXECUTE FUNCTION public.apply_implicit_checkin_drops();
