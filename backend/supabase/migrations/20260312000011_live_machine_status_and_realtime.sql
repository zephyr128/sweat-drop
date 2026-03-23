-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000011_live_machine_status_and_realtime.sql
-- Description: RPC for live machine status (busy/available with active
--   session + user data) and enable Supabase Realtime on machines/sessions.
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/feature_machine_heatmap.md — Phase 1 (Tasks 1B + 1C)
--
-- CHANGES:
--   - New RPC: get_live_machine_status(gym_id)
--   - Enable Realtime publication for machines and sessions tables
--
-- IMPACT ON FRONTEND:
--   - Admin: Can call this RPC for the Live Monitor tab, subscribe to
--     Realtime events on machines/sessions for instant updates
--   - Mobile: No impact
--
-- BREAKING CHANGES: None (additive)
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- 1. Live machine status RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_live_machine_status(
  p_gym_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'timestamp', NOW(),

    -- 1. Summary counts
    'summary', (
      SELECT jsonb_build_object(
        'total_machines',  COUNT(*),
        'active_now',      COUNT(*) FILTER (WHERE m.is_busy = true),
        'available',       COUNT(*) FILTER (WHERE m.is_busy = false AND m.is_active = true AND COALESCE(m.is_under_maintenance, false) = false),
        'maintenance',     COUNT(*) FILTER (WHERE COALESCE(m.is_under_maintenance, false) = true),
        'inactive',        COUNT(*) FILTER (WHERE m.is_active = false)
      )
      FROM machines m
      WHERE m.gym_id = p_gym_id
    ),

    -- 2. All machines with current state + active user/session data
    'machines', (
      SELECT COALESCE(jsonb_agg(row_to_json(mdata) ORDER BY mdata.is_busy DESC, mdata.name), '[]'::jsonb)
      FROM (
        SELECT
          m.id,
          m.name,
          m.type,
          m.zone,
          m.is_active,
          m.is_busy,
          COALESCE(m.is_under_maintenance, false) AS is_under_maintenance,
          m.last_heartbeat,
          m.last_rpm,

          CASE WHEN m.is_busy AND m.current_user_id IS NOT NULL THEN
            jsonb_build_object(
              'id',         p.id,
              'username',   COALESCE(p.username, p.full_name, 'Unknown'),
              'avatar_url', p.avatar_url,
              'full_name',  p.full_name
            )
          ELSE NULL END AS current_user,

          CASE WHEN m.is_busy THEN (
            SELECT jsonb_build_object(
              'id',               s.id,
              'started_at',       s.started_at,
              'duration_seconds', s.duration_seconds,
              'average_rpm',      m.last_rpm,
              'calories',         COALESCE(s.calories, 0),
              'drops_earned',     COALESCE(s.drops_earned, 0),
              'elapsed_seconds',  EXTRACT(EPOCH FROM (NOW() - s.started_at))::INT
            )
            FROM sessions s
            WHERE s.machine_id = m.id
              AND s.is_active = true
            ORDER BY s.started_at DESC
            LIMIT 1
          ) ELSE NULL END AS active_session

        FROM machines m
        LEFT JOIN profiles p ON p.id = m.current_user_id
        WHERE m.gym_id = p_gym_id
      ) mdata
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_machine_status(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_live_machine_status(UUID) IS
  'Returns live status of all machines in a gym for the admin Live Monitor. '
  'Includes: summary counts (active/available/maintenance/inactive), '
  'per-machine state with current user profile and active session data. '
  'elapsed_seconds is server-computed from NOW() - started_at.';

-- ============================================================
-- 2. Enable Supabase Realtime for machines and sessions
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE machines;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
