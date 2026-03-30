-- Migration: 20260330000005_happy_hour_after_soft_tiers.sql
-- Description: Fix Happy Hour interaction with soft session tiers.
--
-- PROBLEM: HH boost was applied BEFORE soft tiers, so the boosted amount got
--   crushed by the session threshold. E.g. session cap=2, raw=3, HH 3x → 9,
--   then soft tiers reduced 9 back to ~2. The user got almost no benefit from HH.
--
-- FIX: Apply soft tiers FIRST on raw drops, THEN multiply by HH.
--   raw=3 → soft tier reduces to 2 → HH 3x → 6 → day/week caps.
--   The user now actually gets the HH bonus on top of their earned drops.
--
-- New order of operations:
--   1. Calculate raw drops (v2 model or legacy)
--   2. Rewarded sessions count + restart reconciliation
--   3. Soft session tiers (piecewise threshold)
--   4. HAPPY HOUR BOOST on post-tier drops
--   5. Daily hard cap
--   6. Weekly hard cap
--   7. Balance updates, transactions, etc.

CREATE OR REPLACE FUNCTION public.award_drops(p_session_id uuid)
 RETURNS TABLE(drops_earned integer, multiplier numeric, badges_earned text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_use_drop_model_v2 BOOLEAN := true;

  v_cap_mode      TEXT := 'soft';
  v_restart_grace_sec INTEGER := 300;
  v_tier1_factor  NUMERIC := 0.40;
  v_tier2_factor  NUMERIC := 0.15;
  v_tier1_span_ratio NUMERIC := 0.50;
  v_merge_window_sec INTEGER := 900;

  v_rewarded_sessions_today INTEGER := 0;
  v_effective_rewarded_sessions INTEGER := 0;
  v_restart_merged_count INTEGER := 0;
  v_minted_today   INTEGER := 0;
  v_minted_week    INTEGER := 0;
  v_day_remaining  INTEGER := 0;
  v_week_remaining INTEGER := 0;

  v_calc_raw       INTEGER := 0;
  v_calc_adjusted  INTEGER := 0;
  v_calc_multiplier NUMERIC := 1.0;
  v_calc_caps      JSONB := '{}'::JSONB;
  v_calc_reasons   JSONB := '[]'::JSONB;

  v_rm             JSONB;
  v_quality_flags  JSONB;
  v_machine_type   TEXT;
  v_avg_rpm        NUMERIC;
  v_rpm_peak       NUMERIC;
  v_speed_avg_kmh  NUMERIC;
  v_incline_avg_pct NUMERIC;
  v_cadence_avg    NUMERIC;
  v_steps_avg      NUMERIC;
  v_resistance_avg NUMERIC;

  v_drop_calc_v2   JSONB := '{}'::JSONB;
  v_cap_after_day  INTEGER := 0;

  v_cap_reason     TEXT := NULL;
  v_reasons_arr    JSONB := '[]'::JSONB;

  -- Happy Hour
  v_boost_info     JSONB;
  v_boost_mult     NUMERIC := 1.0;
  v_pre_boost_drops INTEGER := 0;

  -- Anti-split merge + soft tiers
  v_merged_prior_drops INTEGER := 0;
  v_combined_drops INTEGER := 0;
  v_soft_threshold INTEGER;
  v_tier1_end      INTEGER;
  v_seg_a          INTEGER;
  v_seg_b          INTEGER;
  v_seg_c          INTEGER;
  v_soft_adjusted  INTEGER;
  v_prior_soft_adjusted INTEGER;
BEGIN
  -- ═══════════════════════════════════════════════════════════════
  -- LOAD SESSION
  -- ═══════════════════════════════════════════════════════════════
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

  -- Idempotency: already awarded
  IF v_session.drops_earned > 0 OR v_session.is_active = false THEN
    RETURN QUERY SELECT COALESCE(v_session.drops_earned, 0)::INT,
                        COALESCE(v_session.multiplier, 1.0)::NUMERIC,
                        ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- LOAD PROFILE + TOKENOMICS CONFIG
  -- ═══════════════════════════════════════════════════════════════
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_session.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found for user %', v_session.user_id; END IF;

  BEGIN
    SELECT
      COALESCE(tc.max_drops_per_session, v_max_session),
      COALESCE(tc.max_drops_per_day, v_max_daily),
      COALESCE(tc.max_drops_per_week, v_max_weekly),
      COALESCE(tc.max_rewarded_sessions_per_day, v_max_sessions_day),
      COALESCE(tc.use_drop_model_v2, v_use_drop_model_v2),
      COALESCE(tc.rewarded_sessions_cap_mode, v_cap_mode),
      COALESCE(tc.restart_grace_period_sec, v_restart_grace_sec),
      COALESCE(tc.session_soft_tier_1_factor, v_tier1_factor),
      COALESCE(tc.session_soft_tier_2_factor, v_tier2_factor),
      COALESCE(tc.session_soft_tier_1_span_ratio, v_tier1_span_ratio),
      COALESCE(tc.merge_window_sec, v_merge_window_sec)
    INTO
      v_max_session, v_max_daily, v_max_weekly, v_max_sessions_day,
      v_use_drop_model_v2, v_cap_mode, v_restart_grace_sec,
      v_tier1_factor, v_tier2_factor, v_tier1_span_ratio, v_merge_window_sec
    FROM public.tokenomics_config tc
    WHERE tc.gym_id = v_session.gym_id
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ═══════════════════════════════════════════════════════════════
  -- DURATION + SHORT SESSION GUARD
  -- ═══════════════════════════════════════════════════════════════
  v_duration_sec := GREATEST(
    COALESCE(v_session.duration_seconds, 0),
    COALESCE(
      EXTRACT(EPOCH FROM (COALESCE(v_session.ended_at, NOW()) - v_session.started_at))::INT,
      0
    )
  );
  v_capped_sec := LEAST(v_duration_sec, 14400);

  IF v_capped_sec < 120 THEN
    v_raw_drops := 0;
    v_final_drops := 0;
    v_drop_calc_v2 := jsonb_build_object(
      'enabled', v_use_drop_model_v2,
      'raw_drops', 0,
      'reason', 'session_too_short',
      'duration_seconds', v_duration_sec
    );
    v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
      'happy_hour', jsonb_build_object('active', false, 'multiplier', 1.0)
    );
    -- Jump to finalize
  ELSE
    -- ═══════════════════════════════════════════════════════════════
    -- CALCULATE RAW DROPS
    -- ═══════════════════════════════════════════════════════════════
    v_rm := COALESCE(v_session.raw_metrics, '{}'::JSONB);
    v_machine_type := LOWER(COALESCE(
      v_rm->>'machine_type',
      (SELECT m.type FROM public.machines m WHERE m.id = v_session.machine_id),
      'generic'
    ));
    v_avg_rpm := COALESCE((v_rm->>'avg_rpm')::NUMERIC, 0);
    v_rpm_peak := COALESCE((v_rm->>'rpm_peak')::NUMERIC, 0);
    v_speed_avg_kmh := COALESCE((v_rm->>'speed_avg_kmh')::NUMERIC, 0);
    v_incline_avg_pct := COALESCE((v_rm->>'incline_avg_pct')::NUMERIC, 0);
    v_cadence_avg := COALESCE((v_rm->>'cadence_avg')::NUMERIC, COALESCE((v_rm->>'avg_cadence')::NUMERIC, 0));
    v_steps_avg := COALESCE((v_rm->>'steps_per_min_avg')::NUMERIC, 0);
    v_resistance_avg := COALESCE((v_rm->>'resistance_avg')::NUMERIC, 0);

    v_quality_flags := COALESCE(v_rm->'quality_flags', jsonb_build_object(
      'high_effort_ratio', 0.5,
      'consistency_score', 0.7,
      'cadence_variance', 0.2
    ));

    IF v_use_drop_model_v2 THEN
      SELECT c.raw_drops, c.adjusted_drops, c.applied_multiplier, c.applied_caps, c.reasons
      INTO v_calc_raw, v_calc_adjusted, v_calc_multiplier, v_calc_caps, v_calc_reasons
      FROM public.calculate_session_drops_v2(
        v_session.gym_id, v_machine_type, v_duration_sec,
        v_avg_rpm, v_speed_avg_kmh, v_incline_avg_pct,
        v_cadence_avg, COALESCE(v_session.calories, NULL),
        v_quality_flags, v_rpm_peak, v_steps_avg, v_resistance_avg
      ) c LIMIT 1;

      v_raw_drops := COALESCE(v_calc_adjusted, 0);
      v_multiplier := COALESCE(v_calc_multiplier, 1.0);

      IF (COALESCE(v_calc_caps->>'spike_filtered', 'false'))::BOOLEAN
         OR v_calc_reasons @> '["drop_spike_filtered"]'::JSONB THEN
        PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_spike_filtered', 'low',
          jsonb_build_object('session_id', p_session_id, 'machine_type', v_machine_type, 'calc_caps', v_calc_caps, 'reasons', v_calc_reasons));
      END IF;

      v_drop_calc_v2 := jsonb_build_object(
        'enabled', true,
        'machine_type', v_machine_type,
        'raw_drops', COALESCE(v_calc_raw, 0),
        'adjusted_drops', COALESCE(v_calc_adjusted, 0),
        'applied_multiplier', COALESCE(v_calc_multiplier, 1.0),
        'applied_caps', COALESCE(v_calc_caps, '{}'::jsonb),
        'reasons', COALESCE(v_calc_reasons, '[]'::jsonb),
        'inputs', jsonb_build_object(
          'duration_seconds', v_duration_sec, 'avg_rpm', v_avg_rpm,
          'rpm_peak', v_rpm_peak, 'speed_avg_kmh', v_speed_avg_kmh,
          'incline_avg_pct', v_incline_avg_pct, 'cadence_avg', v_cadence_avg,
          'steps_per_min_avg', v_steps_avg, 'resistance_avg', v_resistance_avg,
          'calories', v_session.calories
        )
      );
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
      v_drop_calc_v2 := jsonb_build_object(
        'enabled', false, 'fallback', 'legacy_formula',
        'raw_drops', v_raw_drops, 'applied_multiplier', v_multiplier,
        'inputs', jsonb_build_object('duration_seconds', v_duration_sec, 'calories', v_session.calories)
      );
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- REWARDED SESSIONS COUNT + RESTART RECONCILIATION
  -- ═══════════════════════════════════════════════════════════════
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

  IF v_restart_grace_sec > 0 AND v_session.machine_id IS NOT NULL THEN
    SELECT COUNT(*)::INT INTO v_restart_merged_count
    FROM public.sessions s_inner
    WHERE s_inner.user_id = v_session.user_id
      AND s_inner.machine_id = v_session.machine_id
      AND s_inner.id <> v_session.id
      AND s_inner.is_active = false
      AND s_inner.drops_earned > 0
      AND DATE(s_inner.started_at AT TIME ZONE 'Europe/Belgrade') = v_today
      AND EXISTS (
        SELECT 1 FROM public.sessions s_prev
        WHERE s_prev.user_id = v_session.user_id
          AND s_prev.machine_id = v_session.machine_id
          AND s_prev.id <> s_inner.id
          AND s_prev.is_active = false
          AND s_prev.ended_at IS NOT NULL
          AND s_inner.started_at <= s_prev.ended_at + (v_restart_grace_sec || ' seconds')::INTERVAL
          AND s_inner.started_at >= s_prev.ended_at
          AND DATE(s_prev.started_at AT TIME ZONE 'Europe/Belgrade') = v_today
      );
  END IF;

  v_effective_rewarded_sessions := v_rewarded_sessions_today - v_restart_merged_count;

  -- ═══════════════════════════════════════════════════════════════
  -- REWARDED SESSIONS CAP — MODE-AWARE
  -- ═══════════════════════════════════════════════════════════════
  v_reasons_arr := COALESCE(v_drop_calc_v2->'reasons', '[]'::jsonb);

  IF v_cap_mode = 'off' THEN
    NULL;

  ELSIF v_cap_mode = 'hard' AND v_effective_rewarded_sessions >= v_max_sessions_day THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id,
      'drop_cap_rewarded_sessions_day_hit', 'medium',
      jsonb_build_object(
        'session_id', p_session_id, 'mode', 'hard',
        'max_rewarded_sessions_per_day', v_max_sessions_day,
        'effective_rewarded', v_effective_rewarded_sessions,
        'restart_merged', v_restart_merged_count
      ));
    v_final_drops := 0;
    v_cap_reason := 'rewarded_sessions_cap_hard_block';
    v_reasons_arr := v_reasons_arr || to_jsonb('rewarded_sessions_cap_hard_block'::TEXT);

  ELSIF v_cap_mode = 'soft' AND v_effective_rewarded_sessions >= v_max_sessions_day THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id,
      'rewarded_sessions_cap_soft_signal', 'low',
      jsonb_build_object(
        'session_id', p_session_id, 'mode', 'soft',
        'max_rewarded_sessions_per_day', v_max_sessions_day,
        'effective_rewarded', v_effective_rewarded_sessions,
        'restart_merged', v_restart_merged_count
      ));
    v_cap_reason := 'rewarded_sessions_cap_soft_signal';
    v_reasons_arr := v_reasons_arr || to_jsonb('rewarded_sessions_cap_soft_signal'::TEXT);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- SOFT SESSION THRESHOLD (applied BEFORE Happy Hour)
  -- ═══════════════════════════════════════════════════════════════
  IF v_cap_reason IS DISTINCT FROM 'rewarded_sessions_cap_hard_block' THEN

    v_merged_prior_drops := 0;
    IF v_merge_window_sec > 0 THEN
      SELECT COALESCE(SUM(s2.drops_earned), 0)::INT
      INTO v_merged_prior_drops
      FROM public.sessions s2
      WHERE s2.user_id = v_session.user_id
        AND s2.id <> v_session.id
        AND s2.is_active = false
        AND s2.drops_earned > 0
        AND DATE(s2.started_at AT TIME ZONE 'Europe/Belgrade') = v_today
        AND s2.ended_at IS NOT NULL
        AND s2.ended_at <= v_session.started_at
        AND v_session.started_at <= s2.ended_at + (v_merge_window_sec || ' seconds')::INTERVAL;
    END IF;

    v_soft_threshold := v_max_session;
    v_tier1_end := v_soft_threshold + ROUND(v_soft_threshold * v_tier1_span_ratio);
    v_combined_drops := v_merged_prior_drops + v_raw_drops;

    IF v_combined_drops <= v_soft_threshold THEN
      v_soft_adjusted := v_combined_drops;
    ELSIF v_combined_drops <= v_tier1_end THEN
      v_seg_a := v_soft_threshold;
      v_seg_b := ROUND((v_combined_drops - v_soft_threshold) * v_tier1_factor);
      v_soft_adjusted := v_seg_a + v_seg_b;
    ELSE
      v_seg_a := v_soft_threshold;
      v_seg_b := ROUND((v_tier1_end - v_soft_threshold) * v_tier1_factor);
      v_seg_c := ROUND((v_combined_drops - v_tier1_end) * v_tier2_factor);
      v_soft_adjusted := v_seg_a + v_seg_b + v_seg_c;
    END IF;

    IF v_merged_prior_drops <= 0 THEN
      v_prior_soft_adjusted := 0;
    ELSIF v_merged_prior_drops <= v_soft_threshold THEN
      v_prior_soft_adjusted := v_merged_prior_drops;
    ELSIF v_merged_prior_drops <= v_tier1_end THEN
      v_prior_soft_adjusted := v_soft_threshold
        + ROUND((v_merged_prior_drops - v_soft_threshold) * v_tier1_factor);
    ELSE
      v_prior_soft_adjusted := v_soft_threshold
        + ROUND((v_tier1_end - v_soft_threshold) * v_tier1_factor)
        + ROUND((v_merged_prior_drops - v_tier1_end) * v_tier2_factor);
    END IF;

    -- Marginal credit for this session (post-tier, pre-boost)
    v_raw_drops := GREATEST(0, v_soft_adjusted - v_prior_soft_adjusted);

    IF v_combined_drops > v_soft_threshold THEN
      v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_threshold_reached'::TEXT);
      IF v_combined_drops > v_tier1_end THEN
        v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_tier_2_applied'::TEXT);
      ELSE
        v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_tier_1_applied'::TEXT);
      END IF;
    END IF;

    -- ═══════════════════════════════════════════════════════════════
    -- HAPPY HOUR BOOST (applied AFTER soft tiers, BEFORE daily/weekly caps)
    -- ═══════════════════════════════════════════════════════════════
    v_boost_info := public.get_active_drop_boost(v_session.gym_id, v_session.started_at, v_machine_type);
    v_boost_mult := COALESCE((v_boost_info->>'multiplier')::NUMERIC, 1.0);

    IF v_boost_mult > 1.0 AND v_raw_drops > 0 THEN
      v_pre_boost_drops := v_raw_drops;
      v_raw_drops := ROUND(v_raw_drops * v_boost_mult)::INTEGER;
      v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
        'happy_hour', jsonb_build_object(
          'active', true,
          'multiplier', v_boost_mult,
          'rule_id', v_boost_info->>'rule_id',
          'rule_name', v_boost_info->>'rule_name',
          'pre_boost_drops', v_pre_boost_drops,
          'post_boost_drops', v_raw_drops
        )
      );
    ELSE
      v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
        'happy_hour', jsonb_build_object('active', false, 'multiplier', 1.0)
      );
    END IF;

    -- Day cap (hard)
    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_cap_after_day := LEAST(v_raw_drops, v_day_remaining);
    IF v_cap_after_day < v_raw_drops THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_day_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'raw_drops', v_raw_drops, 'day_remaining', v_day_remaining));
      IF v_cap_reason IS NULL THEN v_cap_reason := 'drop_cap_day_hit'; END IF;
      v_reasons_arr := v_reasons_arr || to_jsonb('drop_cap_day_hit'::TEXT);
    END IF;

    -- Week cap (hard)
    v_week_remaining := GREATEST(v_max_weekly - v_minted_week, 0);
    v_final_drops := LEAST(v_cap_after_day, v_week_remaining);
    IF v_final_drops < v_cap_after_day THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_week_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'after_day_cap', v_cap_after_day, 'week_remaining', v_week_remaining));
      IF v_cap_reason IS NULL THEN v_cap_reason := 'drop_cap_week_hit'; END IF;
      v_reasons_arr := v_reasons_arr || to_jsonb('drop_cap_week_hit'::TEXT);
    END IF;
  END IF;

  v_final_drops := GREATEST(COALESCE(v_final_drops, 0), 0);

  -- ═══════════════════════════════════════════════════════════════
  -- PERSIST TELEMETRY
  -- ═══════════════════════════════════════════════════════════════
  v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
    'rewarded_sessions', jsonb_build_object(
      'count', v_rewarded_sessions_today,
      'effective_count', v_effective_rewarded_sessions,
      'restart_merged', v_restart_merged_count,
      'mode', v_cap_mode,
      'grace_sec', v_restart_grace_sec,
      'max_per_day', v_max_sessions_day
    ),
    'soft_session', jsonb_build_object(
      'threshold', v_soft_threshold,
      'tier1_end', v_tier1_end,
      'tier1_factor', v_tier1_factor,
      'tier2_factor', v_tier2_factor,
      'tier1_span_ratio', v_tier1_span_ratio,
      'merged_prior_drops', v_merged_prior_drops,
      'combined_drops', v_combined_drops,
      'adjusted_combined', v_soft_adjusted,
      'adjusted_prior', v_prior_soft_adjusted,
      'marginal_credit', GREATEST(0, COALESCE(v_soft_adjusted, 0) - COALESCE(v_prior_soft_adjusted, 0))
    ),
    'caps', jsonb_build_object(
      'day_remaining', v_day_remaining,
      'week_remaining', v_week_remaining,
      'final_drops', v_final_drops,
      'merge_window_sec', v_merge_window_sec
    ),
    'reasons', v_reasons_arr
  );

  IF v_cap_reason IS NOT NULL THEN
    v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object('cap_reason', v_cap_reason);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- STREAK
  -- ═══════════════════════════════════════════════════════════════
  v_new_streak := CASE
    WHEN v_profile.last_visit_date IS NULL THEN 1
    WHEN v_profile.last_visit_date = v_today THEN v_profile.streak_days
    WHEN v_profile.last_visit_date = v_today - 1 THEN v_profile.streak_days + 1
    ELSE 1
  END;

  -- ═══════════════════════════════════════════════════════════════
  -- FINALIZE SESSION + BALANCE UPDATES
  -- ═══════════════════════════════════════════════════════════════
  UPDATE public.sessions
  SET drops_earned = v_final_drops,
      multiplier   = v_multiplier,
      ended_at     = COALESCE(ended_at, NOW()),
      is_active    = false,
      raw_metrics  = jsonb_set(COALESCE(raw_metrics, '{}'::jsonb), '{drop_calc_v2}', v_drop_calc_v2, true),
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
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + EXCLUDED.local_drops_balance,
                  updated_at = NOW();
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
       'Workout session — ' || v_final_drops || ' drops (×' || v_multiplier
         || CASE WHEN v_boost_mult > 1.0 THEN ', boost ×' || v_boost_mult ELSE '' END || ')');

    INSERT INTO public.drop_limit_counters (user_id, gym_id, period_type, period_start, minted_drops, rewarded_sessions, updated_at)
    VALUES (v_session.user_id, v_session.gym_id, 'day', v_today, v_final_drops, 1, NOW())
    ON CONFLICT (user_id, gym_id, period_type, period_start)
    DO UPDATE SET minted_drops = public.drop_limit_counters.minted_drops + EXCLUDED.minted_drops,
                  rewarded_sessions = public.drop_limit_counters.rewarded_sessions + EXCLUDED.rewarded_sessions,
                  updated_at = NOW();

    INSERT INTO public.drop_limit_counters (user_id, gym_id, period_type, period_start, minted_drops, rewarded_sessions, updated_at)
    VALUES (v_session.user_id, v_session.gym_id, 'week', v_week_start, v_final_drops, 1, NOW())
    ON CONFLICT (user_id, gym_id, period_type, period_start)
    DO UPDATE SET minted_drops = public.drop_limit_counters.minted_drops + EXCLUDED.minted_drops,
                  rewarded_sessions = public.drop_limit_counters.rewarded_sessions + EXCLUDED.rewarded_sessions,
                  updated_at = NOW();

    PERFORM public.update_challenge_progress(v_session.user_id, v_session.gym_id, v_final_drops, p_session_id);
    PERFORM public.update_arena_scores(v_session.user_id, v_session.gym_id, v_final_drops);

    SELECT COALESCE(array_agg(bn.badge_name), ARRAY[]::TEXT[])
    INTO v_badges
    FROM public.evaluate_badges(v_session.user_id, p_session_id) AS bn(badge_name);
  END IF;

  PERFORM public.refresh_economy_snapshot_daily(v_session.gym_id, v_today);

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES (v_session.user_id, v_session.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);

  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$function$;
