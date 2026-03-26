-- Migration: 20260325000016_fair_session_soft_threshold_policy.sql
-- Description: Implement soft session threshold with piecewise multiplier tiers,
--   anti-split merge accounting, and extended mobile policy RPC.
--
-- CHANGES:
--   - tokenomics_config: +session_soft_tier_1_factor, +session_soft_tier_2_factor,
--     +session_soft_tier_1_span_ratio, +split_merge_window_sec
--   - Widen session_restart_grace_sec constraint to 0..3600
--   - award_drops(): session cap becomes soft threshold with tiers + anti-split merge
--   - get_user_drop_limits(): return 4 new OUT columns
--
-- IMPACT ON FRONTEND:
--   - Mobile: get_user_drop_limits returns tier factors + merge window for UI explanation
--   - Admin: new economy settings fields for session tiers
--
-- BREAKING CHANGES: None. Defaults preserve existing behavior; soft tier reduces
--   gently instead of hard-capping.

-- ============================================================================
-- 1. Schema: add soft-tier policy columns to tokenomics_config
-- ============================================================================

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS session_soft_tier_1_factor NUMERIC(6,4) NOT NULL DEFAULT 0.40;

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS session_soft_tier_2_factor NUMERIC(6,4) NOT NULL DEFAULT 0.15;

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS session_soft_tier_1_span_ratio NUMERIC(6,4) NOT NULL DEFAULT 0.50;

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS split_merge_window_sec INTEGER NOT NULL DEFAULT 900;

-- Constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tokenomics_config'
      AND constraint_name = 'chk_session_soft_tier_1_factor'
  ) THEN
    ALTER TABLE public.tokenomics_config
      ADD CONSTRAINT chk_session_soft_tier_1_factor
      CHECK (session_soft_tier_1_factor >= 0 AND session_soft_tier_1_factor <= 1);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tokenomics_config'
      AND constraint_name = 'chk_session_soft_tier_2_factor'
  ) THEN
    ALTER TABLE public.tokenomics_config
      ADD CONSTRAINT chk_session_soft_tier_2_factor
      CHECK (session_soft_tier_2_factor >= 0 AND session_soft_tier_2_factor <= 1);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tokenomics_config'
      AND constraint_name = 'chk_session_soft_tier_1_span_ratio'
  ) THEN
    ALTER TABLE public.tokenomics_config
      ADD CONSTRAINT chk_session_soft_tier_1_span_ratio
      CHECK (session_soft_tier_1_span_ratio > 0 AND session_soft_tier_1_span_ratio <= 2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tokenomics_config'
      AND constraint_name = 'chk_split_merge_window_sec'
  ) THEN
    ALTER TABLE public.tokenomics_config
      ADD CONSTRAINT chk_split_merge_window_sec
      CHECK (split_merge_window_sec BETWEEN 0 AND 3600);
  END IF;
END $$;

-- Widen session_restart_grace_sec from 0..1800 to 0..3600
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tokenomics_config'
      AND constraint_name = 'chk_session_restart_grace_sec'
  ) THEN
    ALTER TABLE public.tokenomics_config DROP CONSTRAINT chk_session_restart_grace_sec;
  END IF;
  ALTER TABLE public.tokenomics_config
    ADD CONSTRAINT chk_session_restart_grace_sec
    CHECK (session_restart_grace_sec BETWEEN 0 AND 3600);
END $$;

