-- ═══════════════════════════════════════════════════════════
-- Migration: 20260324000001_report_functions.sql
-- Description: 6 report RPCs for gym owner and superadmin analytics
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/feature_reports_page.md — Phase 1
--
-- CHANGES:
--   - New RPC: get_gym_store_report(gym_id, start, end)
--   - New RPC: get_gym_engagement_report(gym_id, start, end)
--   - New RPC: get_gym_arena_report(gym_id, start, end)
--   - New RPC: get_gym_sessions_trend(gym_id, weeks)
--   - New RPC: get_platform_report(start, end) — superadmin only
--   - New RPC: get_gym_challenge_report(gym_id, start, end)
--
-- IMPACT ON FRONTEND:
--   - Admin: Gym owner reports page + superadmin platform reports
--   - Mobile: No impact
--
-- BREAKING CHANGES: None (additive)
-- ═══════════════════════════════════════════════════════════


-- ============================================================
-- 1. Gym Store Revenue Report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gym_store_report(
  p_gym_id     UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  item_name        TEXT,
  item_id          UUID,
  redemptions_count BIGINT,
  price_drops      INTEGER,
  total_drops_spent BIGINT,
  pending_count    BIGINT,
  confirmed_count  BIGINT,
  is_active        BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rw.name,
    rw.id,
    COUNT(rd.id),
    rw.price_drops,
    COALESCE(SUM(rd.drops_spent), 0)::BIGINT,
    COUNT(rd.id) FILTER (WHERE rd.status = 'pending'),
    COUNT(rd.id) FILTER (WHERE rd.status = 'confirmed'),
    rw.is_active
  FROM rewards rw
  LEFT JOIN redemptions rd ON rd.reward_id = rw.id
    AND rd.gym_id = p_gym_id
    AND rd.created_at >= p_start_date
    AND rd.created_at < p_end_date
  WHERE rw.gym_id = p_gym_id
  GROUP BY rw.id, rw.name, rw.price_drops, rw.is_active
  ORDER BY COUNT(rd.id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_store_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- 2. Gym Engagement Report
-- ============================================================

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

GRANT EXECUTE ON FUNCTION public.get_gym_engagement_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- 3. Gym Arena Report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gym_arena_report(
  p_gym_id     UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  arena_id              UUID,
  arena_name            TEXT,
  sponsor_name          TEXT,
  participants_count    BIGINT,
  gym_participants_count BIGINT,
  arena_start           DATE,
  arena_end             DATE,
  derived_status        TEXT,
  prizes                JSONB,
  revenue_share_pct     INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.name,
    sa.sponsor_name,
    (SELECT COUNT(DISTINCT ap.user_id) FROM arena_participants ap WHERE ap.arena_id = sa.id),
    (SELECT COUNT(DISTINCT ap.user_id) FROM arena_participants ap
     WHERE ap.arena_id = sa.id AND ap.gym_id = p_gym_id),
    sa.start_date,
    sa.end_date,
    CASE
      WHEN sa.is_finalized THEN 'ended'
      WHEN NOT sa.is_active THEN 'inactive'
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ending'
      ELSE 'live'
    END,
    sa.prizes,
    (SELECT COALESCE(ai.revenue_share_percent, 70)
     FROM arena_invitations ai
     WHERE ai.arena_id = sa.id AND ai.invited_gym_id = p_gym_id
     LIMIT 1)::INTEGER
  FROM sweat_arenas sa
  JOIN arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
  WHERE sa.created_at >= p_start_date AND sa.created_at < p_end_date
  ORDER BY sa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_arena_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- 4. Weekly Sessions Trend (for line chart / sparkline)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gym_sessions_trend(
  p_gym_id UUID,
  p_weeks  INTEGER DEFAULT 12
)
RETURNS TABLE (
  week_start     DATE,
  sessions_count BIGINT,
  unique_members BIGINT,
  drops_earned   BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('week', ss.started_at AT TIME ZONE 'Europe/Belgrade')::DATE,
    COUNT(*),
    COUNT(DISTINCT ss.user_id),
    COALESCE(SUM(ss.drops_earned), 0)
  FROM sessions ss
  WHERE ss.gym_id = p_gym_id
    AND ss.started_at >= NOW() - (p_weeks || ' weeks')::INTERVAL
    AND ss.is_active = false
  GROUP BY 1
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_sessions_trend(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 5. Superadmin Platform Report
-- ============================================================

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

GRANT EXECUTE ON FUNCTION public.get_platform_report(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- 6. Challenge Completion Report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gym_challenge_report(
  p_gym_id     UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  challenge_id      UUID,
  challenge_name    TEXT,
  challenge_type    TEXT,
  total_participants BIGINT,
  completions       BIGINT,
  completion_rate   NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.name,
    gc.challenge_type::TEXT,
    COUNT(DISTINCT cp.user_id),
    COUNT(DISTINCT cp.user_id) FILTER (WHERE cp.is_completed = true),
    ROUND(
      COUNT(DISTINCT cp.user_id) FILTER (WHERE cp.is_completed = true)::NUMERIC
      / NULLIF(COUNT(DISTINCT cp.user_id), 0) * 100, 1
    )
  FROM gym_challenges gc
  LEFT JOIN challenge_progress cp ON cp.challenge_id = gc.id
    AND cp.updated_at >= p_start_date AND cp.updated_at < p_end_date
  WHERE gc.gym_id = p_gym_id
    AND gc.is_active = true
  GROUP BY gc.id, gc.name, gc.challenge_type
  ORDER BY COUNT(DISTINCT cp.user_id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_challenge_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
