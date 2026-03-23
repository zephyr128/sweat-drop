-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000010_machine_analytics_dashboard.sql
-- Description: RPC for machine analytics dashboard — returns all data
--   in a single call: KPIs, hourly heatmap, per-machine stats with
--   sparklines, zone/type breakdowns, peak hour, busiest machine.
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/feature_machine_heatmap.md — Phase 1
--
-- CHANGES:
--   - New RPC: get_machine_analytics_dashboard(gym_id, days)
--
-- IMPACT ON FRONTEND:
--   - Admin: Can call this RPC for the new Machine Analytics page
--   - Mobile: No impact
--
-- BREAKING CHANGES: None (additive)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_machine_analytics_dashboard(
  p_gym_id UUID,
  p_days   INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result    JSONB;
  v_from_date TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
  SELECT jsonb_build_object(

    -- 1. KPI summary
    'kpi', (
      SELECT jsonb_build_object(
        'total_sessions',    COUNT(*),
        'total_drops',       COALESCE(SUM(s.drops_earned), 0),
        'avg_duration_min',  ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1),
        'unique_users',      COUNT(DISTINCT s.user_id),
        'avg_sessions_per_day', ROUND(COUNT(*)::NUMERIC / GREATEST(p_days, 1), 1)
      )
      FROM sessions s
      WHERE s.gym_id = p_gym_id
        AND s.machine_id IS NOT NULL
        AND s.is_active = false
        AND s.created_at >= v_from_date
    ),

    -- 2. Hourly heatmap: dow (0=Sun..6=Sat) × hour (0-23) → session count
    'hourly_heatmap', (
      SELECT COALESCE(jsonb_agg(row_to_json(h)), '[]'::jsonb)
      FROM (
        SELECT
          EXTRACT(DOW FROM s.started_at AT TIME ZONE 'Europe/Belgrade')::INT AS dow,
          EXTRACT(HOUR FROM s.started_at AT TIME ZONE 'Europe/Belgrade')::INT AS hour,
          COUNT(*) AS sessions,
          COALESCE(SUM(s.drops_earned), 0) AS drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_min
        FROM sessions s
        WHERE s.gym_id = p_gym_id
          AND s.machine_id IS NOT NULL
          AND s.is_active = false
          AND s.created_at >= v_from_date
        GROUP BY 1, 2
        ORDER BY 1, 2
      ) h
    ),

    -- 3. Per-machine stats with 7-day sparkline
    'machine_stats', (
      SELECT COALESCE(jsonb_agg(row_to_json(ms) ORDER BY ms.sessions DESC), '[]'::jsonb)
      FROM (
        SELECT
          m.id,
          m.name,
          m.type,
          m.zone,
          m.is_active,
          m.is_busy,
          m.is_under_maintenance,
          COUNT(s.id) AS sessions,
          COUNT(DISTINCT s.user_id) AS unique_users,
          COALESCE(SUM(s.drops_earned), 0) AS total_drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_duration_min,
          ROUND(COALESCE(SUM(s.duration_seconds) / 3600.0, 0), 1) AS total_hours,
          ROUND(
            COALESCE(SUM(s.duration_seconds), 0)::NUMERIC
            / GREATEST(p_days * 12 * 3600, 1)
            * 100, 1
          ) AS utilization_pct,
          (
            SELECT COALESCE(jsonb_agg(day_count ORDER BY d), '[]'::jsonb)
            FROM (
              SELECT
                d::DATE AS d,
                COUNT(s2.id) AS day_count
              FROM generate_series(
                (NOW() - INTERVAL '6 days')::DATE,
                NOW()::DATE,
                '1 day'
              ) d
              LEFT JOIN sessions s2
                ON s2.machine_id = m.id
                AND s2.is_active = false
                AND DATE(s2.started_at AT TIME ZONE 'Europe/Belgrade') = d::DATE
              GROUP BY d
            ) spark
          ) AS sparkline
        FROM machines m
        LEFT JOIN sessions s
          ON s.machine_id = m.id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        WHERE m.gym_id = p_gym_id
        GROUP BY m.id, m.name, m.type, m.zone, m.is_active, m.is_busy, m.is_under_maintenance
      ) ms
    ),

    -- 4. Zone breakdown
    'zone_stats', (
      SELECT COALESCE(jsonb_agg(row_to_json(zs) ORDER BY zs.sessions DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(m.zone, 'Unassigned') AS zone,
          COUNT(DISTINCT m.id) AS machine_count,
          COUNT(s.id) AS sessions,
          COALESCE(SUM(s.drops_earned), 0) AS total_drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_duration_min
        FROM machines m
        LEFT JOIN sessions s
          ON s.machine_id = m.id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        WHERE m.gym_id = p_gym_id
        GROUP BY COALESCE(m.zone, 'Unassigned')
      ) zs
    ),

    -- 5. Type breakdown
    'type_stats', (
      SELECT COALESCE(jsonb_agg(row_to_json(ts) ORDER BY ts.sessions DESC), '[]'::jsonb)
      FROM (
        SELECT
          m.type,
          COUNT(DISTINCT m.id) AS machine_count,
          COUNT(s.id) AS sessions,
          COALESCE(SUM(s.drops_earned), 0) AS total_drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_duration_min
        FROM machines m
        LEFT JOIN sessions s
          ON s.machine_id = m.id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        WHERE m.gym_id = p_gym_id
        GROUP BY m.type
      ) ts
    ),

    -- 6. Peak hour identification
    'peak_hour', (
      SELECT jsonb_build_object('hour', h.hour, 'sessions', h.cnt)
      FROM (
        SELECT
          EXTRACT(HOUR FROM s.started_at AT TIME ZONE 'Europe/Belgrade')::INT AS hour,
          COUNT(*) AS cnt
        FROM sessions s
        WHERE s.gym_id = p_gym_id
          AND s.machine_id IS NOT NULL
          AND s.is_active = false
          AND s.created_at >= v_from_date
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 1
      ) h
    ),

    -- 7. Busiest machine
    'busiest_machine', (
      SELECT jsonb_build_object('name', bm.name, 'type', bm.type, 'sessions', bm.cnt)
      FROM (
        SELECT m.name, m.type, COUNT(*) AS cnt
        FROM sessions s
        JOIN machines m ON m.id = s.machine_id
        WHERE s.gym_id = p_gym_id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        GROUP BY m.name, m.type
        ORDER BY cnt DESC
        LIMIT 1
      ) bm
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machine_analytics_dashboard(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_machine_analytics_dashboard(UUID, INTEGER) IS
  'Returns comprehensive machine analytics for the admin dashboard in a single JSONB call. '
  'Includes: KPI summary, hourly heatmap (dow×hour), per-machine stats with 7-day sparklines, '
  'zone/type breakdowns, peak hour, and busiest machine. '
  'p_days: lookback window (default 30). Uses Europe/Belgrade timezone for hour extraction.';
