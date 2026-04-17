-- Migration: 20260418100001_perf_rewrite_dashboard_rpc.sql
-- Description: Optimised rewrite of get_gym_dashboard_overview (Step 3).
--
-- AGENT NOTE: 2026-04-18 — supabase-dba
-- Plan: docs/plans/perf_gym_dashboard_rpc.md — Step 3
--
-- CHANGES vs 20260326000002_dashboard_v3_activity_workouts.sql:
--
--   A. Single-pass drops aggregation
--      Before: two separate SELECT SUM(amount) queries, each a full scan of
--              drops_transactions for the gym across the respective window.
--      After:  one SELECT with FILTER clauses — the planner reads the partial
--              index (idx_drops_tx_gym_created_positive) once for both windows.
--
--   B. Shared scoped-sessions CTE
--      Before: sessions scanned 3× independently (usage trend, type split, peak hour).
--      After:  one CTE `scoped_sessions` filtered to (gym_id, started_at >= window)
--              — all three sub-queries read from it. Requires the planner to
--              materialise the CTE; with the new index this is faster than 3 index scans.
--
--   C. Single-pass members count + active-7d count
--      Before: two separate queries over gym_memberships + gym_checkins.
--      After:  members count computed inline in the CTE; active-7d is a correlated
--              subquery that reuses the checkins index directly. Structure preserved
--              because Postgres can't easily combine COUNT(DISTINCT) across tables.
--              (Left as two queries — both are index-range scans after Step 2.)
--
--   D. Top performers CTE
--      Before: correlated LEFT JOIN across ALL drops_transactions for the gym.
--      After:  pre-aggregated in a CTE using the new idx_drops_tx_gym_user_positive
--              index-only scan, then JOINed to profiles.
--
-- RESPONSE SHAPE: IDENTICAL to previous version — no admin-panel changes required.
--
-- IMPACT ON FRONTEND: None.
-- BREAKING CHANGES: None.

BEGIN;

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
  v_now               TIMESTAMPTZ := NOW();
  v_tz                TEXT        := 'Europe/Belgrade';
  v_today_start       TIMESTAMPTZ;
  v_week_start        TIMESTAMPTZ;
  v_window_start      TIMESTAMPTZ;
  v_prev_window_start TIMESTAMPTZ;

  v_members_total      BIGINT;
  v_members_active7d   BIGINT;
  v_checkins_today     BIGINT;
  v_checkins_week      BIGINT;
  v_pending_pickups    BIGINT;
  v_confirmed_today    BIGINT;
  v_risk_unresolved    BIGINT;
  v_risk_critical      BIGINT;

  v_burn_mint_ratio    NUMERIC;
  v_top1_share         NUMERIC;
  v_has_economy_data   BOOLEAN := false;

  -- Single-pass drops: both windows in one row
  v_drops_current      BIGINT;
  v_drops_prev         BIGINT;

  v_machines_active       INT;
  v_machines_available    INT;
  v_machines_maintenance  INT;
  v_machines_offline      INT;
  v_machines_total        INT;
  v_usage_trend           JSONB;
  v_type_split            JSONB;
  v_peak_hour             JSONB;

  v_desk_feed   JSONB;

  v_challenges_active       INT;
  v_challenges_completion   INT;
  v_challenges_popular      TEXT;

  v_top_performers JSONB;

  v_setup_complete BOOLEAN;
