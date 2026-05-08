-- Migration: 20260509070000_machine_rpc_observed_ble_identity_check.sql
-- Description: Server-side BLE identity guard in heartbeat, RPM, and award_drops using
--              ble_device_name + ble_serial_number (replaces the obsolete
--              peripheral_id_matches_sensor / sensor_id approach from the skipped
--              migration 20260508210000_machine_rpc_observed_peripheral_id_check.sql.skipped).
--
-- AGENT NOTE: [2026-05-09] - supabase-dba
--
-- SUPERSEDES:
--   backend/supabase/migrations/20260508210000_machine_rpc_observed_peripheral_id_check.sql.skipped
--   That migration added peripheral_id_matches_sensor() and patched heartbeat/RPM/award_drops
--   to check the opaque Web Bluetooth device.id (sensor_id). It was never applied to
--   production and is now skipped.
--
-- THIS MIGRATION:
--   Adds the correct server-side BLE identity guard based on:
--     - ble_device_name (BLE Local Name, cross-device-stable)
--     - ble_serial_number (DIS Serial Number, hardware-bound)
--   Both columns were added to public.machines in the preceding migration
--   20260509060000_machines_ble_identity_name_and_serial.sql.
--
-- PLAN REFERENCE:
--   docs/plans/feature_ble_machine_identity_name_and_serial_redesign.md — Step 5
--
-- CHANGES:
--   - NEW function: public.ble_identity_matches_machine(TEXT, TEXT, TEXT, TEXT, BOOLEAN) → BOOLEAN
--   - UPDATED: public.update_machine_heartbeat — adds optional p_observed_name + p_observed_serial
--   - UPDATED: public.update_machine_rpm — same as heartbeat
--   - UPDATED: public.award_drops — early-exit guard for ble_identity_mismatch flag
--
-- BACKWARD COMPATIBILITY:
--   All new params have DEFAULT NULL. Existing mobile builds that do not send
--   observed_name / observed_serial will pass NULL → ble_identity_matches_machine
--   treats NULL inputs as fail-open (TRUE) → no behaviour change.
--
-- IMPACT ON FRONTEND:
--   - Mobile App (Step 4 — workout.tsx):
--       Pass p_observed_name + p_observed_serial (from bleService.getConnectedDeviceName()
--       / getConnectedSerialNumber()) in every supabase.rpc('update_machine_heartbeat')
--       and supabase.rpc('update_machine_rpm') call.
--   - Admin Panel: no change.
--
-- NEW FRAUD EVENT TYPES (no schema change — TEXT column):
--   - ble_identity_server_mismatch (severity high) — heartbeat/RPM mismatch detected
--   - drops_zeroed_ble_identity_mismatch (severity high) — award_drops zeroed session
--
-- BREAKING CHANGES:
--   None. NULL observed values fail-open. Older mobile builds unaffected.

