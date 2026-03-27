-- Migration: 20260311000001_dashboard_v3_rpc.sql
-- Description: Dashboard V3 RPC fixes + Activity Log RPC
--
-- AGENT NOTE: [2026-03-11] - supabase-dba
-- Reference: docs/plans/admin_dashboard_premium_v3_plan.md — Phase 1
--
-- FIXES:
-- - activeRatePct clamped to 0-100 (was exceeding 100)
-- - completionRatePct computed from real challenge_progress (was hardcoded 0)
-- - topPerformers uses earned drops from drops_transactions (was wallet balance)
-- - topPerformers filters role='user' only (was including staff)
-- - dropsIssued7d.deltaPct returns NULL when prev < 50
-- - dropsIssued7d.deltaAbsolute always returned
-- - economy returns 'gray'/'No data' when no snapshot exists
-- - economy.totalMembers included for top1 hide logic
--
-- NEW:
-- - topPerformers section in dashboard response
-- - get_gym_activity_log RPC for Activity Log screen
-- - Performance indexes
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: Update DashboardOverview type to include topPerformers, deltaAbsolute, totalMembers, gray health.
--   Remove separate getTopPerformers call from dashboard. Create Activity Log page using get_gym_activity_log.
-- - Mobile App: No changes.

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gym_checkins_gym_checked_at
  ON public.gym_checkins (gym_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_redemptions_gym_created_at
  ON public.redemptions (gym_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drops_tx_user_gym_positive
  ON public.drops_transactions (user_id, gym_id)
  WHERE amount > 0;

-- ============================================================
-- 1) REWRITE get_gym_dashboard_overview — all metric fixes
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gym_dashboard_overview(
  p_gym_id      UUID,
  p_window_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_now              TIMESTAMPTZ := NOW();
  v_tz               TEXT        := 'Europe/Belgrade';
  v_today_start      TIMESTAMPTZ;
  v_week_start       TIMESTAMPTZ;
  v_window_start     TIMESTAMPTZ;
  v_prev_window_start TIMESTAMPTZ;

  -- KPIs
  v_members_total      BIGINT;
  v_members_active7d   BIGINT;
  v_checkins_today     BIGINT;
  v_checkins_week      BIGINT;
  v_pending_pickups    BIGINT;
  v_confirmed_today    BIGINT;
  v_risk_unresolved    BIGINT;
  v_risk_critical      BIGINT;

  -- Economy
  v_burn_mint_ratio    NUMERIC;
  v_top1_share         NUMERIC;
  v_has_economy_data   BOOLEAN := false;

  -- Drops
  v_drops_current      BIGINT;
  v_drops_prev         BIGINT;

  -- Machine ops
  v_machines_active       INT;
  v_machines_available    INT;
  v_machines_maintenance  INT;
  v_machines_offline      INT;
  v_machines_total        INT;
  v_usage_trend           JSONB;
  v_type_split            JSONB;
  v_peak_hour             JSONB;

  -- Desk feed
  v_desk_feed   JSONB;

  -- Challenges
  v_challenges_active       INT;
  v_challenges_completion   INT;
  v_challenges_popular      TEXT;

  -- Top performers
  v_top_performers JSONB;

  -- Setup
  v_setup_complete BOOLEAN;
BEGIN
  -- Auth
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_window_days := LEAST(90, GREATEST(1, COALESCE(p_window_days, 7)));

  v_today_start      := DATE_TRUNC('day', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_week_start       := DATE_TRUNC('week', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_window_start     := v_now - (p_window_days || ' days')::INTERVAL;
  v_prev_window_start := v_window_start - (p_window_days || ' days')::INTERVAL;

  -- ── Members ──
  SELECT COUNT(*) INTO v_members_total
  FROM public.gym_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.gym_id = p_gym_id AND p.role = 'user';

  -- active7d: DISTINCT users who checked in, capped at total members
  SELECT LEAST(v_members_total, COUNT(DISTINCT gc.user_id)) INTO v_members_active7d
  FROM public.gym_checkins gc
  JOIN public.gym_memberships gm ON gm.user_id = gc.user_id AND gm.gym_id = p_gym_id
  WHERE gc.gym_id = p_gym_id
    AND gc.checked_in_at >= v_now - INTERVAL '7 days';

  -- ── Check-ins ──
  SELECT COUNT(*) INTO v_checkins_today
  FROM public.gym_checkins WHERE gym_id = p_gym_id AND checked_in_at >= v_today_start;

  SELECT COUNT(*) INTO v_checkins_week
  FROM public.gym_checkins WHERE gym_id = p_gym_id AND checked_in_at >= v_week_start;

  -- ── Store Desk ──
  SELECT COUNT(*) INTO v_pending_pickups
  FROM public.redemptions WHERE gym_id = p_gym_id AND status = 'pending';

  SELECT COUNT(*) INTO v_confirmed_today
  FROM public.redemptions WHERE gym_id = p_gym_id AND status = 'confirmed' AND confirmed_at >= v_today_start;

  -- ── Economy (latest snapshot, with 'gray' fallback) ──
  SELECT burn_mint_ratio, top1_share_pct
  INTO v_burn_mint_ratio, v_top1_share
  FROM public.economy_snapshots_daily
  WHERE gym_id = p_gym_id
  ORDER BY snapshot_date DESC LIMIT 1;

  IF FOUND THEN
    v_has_economy_data := true;
    v_burn_mint_ratio  := COALESCE(v_burn_mint_ratio, 0);
    v_top1_share       := COALESCE(v_top1_share, 0);
  ELSE
    v_burn_mint_ratio := 0;
    v_top1_share      := 0;
  END IF;

  -- ── Drops issued window vs previous ──
  SELECT COALESCE(SUM(amount), 0) INTO v_drops_current
  FROM public.drops_transactions
  WHERE gym_id = p_gym_id AND amount > 0
    AND transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND created_at >= v_window_start;

  SELECT COALESCE(SUM(amount), 0) INTO v_drops_prev
  FROM public.drops_transactions
  WHERE gym_id = p_gym_id AND amount > 0
    AND transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND created_at >= v_prev_window_start AND created_at < v_window_start;

  -- ── Risk ──
  SELECT COUNT(*) INTO v_risk_unresolved
  FROM public.fraud_events WHERE gym_id = p_gym_id AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_risk_critical
  FROM public.fraud_events WHERE gym_id = p_gym_id AND resolved_at IS NULL AND severity IN ('high', 'critical');

  -- ── Machine Ops: Live Summary ──
  SELECT
    COALESCE(SUM(CASE WHEN is_busy THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_active AND NOT is_busy AND NOT COALESCE(is_under_maintenance, false) THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(is_under_maintenance, false) THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END), 0),
    COUNT(*)
  INTO v_machines_active, v_machines_available, v_machines_maintenance, v_machines_offline, v_machines_total
  FROM public.machines WHERE gym_id = p_gym_id;

  -- ── Machine Ops: Usage Trend (sessions per day) ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', t.d::TEXT, 'sessions', t.cnt) ORDER BY t.d), '[]'::jsonb)
  INTO v_usage_trend
  FROM (
    SELECT d::DATE AS d, COUNT(s.id) AS cnt
    FROM generate_series(
      (v_window_start AT TIME ZONE v_tz)::DATE,
      (v_now AT TIME ZONE v_tz)::DATE,
      '1 day'::INTERVAL
    ) AS d
    LEFT JOIN public.sessions s
      ON s.gym_id = p_gym_id AND (s.started_at AT TIME ZONE v_tz)::DATE = d::DATE
    GROUP BY d
  ) t;

  -- ── Machine Ops: Type Split ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', t.type, 'count', t.cnt, 'sharePct', t.share
  )), '[]'::jsonb)
  INTO v_type_split
  FROM (
    SELECT m.type,
           COUNT(s.id) AS cnt,
           ROUND(COUNT(s.id)::NUMERIC / GREATEST(NULLIF(total.c, 0), 1) * 100, 1) AS share
    FROM public.sessions s
    JOIN public.machines m ON m.id = s.machine_id
    CROSS JOIN (
      SELECT COUNT(*) AS c FROM public.sessions WHERE gym_id = p_gym_id AND started_at >= v_window_start
    ) total
    WHERE s.gym_id = p_gym_id AND s.started_at >= v_window_start
    GROUP BY m.type, total.c
    ORDER BY cnt DESC
  ) t;

  -- ── Machine Ops: Peak Hour ──
  SELECT jsonb_build_object('hour', sub.h, 'sessions', sub.cnt)
  INTO v_peak_hour
  FROM (
    SELECT EXTRACT(HOUR FROM s.started_at AT TIME ZONE v_tz)::INT AS h, COUNT(*) AS cnt
    FROM public.sessions s
    WHERE s.gym_id = p_gym_id AND s.started_at >= v_window_start
    GROUP BY h ORDER BY cnt DESC LIMIT 1
  ) sub;

  -- ── Desk Feed (last 10 mixed) ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'at', t.at, 'status', t.status
  ) ORDER BY t.at DESC), '[]'::jsonb)
  INTO v_desk_feed
  FROM (
    (SELECT gc.id::TEXT, 'checkin'::TEXT AS kind,
            COALESCE(p.username, 'Member') || ' checked in' AS title,
            gc.checked_in_at AS at, 'completed'::TEXT AS status
     FROM public.gym_checkins gc
     LEFT JOIN public.profiles p ON p.id = gc.user_id
     WHERE gc.gym_id = p_gym_id
     ORDER BY gc.checked_in_at DESC LIMIT 5)
    UNION ALL
    (SELECT r.id::TEXT, 'redemption'::TEXT,
            COALESCE(p.username, 'Member') || ' redeemed ' || COALESCE(rw.name, 'reward'),
            r.created_at, r.status
     FROM public.redemptions r
     LEFT JOIN public.profiles p ON p.id = r.user_id
     LEFT JOIN public.rewards rw ON rw.id = r.reward_id
     WHERE r.gym_id = p_gym_id
     ORDER BY r.created_at DESC LIMIT 5)
  ) t;

  -- ── Challenge Snapshot (real completion rate) ──
  SELECT
    COALESCE(COUNT(DISTINCT gc.id) FILTER (WHERE gc.is_active = true), 0),
    COALESCE(ROUND(
      COUNT(*) FILTER (WHERE cp.is_completed = true)::NUMERIC
      / NULLIF(COUNT(*), 0) * 100
    ), 0)::INT
  INTO v_challenges_active, v_challenges_completion
  FROM public.gym_challenges gc
  LEFT JOIN public.challenge_progress cp ON cp.challenge_id = gc.id
  WHERE gc.gym_id = p_gym_id AND gc.is_active = true;

  SELECT gc2.name INTO v_challenges_popular
  FROM public.gym_challenges gc2
  JOIN public.challenge_progress cp2 ON cp2.challenge_id = gc2.id
  WHERE gc2.gym_id = p_gym_id AND gc2.is_active = true
  GROUP BY gc2.id, gc2.name
  ORDER BY COUNT(cp2.id) DESC LIMIT 1;

  -- ── Top Performers (earned drops, role='user' only, top 5) ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'username', t.username,
    'avatar_url', t.avatar_url, 'earnedDrops', t.earned
  ) ORDER BY t.earned DESC), '[]'::jsonb)
  INTO v_top_performers
  FROM (
    SELECT p.id, p.username, p.avatar_url,
           COALESCE(SUM(dt.amount) FILTER (WHERE dt.amount > 0), 0)::BIGINT AS earned
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    LEFT JOIN public.drops_transactions dt ON dt.user_id = p.id AND dt.gym_id = p_gym_id
    WHERE gm.gym_id = p_gym_id AND p.role = 'user'
    GROUP BY p.id, p.username, p.avatar_url
    ORDER BY earned DESC
    LIMIT 5
  ) t;

  -- ── Setup Complete ──
  v_setup_complete :=
    EXISTS (SELECT 1 FROM public.rewards WHERE gym_id = p_gym_id AND is_active = true LIMIT 1)
    AND v_machines_total > 0
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (admin_gym_id = p_gym_id OR assigned_gym_id = p_gym_id)
        AND role IN ('gym_owner', 'gym_admin', 'receptionist')
      LIMIT 1
    );

  -- ── Assemble ──
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'members', jsonb_build_object(
        'total', v_members_total,
        'active7d', v_members_active7d,
        'activeRatePct', CASE WHEN v_members_total > 0
          THEN LEAST(100, ROUND(v_members_active7d::NUMERIC / v_members_total * 100))::INT
          ELSE 0 END
      ),
      'checkins', jsonb_build_object('today', v_checkins_today, 'week', v_checkins_week),
      'storeDesk', jsonb_build_object('pendingPickups', v_pending_pickups, 'confirmedToday', v_confirmed_today),
      'economy', jsonb_build_object(
        'burnMintRatio', v_burn_mint_ratio,
        'top1SharePct', v_top1_share,
        'health', CASE
          WHEN NOT v_has_economy_data THEN 'gray'
          WHEN v_burn_mint_ratio >= 0.4 AND v_top1_share <= 30 THEN 'green'
          WHEN v_burn_mint_ratio >= 0.15 AND v_top1_share <= 50 THEN 'yellow'
          ELSE 'red'
        END,
        'healthLabel', CASE
          WHEN NOT v_has_economy_data THEN 'No data'
          WHEN v_burn_mint_ratio >= 0.4 AND v_top1_share <= 30 THEN 'Healthy'
          WHEN v_burn_mint_ratio >= 0.15 AND v_top1_share <= 50 THEN 'Watch'
          ELSE 'Action needed'
        END,
        'totalMembers', v_members_total
      ),
      'dropsIssued7d', jsonb_build_object(
        'total', v_drops_current,
        'prev7d', v_drops_prev,
        'deltaPct', CASE WHEN v_drops_prev >= 50
          THEN ROUND((v_drops_current - v_drops_prev)::NUMERIC / v_drops_prev * 100, 1)
          ELSE NULL END,
        'deltaAbsolute', (v_drops_current - v_drops_prev)::BIGINT
      ),
      'risk', jsonb_build_object('unresolved', v_risk_unresolved, 'critical', v_risk_critical)
    ),
    'machineOps', jsonb_build_object(
      'liveSummary', jsonb_build_object(
        'active', v_machines_active, 'available', v_machines_available,
        'maintenance', v_machines_maintenance, 'offline', v_machines_offline,
        'total', v_machines_total
      ),
      'usageTrend7d', v_usage_trend,
      'typeSplit', v_type_split,
      'peakHour', COALESCE(v_peak_hour, 'null'::jsonb)
    ),
    'deskFeed', v_desk_feed,
    'challengeSnapshot', jsonb_build_object(
      'active', v_challenges_active,
      'completionRatePct', v_challenges_completion,
      'mostPopular', v_challenges_popular
    ),
    'topPerformers', v_top_performers,
    'setupComplete', v_setup_complete
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_gym_dashboard_overview(UUID, INT) TO authenticated;

