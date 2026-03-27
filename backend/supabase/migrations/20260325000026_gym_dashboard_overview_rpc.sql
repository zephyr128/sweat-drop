-- Migration: 20260325000026_gym_dashboard_overview_rpc.sql
-- Description: Single RPC for admin dashboard command center (Premium V2)
--
-- AGENT NOTE: [2026-03-25] - supabase-dba
-- Reference: docs/plans/admin_dashboard_premium_v2_plan.md — Phase 1
--
-- CHANGES:
-- - New RPC: public.get_gym_dashboard_overview(uuid, int) returns jsonb
-- - Performance indexes for dashboard query paths
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: Use this single RPC for entire dashboard.
-- - Mobile App: No changes.
--
-- BREAKING CHANGES: None (additive).

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

-- Sessions: gym + started_at for date-range window queries
CREATE INDEX IF NOT EXISTS idx_sessions_gym_started ON public.sessions (gym_id, started_at DESC);

-- Fraud events: gym + unresolved for risk alerts
CREATE INDEX IF NOT EXISTS idx_fraud_events_gym_unresolved
  ON public.fraud_events (gym_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- Economy snapshots: gym + date for window lookups
CREATE INDEX IF NOT EXISTS idx_economy_snapshots_gym_date
  ON public.economy_snapshots_daily (gym_id, snapshot_date DESC);

-- Challenge progress: gym + completion for stats
CREATE INDEX IF NOT EXISTS idx_challenge_progress_gym
  ON public.challenge_progress (gym_id);

-- Drops transactions: gym + date for minted sums
CREATE INDEX IF NOT EXISTS idx_drops_transactions_gym_created
  ON public.drops_transactions (gym_id, created_at DESC);

-- ============================================================
-- MAIN RPC
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
  v_now         TIMESTAMPTZ := NOW();
  v_tz          TEXT        := 'Europe/Belgrade';
  v_today_start TIMESTAMPTZ;
  v_week_start  TIMESTAMPTZ;
  v_window_start TIMESTAMPTZ;
  v_prev_window_start TIMESTAMPTZ;

  -- KPIs
  v_members_total     BIGINT;
  v_members_active7d  BIGINT;
  v_checkins_today    BIGINT;
  v_checkins_week     BIGINT;
  v_pending_pickups   BIGINT;
  v_confirmed_today   BIGINT;
  v_risk_unresolved   BIGINT;
  v_risk_critical     BIGINT;

  -- Economy
  v_burn_mint_ratio   NUMERIC;
  v_top1_share        NUMERIC;

  -- Drops issued
  v_drops_current     BIGINT;
  v_drops_prev        BIGINT;

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
  v_challenges_completion   NUMERIC;
  v_challenges_popular      TEXT;

  -- Setup
  v_blockers   TEXT[];

  v_result JSONB;
BEGIN
  -- Auth check
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Clamp window
  p_window_days := LEAST(90, GREATEST(1, COALESCE(p_window_days, 7)));

  -- Time boundaries
  v_today_start      := DATE_TRUNC('day', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_week_start       := DATE_TRUNC('week', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_window_start     := v_now - (p_window_days || ' days')::INTERVAL;
  v_prev_window_start := v_window_start - (p_window_days || ' days')::INTERVAL;

  -- ============================================================
  -- KPIs: Members
  -- ============================================================
  SELECT COUNT(*) INTO v_members_total
  FROM public.gym_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.gym_id = p_gym_id AND p.role = 'user';

  SELECT COUNT(DISTINCT gm.user_id) INTO v_members_active7d
  FROM public.gym_memberships gm
  JOIN public.sessions s ON s.user_id = gm.user_id AND s.gym_id = p_gym_id
  WHERE gm.gym_id = p_gym_id
    AND s.started_at >= v_now - INTERVAL '7 days';

  -- ============================================================
  -- KPIs: Check-ins
  -- ============================================================
  SELECT COUNT(*) INTO v_checkins_today
  FROM public.gym_checkins
  WHERE gym_id = p_gym_id AND checked_in_at >= v_today_start;

  SELECT COUNT(*) INTO v_checkins_week
  FROM public.gym_checkins
  WHERE gym_id = p_gym_id AND checked_in_at >= v_week_start;

  -- ============================================================
  -- KPIs: Store Desk
  -- ============================================================
  SELECT COUNT(*) INTO v_pending_pickups
  FROM public.redemptions
  WHERE gym_id = p_gym_id AND status = 'pending';

  SELECT COUNT(*) INTO v_confirmed_today
  FROM public.redemptions
  WHERE gym_id = p_gym_id AND status = 'confirmed' AND confirmed_at >= v_today_start;

  -- ============================================================
  -- KPIs: Economy Health (latest snapshot)
  -- ============================================================
  SELECT COALESCE(burn_mint_ratio, 0), COALESCE(top1_share_pct, 0)
  INTO v_burn_mint_ratio, v_top1_share
  FROM public.economy_snapshots_daily
  WHERE gym_id = p_gym_id
  ORDER BY snapshot_date DESC
  LIMIT 1;

  v_burn_mint_ratio := COALESCE(v_burn_mint_ratio, 0);
  v_top1_share      := COALESCE(v_top1_share, 0);

  -- ============================================================
  -- KPIs: Drops issued window vs previous
  -- ============================================================
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

  -- ============================================================
  -- KPIs: Risk
  -- ============================================================
  SELECT COUNT(*) INTO v_risk_unresolved
  FROM public.fraud_events
  WHERE gym_id = p_gym_id AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_risk_critical
  FROM public.fraud_events
  WHERE gym_id = p_gym_id AND resolved_at IS NULL AND severity IN ('high', 'critical');

  -- ============================================================
  -- Machine Ops: Live Summary
  -- ============================================================
  SELECT
    COALESCE(SUM(CASE WHEN is_busy THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_active AND NOT is_busy AND NOT COALESCE(is_under_maintenance, false) THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(is_under_maintenance, false) THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END), 0),
    COUNT(*)
  INTO v_machines_active, v_machines_available, v_machines_maintenance, v_machines_offline, v_machines_total
  FROM public.machines
  WHERE gym_id = p_gym_id;

  -- ============================================================
  -- Machine Ops: Usage Trend (sessions per day, last N days)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.d), '[]'::jsonb)
  INTO v_usage_trend
  FROM (
    SELECT
      d::DATE AS d,
      COUNT(s.id) AS sessions,
      CASE WHEN GREATEST(v_machines_total, 1) > 0
        THEN ROUND(COUNT(s.id)::NUMERIC / GREATEST(v_machines_total, 1) * 100 / 24, 1)
        ELSE 0
      END AS "utilizationPct"
    FROM generate_series(
      (v_window_start AT TIME ZONE v_tz)::DATE,
      (v_now AT TIME ZONE v_tz)::DATE,
      '1 day'::INTERVAL
    ) AS d
    LEFT JOIN public.sessions s
      ON s.gym_id = p_gym_id
      AND (s.started_at AT TIME ZONE v_tz)::DATE = d::DATE
    GROUP BY d
  ) t;

  -- ============================================================
  -- Machine Ops: Type Split
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_type_split
  FROM (
    SELECT
      m.type,
      COUNT(s.id) AS sessions,
      ROUND(COUNT(s.id)::NUMERIC / GREATEST(NULLIF(total.cnt, 0), 1) * 100, 1) AS "sharePct"
    FROM public.sessions s
    JOIN public.machines m ON m.id = s.machine_id
    CROSS JOIN (
      SELECT COUNT(*) AS cnt FROM public.sessions
      WHERE gym_id = p_gym_id AND started_at >= v_window_start
    ) total
    WHERE s.gym_id = p_gym_id AND s.started_at >= v_window_start
    GROUP BY m.type, total.cnt
    ORDER BY sessions DESC
  ) t;

  -- ============================================================
  -- Machine Ops: Peak Hour
  -- ============================================================
  SELECT jsonb_build_object('hour', h, 'sessions', cnt)
  INTO v_peak_hour
  FROM (
    SELECT EXTRACT(HOUR FROM s.started_at AT TIME ZONE v_tz)::INT AS h,
           COUNT(*) AS cnt
    FROM public.sessions s
    WHERE s.gym_id = p_gym_id AND s.started_at >= v_window_start
    GROUP BY h
    ORDER BY cnt DESC
    LIMIT 1
  ) sub;

  -- ============================================================
  -- Desk Feed (last 10 events: checkins + redemptions)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.at DESC), '[]'::jsonb)
  INTO v_desk_feed
  FROM (
    (
      SELECT
        gc.id::TEXT AS id,
        'checkin' AS kind,
        COALESCE(p.username, 'Unknown') AS title,
        gc.checked_in_at AS at,
        'done' AS status
      FROM public.gym_checkins gc
      LEFT JOIN public.profiles p ON p.id = gc.user_id
      WHERE gc.gym_id = p_gym_id
      ORDER BY gc.checked_in_at DESC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT
        r.id::TEXT AS id,
        'redemption' AS kind,
        COALESCE(p.username, 'Unknown') || ': ' || COALESCE(rw.name, r.description, 'Reward') AS title,
        r.created_at AS at,
        r.status
      FROM public.redemptions r
      LEFT JOIN public.profiles p ON p.id = r.user_id
      LEFT JOIN public.rewards rw ON rw.id = r.reward_id
      WHERE r.gym_id = p_gym_id
      ORDER BY r.created_at DESC
      LIMIT 5
    )
  ) t;

  -- ============================================================
  -- Challenge Snapshot
  -- ============================================================
  SELECT COUNT(*) INTO v_challenges_active
  FROM public.gym_challenges
  WHERE gym_id = p_gym_id AND is_active = true;

  SELECT ROUND(
    CASE WHEN COUNT(*) > 0
      THEN SUM(CASE WHEN cp.is_completed THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100
      ELSE 0
    END, 1
  )
  INTO v_challenges_completion
  FROM public.challenge_progress cp
  JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
  WHERE cp.gym_id = p_gym_id AND gc.is_active = true;

  SELECT gc.name INTO v_challenges_popular
  FROM public.challenge_progress cp
  JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
  WHERE cp.gym_id = p_gym_id AND gc.is_active = true
  GROUP BY gc.id, gc.name
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- ============================================================
  -- Setup Status
  -- ============================================================
  v_blockers := ARRAY[]::TEXT[];

  IF v_machines_total = 0 THEN
    v_blockers := array_append(v_blockers, 'no_machines');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rewards WHERE gym_id = p_gym_id AND is_active = true LIMIT 1) THEN
    v_blockers := array_append(v_blockers, 'no_active_rewards');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tokenomics_config WHERE gym_id = p_gym_id OR gym_id IS NULL LIMIT 1) THEN
    v_blockers := array_append(v_blockers, 'no_tokenomics_config');
  END IF;

  IF v_members_total = 0 THEN
    v_blockers := array_append(v_blockers, 'no_members');
  END IF;

  -- ============================================================
  -- Assemble result
  -- ============================================================
  v_result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'members', jsonb_build_object(
        'total', v_members_total,
        'active7d', v_members_active7d,
        'activeRatePct', CASE WHEN v_members_total > 0
          THEN ROUND(v_members_active7d::NUMERIC / v_members_total * 100, 1)
          ELSE 0 END
      ),
      'checkins', jsonb_build_object(
        'today', v_checkins_today,
        'week', v_checkins_week
      ),
      'storeDesk', jsonb_build_object(
        'pendingPickups', v_pending_pickups,
        'confirmedToday', v_confirmed_today
      ),
      'economy', jsonb_build_object(
        'burnMintRatio', v_burn_mint_ratio,
        'top1SharePct', v_top1_share,
        'health', CASE
          WHEN v_burn_mint_ratio >= 0.4 AND v_top1_share <= 30 THEN 'green'
          WHEN v_burn_mint_ratio >= 0.15 AND v_top1_share <= 50 THEN 'yellow'
          ELSE 'red'
        END,
        'healthLabel', CASE
          WHEN v_burn_mint_ratio >= 0.4 AND v_top1_share <= 30 THEN 'Healthy'
          WHEN v_burn_mint_ratio >= 0.15 AND v_top1_share <= 50 THEN 'Needs attention'
          ELSE 'At risk'
        END
      ),
      'dropsIssued7d', jsonb_build_object(
        'total', v_drops_current,
        'prev7d', v_drops_prev,
        'deltaPct', CASE
          WHEN v_drops_prev > 0
          THEN ROUND((v_drops_current - v_drops_prev)::NUMERIC / v_drops_prev * 100, 1)
          ELSE NULL
        END
      ),
      'risk', jsonb_build_object(
        'unresolved', v_risk_unresolved,
        'critical', v_risk_critical
      )
    ),
    'machineOps', jsonb_build_object(
      'liveSummary', jsonb_build_object(
        'active', v_machines_active,
        'available', v_machines_available,
        'maintenance', v_machines_maintenance,
        'offline', v_machines_offline,
        'total', v_machines_total
      ),
      'usageTrend7d', v_usage_trend,
      'typeSplit', v_type_split,
      'peakHour', COALESCE(v_peak_hour, 'null'::jsonb)
    ),
    'deskFeed', v_desk_feed,
    'challengeSnapshot', jsonb_build_object(
      'active', v_challenges_active,
      'completionRatePct', COALESCE(v_challenges_completion, 0),
      'mostPopular', v_challenges_popular
    ),
    'setupStatus', jsonb_build_object(
      'complete', cardinality(v_blockers) = 0,
      'blockers', to_jsonb(v_blockers)
    )
  );

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.get_gym_dashboard_overview(UUID, INT) IS
  'Single RPC returning full dashboard overview for admin command center. Returns JSONB with kpis, machineOps, deskFeed, challengeSnapshot, setupStatus.';
GRANT EXECUTE ON FUNCTION public.get_gym_dashboard_overview(UUID, INT) TO authenticated;