-- ============================================================================
-- 2. award_drops() — full rewrite with soft session threshold + anti-split merge
-- ============================================================================

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

  -- Policy fields
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

  -- Anti-split merge accounting
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

  -- Idempotency: already finalized
  IF v_session.is_active = false AND v_session.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_session.drops_earned, 0)::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- Machine lock validation
  IF v_session.machine_id IS NOT NULL THEN
    SELECT current_user_id, is_busy, LOWER(type)
    INTO v_machine_owner, v_machine_busy, v_machine_type
    FROM public.machines
    WHERE id = v_session.machine_id
    FOR UPDATE;

    IF NOT FOUND OR v_machine_owner IS DISTINCT FROM v_session.user_id OR COALESCE(v_machine_busy, false) = false THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'award_drops_without_valid_lock', 'high',
        jsonb_build_object('session_id', p_session_id, 'machine_id', v_session.machine_id, 'machine_owner', v_machine_owner, 'machine_busy', v_machine_busy));
      RAISE EXCEPTION 'Machine lock ownership invalid for rewarding';
    END IF;
  END IF;

  v_machine_type := COALESCE(v_machine_type, 'generic');

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

  -- ── Fetch tokenomics config ──
  SELECT
    tc.use_drop_model_v2,
    tc.max_drops_per_session,
    tc.max_drops_per_day,
    tc.max_drops_per_week,
    tc.max_rewarded_sessions_per_day,
    tc.rewarded_sessions_cap_mode,
    tc.session_restart_grace_sec,
    tc.session_soft_tier_1_factor,
    tc.session_soft_tier_2_factor,
    tc.session_soft_tier_1_span_ratio,
    tc.split_merge_window_sec
  INTO
    v_use_drop_model_v2,
    v_max_session,
    v_max_daily,
    v_max_weekly,
    v_max_sessions_day,
    v_cap_mode,
    v_restart_grace_sec,
    v_tier1_factor,
    v_tier2_factor,
    v_tier1_span_ratio,
    v_merge_window_sec
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = v_session.gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = v_session.gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_max_session      := COALESCE(v_max_session, 120);
  v_max_daily        := COALESCE(v_max_daily, 300);
  v_max_weekly       := COALESCE(v_max_weekly, 1500);
  v_max_sessions_day := COALESCE(v_max_sessions_day, 4);
  v_cap_mode         := COALESCE(v_cap_mode, 'soft');
  v_restart_grace_sec:= COALESCE(v_restart_grace_sec, 300);
  v_tier1_factor     := COALESCE(v_tier1_factor, 0.40);
  v_tier2_factor     := COALESCE(v_tier2_factor, 0.15);
  v_tier1_span_ratio := COALESCE(v_tier1_span_ratio, 0.50);
  v_merge_window_sec := COALESCE(v_merge_window_sec, 900);

  v_duration_sec := COALESCE(v_session.duration_seconds, 0);
  v_capped_sec := LEAST(GREATEST(v_duration_sec, 0), 10800);

  -- ── Short session guard ──
  IF v_duration_sec < 120 THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'session_too_short_for_reward', 'low',
      jsonb_build_object('session_id', p_session_id, 'duration_seconds', v_duration_sec));
    v_raw_drops := 0;
    v_multiplier := 1.0;
    v_drop_calc_v2 := jsonb_build_object(
      'enabled', v_use_drop_model_v2,
      'raw_drops', 0,
      'adjusted_drops', 0,
      'reasons', jsonb_build_array('session_too_short'),
      'inputs', jsonb_build_object('duration_seconds', v_duration_sec)
    );
  ELSE
    -- ── Calculate raw drops ──
    v_rm := COALESCE(v_session.raw_metrics, '{}'::jsonb);
    v_quality_flags := COALESCE(v_rm->'quality_flags', '{}'::jsonb);

    v_avg_rpm := CASE WHEN COALESCE(v_rm->>'avg_rpm', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'avg_rpm')::NUMERIC END;
    v_rpm_peak := CASE WHEN COALESCE(v_rm->>'rpm_peak', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'rpm_peak')::NUMERIC END;
    v_speed_avg_kmh := CASE WHEN COALESCE(v_rm->>'speed_avg_kmh', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'speed_avg_kmh')::NUMERIC END;
    v_incline_avg_pct := CASE WHEN COALESCE(v_rm->>'incline_avg_pct', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'incline_avg_pct')::NUMERIC END;
    v_cadence_avg := CASE WHEN COALESCE(v_rm->>'cadence_avg', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'cadence_avg')::NUMERIC END;
    v_steps_avg := CASE WHEN COALESCE(v_rm->>'steps_per_min_avg', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'steps_per_min_avg')::NUMERIC END;
    v_resistance_avg := CASE WHEN COALESCE(v_rm->>'resistance_avg', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'resistance_avg')::NUMERIC END;

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

  -- ── Count today's rewarded sessions + minted totals ──
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

  -- ── BLE restart-fragment reconciliation ──
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

  -- ── Rewarded sessions cap — mode-aware ──
  v_reasons_arr := COALESCE(v_drop_calc_v2->'reasons', '[]'::jsonb);

  IF v_cap_mode = 'off' THEN
    NULL; -- no enforcement

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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SOFT SESSION THRESHOLD + ANTI-SPLIT MERGE ACCOUNTING
  -- (only if not hard-blocked by rewarded_sessions_cap)
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_cap_reason IS DISTINCT FROM 'rewarded_sessions_cap_hard_block' THEN

    -- Anti-split: aggregate drops already awarded in recent adjacent sessions
    -- within merge window (same user, same day, any machine).
    -- This prevents gaining extra by splitting into many short sessions.
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
        AND v_session.started_at <= s2.ended_at + (v_merge_window_sec || ' seconds')::INTERVAL
        AND v_session.started_at >= s2.started_at;
    END IF;

    -- Piecewise soft-threshold function:
    --   threshold = max_drops_per_session
    --   tier1_end = threshold + threshold * span_ratio
    --   segment A (0..threshold):   100%
    --   segment B (threshold..tier1_end): tier1_factor
    --   segment C (tier1_end..):    tier2_factor
    --
    -- Apply function to (merged_prior + raw_drops) combined, then subtract
    -- what was already credited for merged_prior, to get THIS session's fair share.

    v_soft_threshold := v_max_session;
    v_tier1_end := v_soft_threshold + ROUND(v_soft_threshold * v_tier1_span_ratio);
    v_combined_drops := v_merged_prior_drops + v_raw_drops;

    -- Apply piecewise to combined total
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

    -- Apply piecewise to prior-only (what was already awarded)
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

    -- This session gets the marginal difference
    v_raw_drops := GREATEST(0, v_soft_adjusted - v_prior_soft_adjusted);

    -- Track reason codes for what happened
    IF v_combined_drops > v_soft_threshold THEN
      v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_threshold_reached'::TEXT);
      IF v_combined_drops > v_tier1_end THEN
        v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_tier_2_applied'::TEXT);
      ELSE
        v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_tier_1_applied'::TEXT);
      END IF;
    END IF;

    -- Day cap
    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_cap_after_day := LEAST(v_raw_drops, v_day_remaining);
    IF v_cap_after_day < v_raw_drops THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_day_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'raw_drops', v_raw_drops, 'day_remaining', v_day_remaining));
      IF v_cap_reason IS NULL THEN v_cap_reason := 'drop_cap_day_hit'; END IF;
      v_reasons_arr := v_reasons_arr || to_jsonb('drop_cap_day_hit'::TEXT);
    END IF;

    -- Week cap
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

  -- ── Persist metadata ──
  v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
    'rewarded_sessions_cap_mode', v_cap_mode,
    'session_restart_grace_sec', v_restart_grace_sec,
    'soft_threshold', v_soft_threshold,
    'tier1_factor', v_tier1_factor,
    'tier2_factor', v_tier2_factor,
    'tier1_span_ratio', v_tier1_span_ratio,
    'merged_prior_drops', v_merged_prior_drops,
    'combined_drops', v_combined_drops,
    'soft_adjusted_combined', v_soft_adjusted,
    'prior_soft_adjusted', v_prior_soft_adjusted,
    'session_marginal_drops', GREATEST(0, COALESCE(v_soft_adjusted, 0) - COALESCE(v_prior_soft_adjusted, 0)),
    'final_drops', v_final_drops,
    'reasons', v_reasons_arr
  );

  IF v_restart_merged_count > 0 THEN
    v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
      'restart_merged_count', v_restart_merged_count,
      'effective_rewarded_sessions', v_effective_rewarded_sessions
    );
  END IF;
  IF v_cap_reason IS NOT NULL THEN
    v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object('cap_reason', v_cap_reason);
  END IF;

  -- ── Streak ──
  v_new_streak := CASE
    WHEN v_profile.last_visit_date IS NULL THEN 1
    WHEN v_profile.last_visit_date = v_today THEN v_profile.streak_days
    WHEN v_profile.last_visit_date = v_today - 1 THEN v_profile.streak_days + 1
    ELSE 1
  END;

  -- ── Finalize session ──
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
       'Workout session — ' || v_final_drops || ' drops (×' || v_multiplier || ')');

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

