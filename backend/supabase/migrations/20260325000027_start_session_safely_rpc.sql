-- Migration: 20260325000001_start_session_safely_rpc.sql
-- Description: Atomic scanner session start to avoid duplicate active session race.

CREATE OR REPLACE FUNCTION public.start_session_safely(
  p_machine_id UUID,
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_device_hash TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  session_id UUID,
  action TEXT,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_machine_gym_id UUID;
  v_machine_active BOOLEAN;
  v_existing_machine_session_id UUID;
  v_existing_machine_user_id UUID;
  v_existing_user_session_id UUID;
  v_new_session_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'error'::TEXT, 'not_authenticated'::TEXT, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  SELECT m.gym_id, m.is_active
  INTO v_machine_gym_id, v_machine_active
  FROM public.machines m
  WHERE m.id = p_machine_id
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(v_machine_active, false) THEN
    RETURN QUERY SELECT false, NULL::UUID, 'error'::TEXT, 'machine_not_found'::TEXT, 'Machine not found or inactive'::TEXT;
    RETURN;
  END IF;

  -- If machine already has an active session, allow resume only for same user.
  SELECT s.id, s.user_id
  INTO v_existing_machine_session_id, v_existing_machine_user_id
  FROM public.sessions s
  WHERE s.machine_id = p_machine_id
    AND s.is_active = true
  ORDER BY COALESCE(s.started_at, s.created_at, NOW()) DESC, s.id DESC
  LIMIT 1;

  IF v_existing_machine_session_id IS NOT NULL THEN
    IF v_existing_machine_user_id = v_user_id THEN
      UPDATE public.machines
      SET is_busy = true,
          current_user_id = v_user_id,
          last_heartbeat = NOW()
      WHERE id = p_machine_id;

      RETURN QUERY SELECT true, v_existing_machine_session_id, 'resumed'::TEXT, NULL::TEXT, NULL::TEXT;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, NULL::UUID, 'error'::TEXT, 'machine_busy'::TEXT, 'Machine is already in use'::TEXT;
    RETURN;
  END IF;

  -- Enforce one active session per user with deterministic conflict message.
  SELECT s.id
  INTO v_existing_user_session_id
  FROM public.sessions s
  WHERE s.user_id = v_user_id
    AND s.is_active = true
  ORDER BY COALESCE(s.started_at, s.created_at, NOW()) DESC, s.id DESC
  LIMIT 1;

  IF v_existing_user_session_id IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'error'::TEXT, 'user_active_session_conflict'::TEXT, 'You already have an active session'::TEXT;
    RETURN;
  END IF;

  UPDATE public.machines
  SET is_busy = true,
      current_user_id = v_user_id,
      last_heartbeat = NOW()
  WHERE id = p_machine_id;

  INSERT INTO public.sessions (
    user_id,
    gym_id,
    machine_id,
    started_at,
    is_active,
    raw_metrics
  )
  VALUES (
    v_user_id,
    v_machine_gym_id,
    p_machine_id,
    p_started_at,
    true,
    jsonb_build_object(
      'security', jsonb_build_object(
        'device_hash', p_device_hash,
        'lock_required', true,
        'source', 'scanner'
      )
    )
  )
  RETURNING id INTO v_new_session_id;

  RETURN QUERY SELECT true, v_new_session_id, 'created'::TEXT, NULL::TEXT, NULL::TEXT;
  RETURN;
EXCEPTION
  WHEN unique_violation THEN
    -- Race fallback when another request wins unique active-session constraints.
    SELECT s.id, s.user_id
    INTO v_existing_machine_session_id, v_existing_machine_user_id
    FROM public.sessions s
    WHERE s.machine_id = p_machine_id
      AND s.is_active = true
    ORDER BY COALESCE(s.started_at, s.created_at, NOW()) DESC, s.id DESC
    LIMIT 1;

    IF v_existing_machine_session_id IS NOT NULL AND v_existing_machine_user_id = v_user_id THEN
      RETURN QUERY SELECT true, v_existing_machine_session_id, 'resumed'::TEXT, NULL::TEXT, NULL::TEXT;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, NULL::UUID, 'error'::TEXT, 'machine_busy'::TEXT, 'Machine is already in use'::TEXT;
    RETURN;
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, 'error'::TEXT, 'internal_error'::TEXT, SQLERRM::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_session_safely(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
