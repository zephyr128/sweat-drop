-- ═══════════════════════════════════════════════════════════
-- Migration: 20260324000002_fix_report_membership_source.sql
-- Description: Fix membership counting in report RPCs — use
--   gym_memberships (actual membership records) instead of
--   profiles.home_gym_id (user preference).
--
-- Affected functions:
--   - get_gym_engagement_report: total_registered_members, inactive_14d, avg_streak_days
--   - get_platform_report: per_gym.registered_members
-- ═══════════════════════════════════════════════════════════

-- 1. Fix get_gym_engagement_report

CREATE OR REPLACE FUNCTION public.get_gym_engagement_report(
  p_gym_id     UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_sessions', (
      SELECT COUNT(*) FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'avg_session_duration_min', (
      SELECT ROUND(COALESCE(AVG(duration_seconds) / 60.0, 0), 1)
      FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
        AND duration_seconds > 0
    ),
    'total_active_members', (
      SELECT COUNT(DISTINCT user_id)
      FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_registered_members', (
      SELECT COUNT(*) FROM gym_memberships
      WHERE gym_id = p_gym_id
    ),
    'total_checkins', (
      SELECT COUNT(*) FROM gym_checkins
      WHERE gym_id = p_gym_id
        AND checked_in_at >= p_start_date AND checked_in_at < p_end_date
    ),
    'avg_visits_per_member', (
      SELECT ROUND(
        COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT user_id), 0), 1
      )
      FROM gym_checkins
      WHERE gym_id = p_gym_id
        AND checked_in_at >= p_start_date AND checked_in_at < p_end_date
    ),
    'inactive_14d', (
      SELECT COUNT(*) FROM gym_memberships gm
      WHERE gm.gym_id = p_gym_id
        AND NOT EXISTS (
          SELECT 1 FROM sessions ss
          WHERE ss.user_id = gm.user_id
            AND ss.gym_id = p_gym_id
            AND ss.started_at >= NOW() - INTERVAL '14 days'
            AND ss.is_active = false
        )
    ),
    'total_drops_earned', (
      SELECT COALESCE(SUM(drops_earned), 0)
      FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_drops_spent', (
      SELECT COALESCE(SUM(rd.drops_spent), 0)
      FROM redemptions rd
      WHERE rd.gym_id = p_gym_id
        AND rd.created_at >= p_start_date AND rd.created_at < p_end_date
        AND rd.status = 'confirmed'
    ),
    'challenges_completed', (
      SELECT COUNT(*)
      FROM challenge_progress cp
      JOIN gym_challenges gc ON cp.challenge_id = gc.id
      WHERE gc.gym_id = p_gym_id
        AND cp.is_completed = true
        AND cp.updated_at >= p_start_date AND cp.updated_at < p_end_date
    ),
    'active_challenges_count', (
      SELECT COUNT(*)
      FROM gym_challenges gc
      WHERE gc.gym_id = p_gym_id
        AND gc.is_active = true
        AND (gc.end_date IS NULL OR gc.end_date >= CURRENT_DATE)
    ),
    'avg_streak_days', (
      SELECT ROUND(COALESCE(AVG(pr.streak_days), 0), 1)
      FROM gym_memberships gm
      JOIN profiles pr ON pr.id = gm.user_id
      WHERE gm.gym_id = p_gym_id
        AND pr.streak_days > 0
    ),
    'top_members', (
      SELECT COALESCE(jsonb_agg(row_to_json(tm)), '[]'::jsonb)
      FROM (
        SELECT
          pr.username,
          pr.avatar_url,
          COUNT(ss.id) AS sessions_count,
          COALESCE(SUM(ss.drops_earned), 0) AS drops_earned,
          pr.streak_days
        FROM sessions ss
        JOIN profiles pr ON ss.user_id = pr.id
        WHERE ss.gym_id = p_gym_id
          AND ss.started_at >= p_start_date AND ss.started_at < p_end_date
          AND ss.is_active = false
        GROUP BY pr.id, pr.username, pr.avatar_url, pr.streak_days
        ORDER BY SUM(ss.drops_earned) DESC
        LIMIT 5
      ) tm
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- 2. Fix get_platform_report (per_gym.registered_members)

CREATE OR REPLACE FUNCTION public.get_platform_report(
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: superadmin only';
  END IF;

  SELECT jsonb_build_object(
    'total_gyms', (SELECT COUNT(*) FROM gyms WHERE is_active = true),
    'total_users', (SELECT COUNT(*) FROM profiles),
    'mau', (
      SELECT COUNT(DISTINCT user_id)
      FROM sessions
      WHERE started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_sessions', (
      SELECT COUNT(*) FROM sessions
      WHERE started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_drops_earned', (
      SELECT COALESCE(SUM(drops_earned), 0)
      FROM sessions
      WHERE started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_redemptions', (
      SELECT COUNT(*) FROM redemptions
      WHERE created_at >= p_start_date AND created_at < p_end_date
        AND status = 'confirmed'
    ),
    'total_arenas', (
      SELECT COUNT(*) FROM sweat_arenas
      WHERE created_at >= p_start_date AND created_at < p_end_date
    ),
    'per_gym', (
      SELECT COALESCE(jsonb_agg(row_to_json(gs) ORDER BY gs.sessions_count DESC), '[]'::jsonb)
      FROM (
        SELECT
          g.id AS gym_id,
          g.name AS gym_name,
          COUNT(ss.id) AS sessions_count,
          COUNT(DISTINCT ss.user_id) AS active_members,
          COALESCE(SUM(ss.drops_earned), 0) AS drops_earned,
          (
            SELECT COUNT(*) FROM redemptions r
            WHERE r.gym_id = g.id
              AND r.created_at >= p_start_date AND r.created_at < p_end_date
              AND r.status = 'confirmed'
          ) AS redemptions_count,
          (
            SELECT COUNT(*) FROM gym_memberships gm2
            WHERE gm2.gym_id = g.id
          ) AS registered_members
        FROM gyms g
        LEFT JOIN sessions ss ON ss.gym_id = g.id
          AND ss.started_at >= p_start_date AND ss.started_at < p_end_date
          AND ss.is_active = false
        WHERE g.is_active = true
        GROUP BY g.id, g.name
      ) gs
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
