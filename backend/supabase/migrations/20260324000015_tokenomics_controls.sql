-- Migration: 20260324000015_tokenomics_controls.sql
-- Description: Tokenomics config tables, counters, daily snapshots, and enforcement wiring.

CREATE TABLE IF NOT EXISTS public.tokenomics_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  max_drops_per_session INTEGER NOT NULL DEFAULT 120 CHECK (max_drops_per_session >= 0),
  max_drops_per_day INTEGER NOT NULL DEFAULT 300 CHECK (max_drops_per_day >= 0),
  max_drops_per_week INTEGER NOT NULL DEFAULT 1500 CHECK (max_drops_per_week >= 0),
  max_rewarded_sessions_per_day INTEGER NOT NULL DEFAULT 4 CHECK (max_rewarded_sessions_per_day >= 0),
  max_checkin_drops_per_day INTEGER NOT NULL DEFAULT 1 CHECK (max_checkin_drops_per_day >= 0),
  price_band_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tokenomics_config_gym UNIQUE (gym_id)
);

CREATE TABLE IF NOT EXISTS public.drop_limit_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week')),
  period_start DATE NOT NULL,
  minted_drops INTEGER NOT NULL DEFAULT 0 CHECK (minted_drops >= 0),
  rewarded_sessions INTEGER NOT NULL DEFAULT 0 CHECK (rewarded_sessions >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_drop_limit_counter UNIQUE (user_id, gym_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_drop_limit_counters_user_period
  ON public.drop_limit_counters(user_id, period_type, period_start DESC);

CREATE TABLE IF NOT EXISTS public.economy_snapshots_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  minted_drops INTEGER NOT NULL DEFAULT 0,
  burned_drops INTEGER NOT NULL DEFAULT 0,
  unique_earners INTEGER NOT NULL DEFAULT 0,
  unique_redeemers INTEGER NOT NULL DEFAULT 0,
  burn_mint_ratio NUMERIC(6,3) NOT NULL DEFAULT 0,
  top1_share_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_economy_snapshot_gym_day UNIQUE (gym_id, snapshot_date)
);

INSERT INTO public.tokenomics_config (
  gym_id,
  max_drops_per_session,
  max_drops_per_day,
  max_drops_per_week,
  max_rewarded_sessions_per_day,
  max_checkin_drops_per_day,
  price_band_json
)
SELECT
  NULL,
  120,
  300,
  1500,
  4,
  1,
  jsonb_build_object(
    'coffee', jsonb_build_object('min', 120, 'max', 220),
    'protein_snack', jsonb_build_object('min', 180, 'max', 320),
    'day_pass', jsonb_build_object('min', 500, 'max', 900),
    'pt_intro', jsonb_build_object('min', 1200, 'max', 2200),
    'merch_small', jsonb_build_object('min', 700, 'max', 1500),
    'merch_premium', jsonb_build_object('min', 1800, 'max', 4000),
    'physical', jsonb_build_object('min', 1, 'max', 100000)
  )
WHERE NOT EXISTS (SELECT 1 FROM public.tokenomics_config WHERE gym_id IS NULL);

CREATE OR REPLACE FUNCTION public.refresh_economy_snapshot_daily(
  p_gym_id UUID,
  p_day DATE DEFAULT (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minted INTEGER := 0;
  v_burned INTEGER := 0;
  v_earners INTEGER := 0;
  v_redeemers INTEGER := 0;
  v_top1_share NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0)::INT,
         COUNT(DISTINCT user_id)::INT
    INTO v_minted, v_earners
  FROM public.drops_transactions
  WHERE gym_id = p_gym_id
    AND amount > 0
    AND DATE(created_at AT TIME ZONE 'Europe/Belgrade') = p_day;

  SELECT COALESCE(SUM(ABS(amount)), 0)::INT,
         COUNT(DISTINCT user_id)::INT
    INTO v_burned, v_redeemers
  FROM public.drops_transactions
  WHERE gym_id = p_gym_id
    AND amount < 0
    AND DATE(created_at AT TIME ZONE 'Europe/Belgrade') = p_day;

  WITH by_user AS (
    SELECT user_id, SUM(amount)::NUMERIC AS minted
    FROM public.drops_transactions
    WHERE gym_id = p_gym_id
      AND amount > 0
      AND DATE(created_at AT TIME ZONE 'Europe/Belgrade') = p_day
    GROUP BY user_id
  )
  SELECT COALESCE(MAX(minted), 0) / NULLIF(COALESCE(SUM(minted), 0), 0) * 100
  INTO v_top1_share
  FROM by_user;

  INSERT INTO public.economy_snapshots_daily (
    gym_id, snapshot_date, minted_drops, burned_drops,
    unique_earners, unique_redeemers, burn_mint_ratio, top1_share_pct
  )
  VALUES (
    p_gym_id,
    p_day,
    v_minted,
    v_burned,
    v_earners,
    v_redeemers,
    COALESCE(v_burned::NUMERIC / NULLIF(v_minted, 0), 0),
    COALESCE(v_top1_share, 0)
  )
  ON CONFLICT (gym_id, snapshot_date)
  DO UPDATE SET
    minted_drops = EXCLUDED.minted_drops,
    burned_drops = EXCLUDED.burned_drops,
    unique_earners = EXCLUDED.unique_earners,
    unique_redeemers = EXCLUDED.unique_redeemers,
    burn_mint_ratio = EXCLUDED.burn_mint_ratio,
    top1_share_pct = EXCLUDED.top1_share_pct,
    created_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.award_drops(
  p_session_id UUID
)
RETURNS TABLE(
  drops_earned  INTEGER,
  multiplier    NUMERIC,
  badges_earned TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session       RECORD;
  v_profile       RECORD;
  v_machine_owner UUID;
  v_machine_busy  BOOLEAN;

  v_base_drops    INTEGER;
  v_raw_drops     INTEGER;
  v_final_drops   INTEGER;
  v_multiplier    NUMERIC := 1.0;
  v_balance_after INTEGER;
  v_new_streak    INTEGER;
  v_badges        TEXT[] := ARRAY[]::TEXT[];

  v_today         DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
  v_week_start    DATE := DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
  v_duration_sec  INTEGER;
  v_capped_sec    INTEGER;
  v_session_cal   NUMERIC;

  v_max_session   INTEGER := 120;
  v_max_daily     INTEGER := 300;
  v_max_weekly    INTEGER := 1500;
  v_max_sessions_day INTEGER := 4;

  v_rewarded_sessions_today INTEGER := 0;
  v_minted_today   INTEGER := 0;
  v_minted_week    INTEGER := 0;
  v_day_remaining  INTEGER := 0;
  v_week_remaining INTEGER := 0;
BEGIN
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_session.user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_session.gym_id, 'award_drops_unauthorized', 'critical',
      jsonb_build_object('session_id', p_session_id, 'session_user_id', v_session.user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_session.is_active = false AND v_session.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_session.drops_earned, 0)::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_session.machine_id IS NOT NULL THEN
    SELECT current_user_id, is_busy
    INTO v_machine_owner, v_machine_busy
    FROM public.machines
    WHERE id = v_session.machine_id
    FOR UPDATE;

    IF NOT FOUND OR v_machine_owner IS DISTINCT FROM v_session.user_id OR COALESCE(v_machine_busy, false) = false THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'award_drops_without_valid_lock', 'high',
        jsonb_build_object('session_id', p_session_id, 'machine_id', v_session.machine_id, 'machine_owner', v_machine_owner, 'machine_busy', v_machine_busy));
      RAISE EXCEPTION 'Machine lock ownership invalid for rewarding';
    END IF;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

  v_duration_sec := COALESCE(v_session.duration_seconds, 0);
  v_capped_sec := LEAST(GREATEST(v_duration_sec, 0), 7200);

  IF v_duration_sec < 120 THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'session_too_short_for_reward', 'low',
      jsonb_build_object('session_id', p_session_id, 'duration_seconds', v_duration_sec));
    v_raw_drops := 0;
    v_multiplier := 1.0;
  ELSE
    v_session_cal := COALESCE(v_session.calories, (v_capped_sec / 60.0) * 7.0);
    v_session_cal := LEAST(v_session_cal, (v_capped_sec / 60.0) * 25.0);

    v_base_drops := GREATEST(1, ROUND(v_session_cal * 2.5));

    v_new_streak := CASE
      WHEN v_profile.last_visit_date IS NULL THEN 1
      WHEN v_profile.last_visit_date = v_today THEN v_profile.streak_days
      WHEN v_profile.last_visit_date = v_today - 1 THEN v_profile.streak_days + 1
      ELSE 1
    END;

    v_multiplier := CASE
      WHEN v_new_streak >= 14 THEN 2.0
      WHEN v_new_streak >= 7  THEN 1.5
      WHEN v_new_streak >= 3  THEN 1.2
      ELSE 1.0
    END;

    v_raw_drops := GREATEST(1, ROUND(v_base_drops * v_multiplier));
  END IF;

  -- Tokenomics config override (gym row first, then global)
  SELECT
    tc.max_drops_per_session,
    tc.max_drops_per_day,
    tc.max_drops_per_week,
    tc.max_rewarded_sessions_per_day
  INTO
    v_max_session,
    v_max_daily,
    v_max_weekly,
    v_max_sessions_day
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = v_session.gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = v_session.gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT COUNT(*)::INT, COALESCE(SUM(s.drops_earned), 0)::INT
  INTO v_rewarded_sessions_today, v_minted_today
  FROM public.sessions s
  WHERE s.user_id = v_session.user_id
    AND s.id <> v_session.id
    AND s.is_active = false
    AND s.drops_earned > 0
    AND DATE(s.started_at AT TIME ZONE 'Europe/Belgrade') = v_today;

  SELECT COALESCE(SUM(s.drops_earned), 0)::INT
  INTO v_minted_week
  FROM public.sessions s
  WHERE s.user_id = v_session.user_id
    AND s.id <> v_session.id
    AND s.is_active = false
    AND s.drops_earned > 0
    AND DATE(s.started_at AT TIME ZONE 'Europe/Belgrade') >= v_week_start;

  IF v_rewarded_sessions_today >= v_max_sessions_day THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drops_cap_sessions_per_day_reached', 'medium',
      jsonb_build_object('session_id', p_session_id, 'max_rewarded_sessions_per_day', v_max_sessions_day));
    v_final_drops := 0;
  ELSE
    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_week_remaining := GREATEST(v_max_weekly - v_minted_week, 0);
    v_final_drops := LEAST(v_raw_drops, v_max_session, v_day_remaining, v_week_remaining);
  END IF;

  IF v_final_drops < 0 THEN
    v_final_drops := 0;
  END IF;

  IF v_final_drops < v_raw_drops THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drops_capped', 'low',
      jsonb_build_object('session_id', p_session_id, 'raw_drops', v_raw_drops, 'final_drops', v_final_drops,
                         'daily_remaining', v_day_remaining, 'weekly_remaining', v_week_remaining));
  END IF;

  v_new_streak := CASE
    WHEN v_profile.last_visit_date IS NULL THEN 1
    WHEN v_profile.last_visit_date = v_today THEN v_profile.streak_days
    WHEN v_profile.last_visit_date = v_today - 1 THEN v_profile.streak_days + 1
    ELSE 1
  END;

  UPDATE public.sessions
  SET drops_earned = v_final_drops,
      multiplier   = v_multiplier,
      ended_at     = COALESCE(ended_at, NOW()),
      is_active    = false,
      updated_at   = NOW()
  WHERE id = p_session_id;

  UPDATE public.profiles
  SET total_drops     = total_drops + v_final_drops,
      available_drops = available_drops + v_final_drops,
      weekly_drops    = weekly_drops + v_final_drops,
      monthly_drops   = monthly_drops + v_final_drops,
      last_visit_date = v_today,
      streak_days     = v_new_streak,
      updated_at      = NOW()
  WHERE id = v_session.user_id;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_final_drops,
      updated_at          = NOW()
  WHERE user_id = v_session.user_id
    AND gym_id  = v_session.gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_session.user_id, v_session.gym_id, v_final_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + v_final_drops;
  END IF;

  SELECT available_drops INTO v_balance_after
  FROM public.profiles
  WHERE id = v_session.user_id;

  IF v_final_drops > 0 THEN
    INSERT INTO public.drops_transactions
      (user_id, gym_id, amount, transaction_type,
       reference_id, balance_after, expires_at, description)
    VALUES
      (v_session.user_id, v_session.gym_id,
       v_final_drops, 'session',
       p_session_id, v_balance_after,
       NOW() + INTERVAL '90 days',
       'Workout session — ' || v_final_drops || ' drops (×' || v_multiplier || ')');

    INSERT INTO public.drop_limit_counters (user_id, gym_id, period_type, period_start, minted_drops, rewarded_sessions, updated_at)
    VALUES (v_session.user_id, v_session.gym_id, 'day', v_today, v_final_drops, 1, NOW())
    ON CONFLICT (user_id, gym_id, period_type, period_start)
    DO UPDATE SET minted_drops = drop_limit_counters.minted_drops + EXCLUDED.minted_drops,
                  rewarded_sessions = drop_limit_counters.rewarded_sessions + EXCLUDED.rewarded_sessions,
                  updated_at = NOW();

    INSERT INTO public.drop_limit_counters (user_id, gym_id, period_type, period_start, minted_drops, rewarded_sessions, updated_at)
    VALUES (v_session.user_id, v_session.gym_id, 'week', v_week_start, v_final_drops, 1, NOW())
    ON CONFLICT (user_id, gym_id, period_type, period_start)
    DO UPDATE SET minted_drops = drop_limit_counters.minted_drops + EXCLUDED.minted_drops,
                  rewarded_sessions = drop_limit_counters.rewarded_sessions + EXCLUDED.rewarded_sessions,
                  updated_at = NOW();

    PERFORM public.update_challenge_progress(
      v_session.user_id,
      v_session.gym_id,
      v_final_drops,
      p_session_id
    );

    PERFORM public.update_arena_scores(
      v_session.user_id,
      v_session.gym_id,
      v_final_drops
    );

    SELECT COALESCE(array_agg(bn.badge_name), ARRAY[]::TEXT[])
    INTO v_badges
    FROM public.evaluate_badges(v_session.user_id, p_session_id) AS bn(badge_name);
  END IF;

  PERFORM public.refresh_economy_snapshot_daily(v_session.gym_id, v_today);

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_session.user_id, v_session.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);

  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_reward(
  p_user_id   UUID,
  p_reward_id UUID,
  p_gym_id    UUID
)
RETURNS TABLE(
  success         BOOLEAN,
  redemption_id   UUID,
  redemption_code TEXT,
  error_message   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward        RECORD;
  v_membership    RECORD;
  v_code          TEXT;
  v_redemption_id UUID;
  v_balance_after INTEGER;
  v_existing      INTEGER;
  v_period_start  TIMESTAMPTZ;
  v_price_bands   JSONB;
  v_band          JSONB;
  v_min_price     INTEGER;
  v_max_price     INTEGER;
BEGIN
  SELECT * INTO v_reward
  FROM public.rewards
  WHERE id = p_reward_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward not found'::TEXT;
    RETURN;
  END IF;

  IF v_reward.price_drops IS NULL OR v_reward.price_drops <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Invalid reward pricing'::TEXT;
    RETURN;
  END IF;

  SELECT tc.price_band_json INTO v_price_bands
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = p_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_price_bands IS NOT NULL AND v_reward.reward_type IS NOT NULL AND (v_price_bands ? v_reward.reward_type) THEN
    v_band := v_price_bands -> v_reward.reward_type;
    v_min_price := COALESCE((v_band->>'min')::INT, 0);
    v_max_price := COALESCE((v_band->>'max')::INT, 2147483647);

    IF v_reward.price_drops < v_min_price OR v_reward.price_drops > v_max_price THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward pricing out of allowed band'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not active'::TEXT;
    RETURN;
  END IF;

  IF v_reward.available_from IS NOT NULL AND v_reward.available_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not yet available'::TEXT;
    RETURN;
  END IF;

  IF v_reward.available_until IS NOT NULL AND v_reward.available_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward has expired'::TEXT;
    RETURN;
  END IF;

  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Out of stock'::TEXT;
    RETURN;
  END IF;

  IF v_reward.redemption_limit != 'unlimited' THEN
    CASE v_reward.redemption_limit
      WHEN 'once' THEN
        v_period_start := '-infinity'::TIMESTAMPTZ;
      WHEN 'once_per_day' THEN
        v_period_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_week' THEN
        v_period_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_month' THEN
        v_period_start := DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';
    END CASE;

    SELECT COUNT(*) INTO v_existing
    FROM public.redemptions r
    WHERE r.user_id = p_user_id
      AND r.reward_id = p_reward_id
      AND r.status IN ('pending', 'confirmed')
      AND (v_reward.redemption_limit = 'once' OR r.created_at >= v_period_start);

    IF v_existing > 0 THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        CASE v_reward.redemption_limit
          WHEN 'once' THEN 'You can only claim this reward once'
          WHEN 'once_per_day' THEN 'You already claimed this reward today'
          WHEN 'once_per_week' THEN 'You already claimed this reward this week'
          WHEN 'once_per_month' THEN 'You already claimed this reward this month'
        END::TEXT;
      RETURN;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.user_id = p_user_id
        AND r.reward_id = p_reward_id
        AND r.status = 'pending'
    ) THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        'You already have a pending claim for this reward'::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_membership
  FROM public.gym_memberships
  WHERE user_id = p_user_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND OR v_membership.local_drops_balance < v_reward.price_drops THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Insufficient drops. You have %s, need %s', COALESCE(v_membership.local_drops_balance, 0), v_reward.price_drops)::TEXT;
    RETURN;
  END IF;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - v_reward.price_drops,
      updated_at = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  UPDATE public.profiles
  SET available_drops = GREATEST(0, available_drops - v_reward.price_drops),
      updated_at = NOW()
  WHERE id = p_user_id;

  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards
    SET stock = stock - 1,
        updated_at = NOW()
    WHERE id = p_reward_id;
  END IF;

  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.redemption_code = v_code AND r.status = 'pending'
    );
  END LOOP;

  INSERT INTO public.redemptions
    (user_id, reward_id, gym_id, drops_spent, status, redemption_code)
  VALUES
    (p_user_id, p_reward_id, p_gym_id, v_reward.price_drops, 'pending', v_code)
  RETURNING id INTO v_redemption_id;

  SELECT available_drops INTO v_balance_after
  FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES
    (p_user_id, p_gym_id, -v_reward.price_drops, 'reward_claim',
     v_redemption_id, v_balance_after, 'Reward: ' || v_reward.name);

  PERFORM public.refresh_economy_snapshot_daily(p_gym_id, (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE);

  RETURN QUERY SELECT true, v_redemption_id, v_code, NULL::TEXT;
END;
$$;