-- ============================================================
-- 2) Activity Log RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gym_activity_log(
  p_gym_id   UUID,
  p_kind     TEXT DEFAULT 'all',
  p_search   TEXT DEFAULT NULL,
  p_page     INT  DEFAULT 1,
  p_per_page INT  DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset INT;
  v_total  BIGINT;
  v_items  JSONB;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_per_page := LEAST(100, GREATEST(1, COALESCE(p_per_page, 20)));
  v_offset   := (p_page - 1) * p_per_page;

  WITH activity AS (
    SELECT
      gc.id::TEXT AS id,
      'checkin'::TEXT AS kind,
      COALESCE(p.username, p.full_name, 'Member') AS member_name,
      p.avatar_url AS member_avatar,
      'Checked in' AS details,
      'completed'::TEXT AS status,
      gc.checked_in_at AS created_at
    FROM public.gym_checkins gc
    JOIN public.profiles p ON p.id = gc.user_id
    WHERE gc.gym_id = p_gym_id
      AND (p_kind = 'all' OR p_kind = 'checkin')
      AND (p_search IS NULL OR p_search = ''
           OR p.username ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')

    UNION ALL

    SELECT
      r.id::TEXT,
      'redemption'::TEXT,
      COALESCE(p.username, p.full_name, 'Member'),
      p.avatar_url,
      COALESCE(rw.name, 'Reward'),
      r.status,
      r.created_at
    FROM public.redemptions r
    JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.rewards rw ON rw.id = r.reward_id
    WHERE r.gym_id = p_gym_id
      AND (p_kind = 'all' OR p_kind = 'redemption')
      AND (p_search IS NULL OR p_search = ''
           OR p.username ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
  )
  SELECT COUNT(*) INTO v_total FROM activity;

  WITH activity AS (
    SELECT
      gc.id::TEXT AS id,
      'checkin'::TEXT AS kind,
      COALESCE(p.username, p.full_name, 'Member') AS member_name,
      p.avatar_url AS member_avatar,
      'Checked in' AS details,
      'completed'::TEXT AS status,
      gc.checked_in_at AS created_at
    FROM public.gym_checkins gc
    JOIN public.profiles p ON p.id = gc.user_id
    WHERE gc.gym_id = p_gym_id
      AND (p_kind = 'all' OR p_kind = 'checkin')
      AND (p_search IS NULL OR p_search = ''
           OR p.username ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')

    UNION ALL

    SELECT
      r.id::TEXT,
      'redemption'::TEXT,
      COALESCE(p.username, p.full_name, 'Member'),
      p.avatar_url,
      COALESCE(rw.name, 'Reward'),
      r.status,
      r.created_at
    FROM public.redemptions r
    JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.rewards rw ON rw.id = r.reward_id
    WHERE r.gym_id = p_gym_id
      AND (p_kind = 'all' OR p_kind = 'redemption')
      AND (p_search IS NULL OR p_search = ''
           OR p.username ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'kind', a.kind,
    'member_name', a.member_name, 'member_avatar', a.member_avatar,
    'details', a.details, 'status', a.status,
    'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT * FROM activity
    ORDER BY created_at DESC
    OFFSET v_offset LIMIT p_per_page
  ) a;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_gym_activity_log(UUID, TEXT, TEXT, INT, INT) TO authenticated;