BEGIN
  -- Auth guard
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_window_days := LEAST(90, GREATEST(1, COALESCE(p_window_days, 7)));

  v_today_start       := DATE_TRUNC('day',  v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_week_start        := DATE_TRUNC('week', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_window_start      := v_now - (p_window_days || ' days')::INTERVAL;
  v_prev_window_start := v_window_start - (p_window_days || ' days')::INTERVAL;

  -- ── Members (role='user') ─────────────────────────────────────────────────
  -- Uses idx_gym_memberships_gym_user + idx_profiles_id_role
  SELECT COUNT(*) INTO v_members_total
  FROM public.gym_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.gym_id = p_gym_id AND p.role = 'user';

  -- active7d: distinct users with a check-in in last 7 days, capped at total
  SELECT LEAST(v_members_total, COUNT(DISTINCT gc.user_id)) INTO v_members_active7d
  FROM public.gym_checkins gc
  JOIN public.gym_memberships gm ON gm.user_id = gc.user_id AND gm.gym_id = p_gym_id
  WHERE gc.gym_id = p_gym_id
    AND gc.checked_in_at >= v_now - INTERVAL '7 days';

  -- ── Check-ins ─────────────────────────────────────────────────────────────
  -- Both use idx_gym_checkins_gym_checked_at
  SELECT COUNT(*) INTO v_checkins_today
  FROM public.gym_checkins
  WHERE gym_id = p_gym_id AND checked_in_at >= v_today_start;

  SELECT COUNT(*) INTO v_checkins_week
  FROM public.gym_checkins
  WHERE gym_id = p_gym_id AND checked_in_at >= v_week_start;

  -- ── Store Desk ────────────────────────────────────────────────────────────
  -- pending: idx_redemptions_gym_status
  SELECT COUNT(*) INTO v_pending_pickups
  FROM public.redemptions
  WHERE gym_id = p_gym_id AND status IN ('pending', 'pending_verification');

  -- confirmed today: idx_redemptions_gym_status_confirmed_at (new in Step 2)
  SELECT COUNT(*) INTO v_confirmed_today
  FROM public.redemptions
  WHERE gym_id = p_gym_id AND status = 'confirmed' AND confirmed_at >= v_today_start;

  -- ── Economy (latest snapshot) ─────────────────────────────────────────────
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

  -- ── Drops issued — single-pass with FILTER ────────────────────────────────
  -- Before: two sequential scans. After: one scan of idx_drops_tx_gym_created_positive.
  -- FILTER semantics: both values computed in one pass over the prev-window range.
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE created_at >= v_window_start),      0),
    COALESCE(SUM(amount) FILTER (WHERE created_at >= v_prev_window_start
                                   AND created_at  < v_window_start),      0)
  INTO v_drops_current, v_drops_prev
  FROM public.drops_transactions
  WHERE gym_id          = p_gym_id
    AND amount          > 0
    AND transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND created_at      >= v_prev_window_start;   -- broadest predicate — index range scan

  -- ── Risk ─────────────────────────────────────────────────────────────────
  -- idx_fraud_events_gym_unresolved (partial WHERE resolved_at IS NULL)
  SELECT COUNT(*) INTO v_risk_unresolved
  FROM public.fraud_events WHERE gym_id = p_gym_id AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_risk_critical
  FROM public.fraud_events
  WHERE gym_id = p_gym_id AND resolved_at IS NULL AND severity IN ('high', 'critical');

  -- ── Machine Ops: Live Summary ─────────────────────────────────────────────
  -- Small table per gym — single fast scan, unchanged.
  SELECT
    COALESCE(SUM(CASE WHEN is_busy                                                     THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_active AND NOT is_busy AND NOT COALESCE(is_under_maintenance, false) THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(is_under_maintenance, false)                        THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_active                                                THEN 1 ELSE 0 END), 0),
    COUNT(*)
  INTO v_machines_active, v_machines_available, v_machines_maintenance, v_machines_offline, v_machines_total
  FROM public.machines WHERE gym_id = p_gym_id;

  -- ── Machine Ops: Usage Trend, Type Split, Peak Hour (shared CTE) ─────────
  -- Before: sessions scanned 3× independently.
  -- After:  one CTE materialised from idx_sessions_gym_started_at, reused 3×.
  WITH scoped_sessions AS MATERIALIZED (
    SELECT s.id, s.started_at, s.machine_id
    FROM public.sessions s
    WHERE s.gym_id     = p_gym_id
      AND s.started_at >= v_window_start
  )
  SELECT
    -- Usage trend (sessions per calendar day)
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('date', t.d::TEXT, 'sessions', t.cnt)
        ORDER BY t.d
      ), '[]'::jsonb)
      FROM (
        SELECT d::DATE AS d, COUNT(ss.id) AS cnt
        FROM generate_series(
          (v_window_start AT TIME ZONE v_tz)::DATE,
          (v_now         AT TIME ZONE v_tz)::DATE,
          '1 day'::INTERVAL
        ) AS d
        LEFT JOIN scoped_sessions ss
          ON (ss.started_at AT TIME ZONE v_tz)::DATE = d::DATE
        GROUP BY d
      ) t
    ),
    -- Type split (sessions by machine type as share %)
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('type', t.type, 'count', t.cnt, 'sharePct', t.share)
      ), '[]'::jsonb)
      FROM (
        SELECT m.type,
               COUNT(ss.id) AS cnt,
               ROUND(COUNT(ss.id)::NUMERIC / GREATEST(NULLIF(total.c, 0), 1) * 100, 1) AS share
        FROM scoped_sessions ss
        JOIN public.machines m ON m.id = ss.machine_id
        CROSS JOIN (SELECT COUNT(*) AS c FROM scoped_sessions) total
        GROUP BY m.type, total.c
        ORDER BY cnt DESC
      ) t
    ),
    -- Peak hour
    (
      SELECT jsonb_build_object('hour', sub.h, 'sessions', sub.cnt)
      FROM (
        SELECT EXTRACT(HOUR FROM ss.started_at AT TIME ZONE v_tz)::INT AS h, COUNT(*) AS cnt
        FROM scoped_sessions ss
        GROUP BY h
        ORDER BY cnt DESC LIMIT 1
      ) sub
    )
  INTO v_usage_trend, v_type_split, v_peak_hour;

  -- ── Desk Feed (recent: checkins + redemptions + finished workouts) ─────────
  -- Unchanged query; uses existing indexes for each LIMIT 5 fetch.
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

    UNION ALL

    (SELECT s.id::TEXT,
            CASE
              WHEN s.raw_metrics->'security' ? 'auto_cancel_reason' THEN 'workout_auto_finished'::TEXT
              ELSE 'workout_finished'::TEXT
            END,
            COALESCE(p.username, 'Member')
              || CASE
                   WHEN s.raw_metrics->'security' ? 'auto_cancel_reason' THEN ' auto-finished on '
                   ELSE ' finished workout on '
                 END
              || COALESCE(m.name, m.type, 'machine')
              || CASE WHEN s.drops_earned > 0 THEN ' (+' || s.drops_earned || ' drops)' ELSE '' END,
            COALESCE(s.ended_at, s.updated_at),
            CASE
              WHEN s.raw_metrics->'security' ? 'auto_cancel_reason' THEN 'autofinished'
              ELSE 'completed'
            END
     FROM public.sessions s
     LEFT JOIN public.profiles p ON p.id = s.user_id
     LEFT JOIN public.machines m ON m.id = s.machine_id
     WHERE s.gym_id = p_gym_id AND s.is_active = false
     ORDER BY COALESCE(s.ended_at, s.updated_at) DESC LIMIT 5)
  ) t;

  -- ── Challenge Snapshot ────────────────────────────────────────────────────
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

  -- ── Top Performers — pre-aggregated CTE ──────────────────────────────────
  -- Before: LEFT JOIN drops_transactions scans the full gym history for every member.
  -- After:  CTE pre-aggregates drops per (gym_id, user_id) using the new
  --         idx_drops_tx_gym_user_positive covering index, then JOINs profiles.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'username', t.username,
    'avatar_url', t.avatar_url, 'earnedDrops', t.earned
  ) ORDER BY t.earned DESC), '[]'::jsonb)
  INTO v_top_performers
  FROM (
    WITH member_drops AS (
      SELECT dt.user_id, COALESCE(SUM(dt.amount), 0)::BIGINT AS earned
      FROM public.drops_transactions dt
      WHERE dt.gym_id = p_gym_id
        AND dt.amount > 0
      GROUP BY dt.user_id
    )
    SELECT p.id, p.username, p.avatar_url,
           COALESCE(md.earned, 0) AS earned
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    LEFT JOIN member_drops md ON md.user_id = p.id
    WHERE gm.gym_id = p_gym_id AND p.role = 'user'
    ORDER BY earned DESC
    LIMIT 5
  ) t;

  -- ── Setup Complete ─────────────────────────────────────────────────────────
  v_setup_complete :=
    EXISTS (SELECT 1 FROM public.rewards WHERE gym_id = p_gym_id AND is_active = true LIMIT 1)
    AND v_machines_total > 0
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (admin_gym_id = p_gym_id OR assigned_gym_id = p_gym_id)
        AND role IN ('gym_owner', 'gym_admin', 'receptionist')
      LIMIT 1
    );

  -- ── Assemble (shape identical to previous version) ─────────────────────────
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'members', jsonb_build_object(
        'total',         v_members_total,
        'active7d',      v_members_active7d,
        'activeRatePct', CASE WHEN v_members_total > 0
          THEN LEAST(100, ROUND(v_members_active7d::NUMERIC / v_members_total * 100))::INT
          ELSE 0 END
      ),
      'checkins',  jsonb_build_object('today', v_checkins_today, 'week', v_checkins_week),
      'storeDesk', jsonb_build_object('pendingPickups', v_pending_pickups, 'confirmedToday', v_confirmed_today),
      'economy', jsonb_build_object(
        'burnMintRatio', v_burn_mint_ratio,
        'top1SharePct',  v_top1_share,
        'health', CASE
          WHEN NOT v_has_economy_data              THEN 'gray'
          WHEN v_burn_mint_ratio >= 0.4 AND v_top1_share <= 30 THEN 'green'
          WHEN v_burn_mint_ratio >= 0.15 AND v_top1_share <= 50 THEN 'yellow'
          ELSE 'red'
        END,
        'healthLabel', CASE
          WHEN NOT v_has_economy_data              THEN 'No data'
          WHEN v_burn_mint_ratio >= 0.4 AND v_top1_share <= 30 THEN 'Healthy'
          WHEN v_burn_mint_ratio >= 0.15 AND v_top1_share <= 50 THEN 'Watch'
          ELSE 'Action needed'
        END,
        'totalMembers', v_members_total
      ),
      'dropsIssued7d', jsonb_build_object(
        'total',         v_drops_current,
        'prev7d',        v_drops_prev,
        'deltaPct',      CASE WHEN v_drops_prev >= 50
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
      'typeSplit',    v_type_split,
      'peakHour',     COALESCE(v_peak_hour, 'null'::jsonb)
    ),
    'deskFeed',          v_desk_feed,
    'challengeSnapshot', jsonb_build_object(
      'active',             v_challenges_active,
      'completionRatePct',  v_challenges_completion,
      'mostPopular',        v_challenges_popular
    ),
    'topPerformers', v_top_performers,
    'setupComplete', v_setup_complete
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_gym_dashboard_overview(UUID, INT) TO authenticated;

COMMIT;