-- ═══════════════════════════════════════════════════════════════
-- 1. ble_identity_matches_machine — immutable identity comparison helper
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ble_identity_matches_machine(
  p_observed_name    TEXT,
  p_observed_serial  TEXT,
  p_expected_name    TEXT,
  p_expected_serial  TEXT,
  p_pairing_verified BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Backward compat: client sent no observation → fail open.
  -- This path is taken by old mobile builds that pre-date Step 3 of the
  -- BLE identity redesign plan. They cannot be checked but cannot be
  -- blocked either — blocking would break legitimate old clients.
  IF p_observed_name IS NULL AND p_observed_serial IS NULL THEN
    RETURN TRUE;
  END IF;

  -- STRICT MODE: pairing was verified post-connect with DIS serial.
  -- Serial is hardware-bound truth.
  IF p_pairing_verified AND p_expected_serial IS NOT NULL THEN
    IF p_observed_serial IS NOT NULL THEN
      -- Serial match is the definitive check.
      RETURN p_observed_serial = p_expected_serial;
    END IF;
    -- Serial expected but not observed (DIS read may have failed transiently).
    -- Fall back to name check as belt-and-suspenders.
    IF p_observed_name IS NOT NULL AND p_expected_name IS NOT NULL THEN
      RETURN p_observed_name = p_expected_name;
    END IF;
    -- No observation at all in strict mode → cannot verify → fail closed.
    RETURN FALSE;
  END IF;

  -- LOOSE MODE: only name on file (legacy / pre-verified machine).
  IF p_expected_name IS NOT NULL THEN
    IF p_observed_name IS NOT NULL THEN
      RETURN p_observed_name = p_expected_name;
    END IF;
    -- Expected name exists but client sent no name → fail closed.
    -- Client should always send the name it connected to; absence is suspect.
    RETURN FALSE;
  END IF;

  -- LEGACY MACHINE: no ble_device_name on file yet (row predates migration).
  -- Fail open — the auto-backfill RPC (cache_machine_ble_identity) will
  -- populate the name on this same connection, after which future heartbeats
  -- from name-aware clients will enforce the check.
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.ble_identity_matches_machine(TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Immutable BLE identity comparison for server-side cross-talk prevention. '
  'Returns TRUE (allow) in the following cases: '
  '  - Both observed values are NULL (backward-compat with old mobile builds). '
  '  - Pairing verified + serial present + observed serial matches. '
  '  - Pairing verified + serial present + observed serial absent but name matches. '
  '  - Only name on file + observed name matches. '
  '  - No name or serial on file yet (legacy machine, fail open for first backfill). '
  'Returns FALSE (block) when a mismatch is detected between observed and expected '
  'identity, indicating the client is communicating with a different physical machine '
  'than the one whose lock it holds (cross-talk).';

-- ═══════════════════════════════════════════════════════════════
-- 2. update_machine_heartbeat — adds BLE identity check
-- Base implementation from 20260324000014_fraud_events_and_logging.sql,
-- extended with p_observed_name + p_observed_serial DEFAULT NULL params
-- and the identity mismatch guard + session flagging.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_machine_heartbeat(
  p_machine_id      UUID,
  p_user_id         UUID,
  p_observed_name   TEXT DEFAULT NULL,
  p_observed_serial TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id           UUID;
  v_expected_name    TEXT;
  v_expected_serial  TEXT;
  v_pairing_verified BOOLEAN;
  v_session_id       UUID;
BEGIN
  SELECT gym_id, ble_device_name, ble_serial_number, ble_pairing_verified
  INTO v_gym_id, v_expected_name, v_expected_serial, v_pairing_verified
  FROM public.machines
  WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(
      auth.uid(), v_gym_id, 'heartbeat_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- BLE identity check: blocks cross-talk heartbeats from counting.
  IF NOT public.ble_identity_matches_machine(
    p_observed_name, p_observed_serial,
    v_expected_name, v_expected_serial, COALESCE(v_pairing_verified, false)
  ) THEN
    PERFORM public.log_fraud_event(
      p_user_id, v_gym_id, 'ble_identity_server_mismatch', 'high',
      jsonb_build_object(
        'machine_id',      p_machine_id,
        'check',           'heartbeat',
        'expected_name',   v_expected_name,
        'expected_serial', v_expected_serial,
        'observed_name',   p_observed_name,
        'observed_serial', p_observed_serial,
        'pairing_verified', v_pairing_verified
      ));

    -- Flag the active session so award_drops can zero it out.
    SELECT id INTO v_session_id
    FROM public.sessions
    WHERE user_id  = p_user_id
      AND machine_id = p_machine_id
      AND is_active  = true
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      UPDATE public.sessions
      SET raw_metrics = jsonb_set(
            COALESCE(raw_metrics, '{}'::jsonb),
            '{security,ble_identity_mismatch}',
            '"true"'::jsonb,
            true
          ),
          updated_at = NOW()
      WHERE id = v_session_id;
    END IF;

    RETURN FALSE;
  END IF;

  -- Update heartbeat timestamp only when the caller holds the lock.
  UPDATE public.machines
  SET last_heartbeat = NOW()
  WHERE id              = p_machine_id
    AND current_user_id = p_user_id
    AND is_busy         = true;

  IF NOT FOUND THEN
    PERFORM public.log_fraud_event(
      p_user_id, v_gym_id, 'heartbeat_without_lock', 'medium',
      jsonb_build_object('machine_id', p_machine_id));
  END IF;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.update_machine_heartbeat(UUID, UUID, TEXT, TEXT) IS
  'Extends the machine heartbeat for an active session. '
  'New optional params p_observed_name / p_observed_serial carry the BLE Local Name '
  'and DIS Serial Number observed by the mobile client. On mismatch: logs '
  'ble_identity_server_mismatch fraud event, sets '
  'sessions.raw_metrics.security.ble_identity_mismatch = "true", returns FALSE. '
  'NULL observed values fail-open for backward compat with old mobile builds.';

-- ═══════════════════════════════════════════════════════════════
-- 3. update_machine_rpm — adds BLE identity check
-- Same pattern as heartbeat.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_machine_rpm(
  p_machine_id      UUID,
  p_user_id         UUID,
  p_rpm             INTEGER,
  p_observed_name   TEXT DEFAULT NULL,
  p_observed_serial TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id           UUID;
  v_expected_name    TEXT;
  v_expected_serial  TEXT;
  v_pairing_verified BOOLEAN;
  v_session_id       UUID;
BEGIN
  SELECT gym_id, ble_device_name, ble_serial_number, ble_pairing_verified
  INTO v_gym_id, v_expected_name, v_expected_serial, v_pairing_verified
  FROM public.machines
  WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(
      auth.uid(), v_gym_id, 'rpm_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- BLE identity check: blocks cross-talk RPM values from corrupting the session.
  IF NOT public.ble_identity_matches_machine(
    p_observed_name, p_observed_serial,
    v_expected_name, v_expected_serial, COALESCE(v_pairing_verified, false)
  ) THEN
    PERFORM public.log_fraud_event(
      p_user_id, v_gym_id, 'ble_identity_server_mismatch', 'high',
      jsonb_build_object(
        'machine_id',      p_machine_id,
        'check',           'rpm',
        'expected_name',   v_expected_name,
        'expected_serial', v_expected_serial,
        'observed_name',   p_observed_name,
        'observed_serial', p_observed_serial,
        'pairing_verified', v_pairing_verified,
        'rpm',             p_rpm
      ));

    -- Flag the active session for award_drops to zero.
    SELECT id INTO v_session_id
    FROM public.sessions
    WHERE user_id  = p_user_id
      AND machine_id = p_machine_id
      AND is_active  = true
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      UPDATE public.sessions
      SET raw_metrics = jsonb_set(
            COALESCE(raw_metrics, '{}'::jsonb),
            '{security,ble_identity_mismatch}',
            '"true"'::jsonb,
            true
          ),
          updated_at = NOW()
      WHERE id = v_session_id;
    END IF;

    RETURN FALSE;
  END IF;

  -- Update last_rpm only when the caller holds the lock.
  UPDATE public.machines
  SET last_rpm = p_rpm
  WHERE id              = p_machine_id
    AND current_user_id = p_user_id
    AND is_busy         = true;

  IF NOT FOUND THEN
    PERFORM public.log_fraud_event(
      p_user_id, v_gym_id, 'rpm_without_lock', 'medium',
      jsonb_build_object('machine_id', p_machine_id, 'rpm', p_rpm));
  END IF;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.update_machine_rpm(UUID, UUID, INTEGER, TEXT, TEXT) IS
  'Updates machines.last_rpm for an active session. '
  'New optional params p_observed_name / p_observed_serial carry the BLE Local Name '
  'and DIS Serial Number observed by the mobile client. On mismatch: logs '
  'ble_identity_server_mismatch fraud event (check="rpm"), sets '
  'sessions.raw_metrics.security.ble_identity_mismatch = "true", returns FALSE '
  '(does NOT overwrite last_rpm with cross-talk data). '
  'NULL observed values fail-open for backward compat with old mobile builds.';

-- ═══════════════════════════════════════════════════════════════
-- 4. award_drops — adds early-exit guard for ble_identity_mismatch
-- Full body from 20260425182000_award_drops_per_gym_caps.sql with a
-- single new guard block inserted after the auth check, before the
-- short-circuit for already-finalised sessions.
-- All other behaviour (per-gym caps, soft tiers, happy-hour boost,
-- leaderboard upsert, side-effects enqueue) is byte-identical.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.award_drops(p_session_id uuid)
RETURNS TABLE(drops_earned integer, multiplier numeric, badges_earned text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session       RECORD;
  v_profile       RECORD;

  v_base_drops    INTEGER;
  v_raw_drops     INTEGER;
  v_final_drops   INTEGER;
  v_multiplier    NUMERIC := 1.0;
  v_balance_after INTEGER;
  v_new_streak    INTEGER;

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

  v_boost_info     JSONB;
  v_boost_mult     NUMERIC := 1.0;
  v_pre_boost_drops INTEGER := 0;

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
  -- LOAD SESSION (with row lock)
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

  -- ═══════════════════════════════════════════════════════════════
  -- BLE IDENTITY MISMATCH GUARD (NEW — Step 5 of BLE identity plan)
  -- If the heartbeat or RPM handler detected that the client was
  -- communicating with a different physical machine than the one
  -- whose lock it holds, the session is flagged and zeroed here.
  -- This prevents cross-talk drops from ever being awarded even if
  -- the session duration exceeded the 120s minimum threshold.
  -- ═══════════════════════════════════════════════════════════════
  IF (v_session.raw_metrics #>> '{security,ble_identity_mismatch}') = 'true' THEN
    PERFORM public.log_fraud_event(
      v_session.user_id, v_session.gym_id,
      'drops_zeroed_ble_identity_mismatch', 'high',
      jsonb_build_object(
        'session_id', p_session_id,
        'machine_id', v_session.machine_id
      ));

    UPDATE public.sessions
    SET drops_earned = 0,
        multiplier   = 1.0,
        ended_at     = COALESCE(ended_at, NOW()),
        is_active    = false,
        raw_metrics  = jsonb_set(
          COALESCE(raw_metrics, '{}'::jsonb),
          '{security,drops_zeroed_reason}',
          '"ble_identity_mismatch"'::jsonb,
          true
        ),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN QUERY SELECT 0::INTEGER, 1.0::NUMERIC, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_session.drops_earned > 0 OR v_session.is_active = false THEN
    RETURN QUERY SELECT COALESCE(v_session.drops_earned, 0)::INT,
                        COALESCE(v_session.multiplier, 1.0)::NUMERIC,
                        ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- LOAD PROFILE + TOKENOMICS CONFIG
  -- Falls back to global default (gym_id IS NULL) when this gym
  -- doesn't have its own row.
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
      COALESCE(tc.session_restart_grace_sec, v_restart_grace_sec),
      COALESCE(tc.session_soft_tier_1_factor, v_tier1_factor),
      COALESCE(tc.session_soft_tier_2_factor, v_tier2_factor),
      COALESCE(tc.session_soft_tier_1_span_ratio, v_tier1_span_ratio),
      COALESCE(tc.split_merge_window_sec, v_merge_window_sec)
    INTO
      v_max_session, v_max_daily, v_max_weekly, v_max_sessions_day,
      v_use_drop_model_v2, v_cap_mode, v_restart_grace_sec,
      v_tier1_factor, v_tier2_factor, v_tier1_span_ratio, v_merge_window_sec
    FROM public.tokenomics_config tc
    WHERE (tc.gym_id = v_session.gym_id OR tc.gym_id IS NULL)
    ORDER BY CASE WHEN tc.gym_id = v_session.gym_id THEN 0 ELSE 1 END
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
  -- REWARDED SESSIONS COUNT + RESTART RECONCILIATION (PER GYM)
  -- All cap-bookkeeping queries below are restricted to v_session.gym_id
  -- so each gym maintains its own daily/weekly/session quota.
  -- ═══════════════════════════════════════════════════════════════
  SELECT COUNT(*)::INT, COALESCE(SUM(s.drops_earned), 0)::INT
  INTO v_rewarded_sessions_today, v_minted_today
  FROM public.sessions s
  WHERE s.user_id = v_session.user_id
    AND s.gym_id  = v_session.gym_id
    AND s.id <> v_session.id
    AND s.is_active = false
    AND s.drops_earned > 0
    AND DATE(s.started_at AT TIME ZONE 'Europe/Belgrade') = v_today;

  SELECT COALESCE(SUM(s.drops_earned), 0)::INT
  INTO v_minted_week
  FROM public.sessions s
  WHERE s.user_id = v_session.user_id
    AND s.gym_id  = v_session.gym_id
    AND s.id <> v_session.id
    AND s.is_active = false
    AND s.drops_earned > 0
    AND DATE(s.started_at AT TIME ZONE 'Europe/Belgrade') >= v_week_start;

  IF v_restart_grace_sec > 0 AND v_session.machine_id IS NOT NULL THEN
    SELECT COUNT(*)::INT INTO v_restart_merged_count
    FROM public.sessions s_inner
    WHERE s_inner.user_id = v_session.user_id
      AND s_inner.gym_id  = v_session.gym_id
      AND s_inner.machine_id = v_session.machine_id
      AND s_inner.id <> v_session.id
      AND s_inner.is_active = false
      AND s_inner.drops_earned > 0
      AND DATE(s_inner.started_at AT TIME ZONE 'Europe/Belgrade') = v_today
      AND EXISTS (
        SELECT 1 FROM public.sessions s_prev
        WHERE s_prev.user_id = v_session.user_id
          AND s_prev.gym_id  = v_session.gym_id
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
  -- REWARDED SESSIONS CAP + SOFT TIERS + HAPPY HOUR + DAY/WEEK CAPS
  -- ═══════════════════════════════════════════════════════════════
  v_reasons_arr := COALESCE(v_drop_calc_v2->'reasons', '[]'::jsonb);

  IF v_cap_mode = 'off' THEN
    NULL;
  ELSIF v_cap_mode = 'hard' AND v_effective_rewarded_sessions >= v_max_sessions_day THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id,
      'drop_cap_rewarded_sessions_day_hit', 'medium',
      jsonb_build_object('session_id', p_session_id, 'mode', 'hard',
        'max_rewarded_sessions_per_day', v_max_sessions_day,
        'effective_rewarded', v_effective_rewarded_sessions,
        'restart_merged', v_restart_merged_count));
    v_final_drops := 0;
    v_cap_reason := 'rewarded_sessions_cap_hard_block';
    v_reasons_arr := v_reasons_arr || to_jsonb('rewarded_sessions_cap_hard_block'::TEXT);
  ELSIF v_cap_mode = 'soft' AND v_effective_rewarded_sessions >= v_max_sessions_day THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id,
      'rewarded_sessions_cap_soft_signal', 'low',
      jsonb_build_object('session_id', p_session_id, 'mode', 'soft',
        'max_rewarded_sessions_per_day', v_max_sessions_day,
        'effective_rewarded', v_effective_rewarded_sessions,
        'restart_merged', v_restart_merged_count));
    v_cap_reason := 'rewarded_sessions_cap_soft_signal';
    v_reasons_arr := v_reasons_arr || to_jsonb('rewarded_sessions_cap_soft_signal'::TEXT);
  END IF;

  IF v_cap_reason IS DISTINCT FROM 'rewarded_sessions_cap_hard_block' THEN
    -- Anti-split merge window: also gym-scoped so a session at gym1 cannot
    -- erode the soft threshold available at gym2.
    v_merged_prior_drops := 0;
    IF v_merge_window_sec > 0 THEN
      SELECT COALESCE(SUM(s2.drops_earned), 0)::INT
      INTO v_merged_prior_drops
      FROM public.sessions s2
      WHERE s2.user_id = v_session.user_id
        AND s2.gym_id  = v_session.gym_id
        AND s2.id <> v_session.id
        AND s2.is_active = false AND s2.drops_earned > 0
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

    v_raw_drops := GREATEST(0, v_soft_adjusted - v_prior_soft_adjusted);

    IF v_combined_drops > v_soft_threshold THEN
      v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_threshold_reached'::TEXT);
      IF v_combined_drops > v_tier1_end THEN
        v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_tier_2_applied'::TEXT);
      ELSE
        v_reasons_arr := v_reasons_arr || to_jsonb('session_soft_tier_1_applied'::TEXT);
      END IF;
    END IF;

    v_boost_info := public.get_active_drop_boost(v_session.gym_id, v_session.started_at, v_machine_type);
    v_boost_mult := COALESCE((v_boost_info->>'multiplier')::NUMERIC, 1.0);

    IF v_boost_mult > 1.0 AND v_raw_drops > 0 THEN
      v_pre_boost_drops := v_raw_drops;
      v_raw_drops := ROUND(v_raw_drops * v_boost_mult)::INTEGER;
      v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
        'happy_hour', jsonb_build_object(
          'active', true, 'multiplier', v_boost_mult,
          'rule_id', v_boost_info->>'rule_id', 'rule_name', v_boost_info->>'rule_name',
          'pre_boost_drops', v_pre_boost_drops, 'post_boost_drops', v_raw_drops));
    ELSE
      v_drop_calc_v2 := v_drop_calc_v2 || jsonb_build_object(
        'happy_hour', jsonb_build_object('active', false, 'multiplier', 1.0));
    END IF;

    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_cap_after_day := LEAST(v_raw_drops, v_day_remaining);
    IF v_cap_after_day < v_raw_drops THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_day_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'raw_drops', v_raw_drops, 'day_remaining', v_day_remaining));
      IF v_cap_reason IS NULL THEN v_cap_reason := 'drop_cap_day_hit'; END IF;
      v_reasons_arr := v_reasons_arr || to_jsonb('drop_cap_day_hit'::TEXT);
    END IF;

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
      'mode', v_cap_mode, 'grace_sec', v_restart_grace_sec,
      'max_per_day', v_max_sessions_day,
      'gym_scoped', true),
    'soft_session', jsonb_build_object(
      'threshold', v_soft_threshold, 'tier1_end', v_tier1_end,
      'tier1_factor', v_tier1_factor, 'tier2_factor', v_tier2_factor,
      'tier1_span_ratio', v_tier1_span_ratio,
      'merged_prior_drops', v_merged_prior_drops,
      'combined_drops', v_combined_drops,
      'adjusted_combined', v_soft_adjusted,
      'adjusted_prior', v_prior_soft_adjusted,
      'marginal_credit', GREATEST(0, COALESCE(v_soft_adjusted, 0) - COALESCE(v_prior_soft_adjusted, 0))),
    'caps', jsonb_build_object(
      'day_remaining', v_day_remaining, 'week_remaining', v_week_remaining,
      'final_drops', v_final_drops, 'merge_window_sec', v_merge_window_sec,
      'gym_scoped', true),
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
  -- CORE WRITE: session + profile + wallet + transaction
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
  FROM public.profiles WHERE id = v_session.user_id;

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

    -- Inline leaderboard score update — kept identical to 20260413000002 for
    -- immediate visibility after a workout. The 5-minute cron rewrites this
    -- with a fresh aggregate.
    INSERT INTO public.leaderboard_live_scores
      (gym_id, user_id, weekly_score, monthly_score, alltime_score, refreshed_at)
    VALUES
      (v_session.gym_id, v_session.user_id,
       v_final_drops::NUMERIC, v_final_drops::NUMERIC, v_final_drops::NUMERIC,
       NOW())
    ON CONFLICT (gym_id, user_id) DO UPDATE SET
      weekly_score  = leaderboard_live_scores.weekly_score  + EXCLUDED.weekly_score,
      monthly_score = leaderboard_live_scores.monthly_score + EXCLUDED.monthly_score,
      alltime_score = leaderboard_live_scores.alltime_score + EXCLUDED.alltime_score,
      refreshed_at  = NOW();
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- ENQUEUE SIDE EFFECTS (async processing by cron)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.pending_session_side_effects
    (session_id, user_id, gym_id, drops_earned)
  VALUES
    (p_session_id, v_session.user_id, v_session.gym_id, v_final_drops);

  RETURN QUERY SELECT v_final_drops, v_multiplier, ARRAY[]::TEXT[];
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_drops(UUID) TO authenticated;

COMMENT ON FUNCTION public.award_drops(UUID) IS
  'Computes and awards drops for a finished session. '
  'NEW: early-exit BLE identity mismatch guard — sessions flagged with '
  'raw_metrics.security.ble_identity_mismatch = "true" (set by update_machine_heartbeat '
  'or update_machine_rpm when cross-talk is detected) receive 0 drops and a '
  'drops_zeroed_ble_identity_mismatch fraud event is logged. '
  'All other cap-bookkeeping (rewarded sessions today, minted today/week, '
  'restart-grace, anti-split merge window) is gym-scoped — drops earned '
  'at one gym do not consume another gym''s daily/weekly quota. '
  'Updates sessions, profiles, gym_memberships, drops_transactions, '
  'drop_limit_counters, and leaderboard_live_scores synchronously; '
  'enqueues pending_session_side_effects for async fan-out (challenges, '
  'arenas, badges, snapshots, implicit checkin).';

-- ═══════════════════════════════════════════════════════════════
-- 5. SMOKE TESTS
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_fn_count INTEGER;
BEGIN
  -- Verify ble_identity_matches_machine function exists
  SELECT COUNT(*) INTO v_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'ble_identity_matches_machine',
      'update_machine_heartbeat',
      'update_machine_rpm',
      'award_drops'
    );
  IF v_fn_count < 4 THEN
    RAISE EXCEPTION 'Smoke test FAILED: expected 4 updated functions, found %', v_fn_count;
  END IF;

  -- Spot-check ble_identity_matches_machine logic:
  -- NULL observed → TRUE (fail open for old clients)
  IF NOT public.ble_identity_matches_machine(NULL, NULL, '38069-129', 'SN001', true) THEN
    RAISE EXCEPTION 'Smoke test FAILED: NULL observed should fail-open but returned FALSE';
  END IF;
  -- Matching name + serial (verified) → TRUE
  IF NOT public.ble_identity_matches_machine('38069-129', 'SN001', '38069-129', 'SN001', true) THEN
    RAISE EXCEPTION 'Smoke test FAILED: matching identity should return TRUE';
  END IF;
  -- Mismatched serial (verified) → FALSE
  IF public.ble_identity_matches_machine('38069-129', 'SN_WRONG', '38069-129', 'SN001', true) THEN
    RAISE EXCEPTION 'Smoke test FAILED: serial mismatch should return FALSE';
  END IF;
  -- Name mismatch (unverified, name-only mode) → FALSE
  IF public.ble_identity_matches_machine('38069-130', NULL, '38069-129', NULL, false) THEN
    RAISE EXCEPTION 'Smoke test FAILED: name mismatch should return FALSE';
  END IF;
  -- No expected name (legacy machine) → TRUE (fail open for backfill)
  IF NOT public.ble_identity_matches_machine('38069-129', NULL, NULL, NULL, false) THEN
    RAISE EXCEPTION 'Smoke test FAILED: legacy machine (no expected name) should fail-open TRUE';
  END IF;

  RAISE NOTICE
    'Migration 20260509070000 applied successfully. '
    'ble_identity_matches_machine, update_machine_heartbeat, update_machine_rpm, '
    'and award_drops updated with BLE identity guard. All smoke tests passed.';
END $$;