-- ============================================================================
-- 3. get_user_drop_limits() — return soft-tier fields
--    Must DROP first because return type changes (adding new OUT columns).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_user_drop_limits(uuid);

CREATE OR REPLACE FUNCTION public.get_user_drop_limits(p_gym_id uuid)
 RETURNS TABLE(
   max_drops_per_session integer,
   max_rewarded_sessions_per_day integer,
   max_drops_per_day integer,
   max_drops_per_week integer,
   rewarded_sessions_cap_mode text,
   session_restart_grace_sec integer,
   session_soft_tier_1_factor numeric,
   session_soft_tier_2_factor numeric,
   session_soft_tier_1_span_ratio numeric,
   split_merge_window_sec integer
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_allowed BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.gym_memberships gm
    WHERE gm.user_id = v_uid AND gm.gym_id = p_gym_id
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND EXISTS (
          SELECT 1 FROM public.gyms g WHERE g.id = p_gym_id AND g.owner_id = v_uid
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = p_gym_id)
      )
  )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(tc.max_drops_per_session, 120)::INTEGER,
    COALESCE(tc.max_rewarded_sessions_per_day, 4)::INTEGER,
    COALESCE(tc.max_drops_per_day, 300)::INTEGER,
    COALESCE(tc.max_drops_per_week, 1500)::INTEGER,
    COALESCE(tc.rewarded_sessions_cap_mode, 'soft')::TEXT,
    COALESCE(tc.session_restart_grace_sec, 300)::INTEGER,
    COALESCE(tc.session_soft_tier_1_factor, 0.40)::NUMERIC,
    COALESCE(tc.session_soft_tier_2_factor, 0.15)::NUMERIC,
    COALESCE(tc.session_soft_tier_1_span_ratio, 0.50)::NUMERIC,
    COALESCE(tc.split_merge_window_sec, 900)::INTEGER
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = p_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;
END;
$function$;
