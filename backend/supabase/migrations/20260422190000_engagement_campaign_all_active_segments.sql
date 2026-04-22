-- Migration: 20260422190000_engagement_campaign_all_active_segments.sql
-- Description: Add 'all' and 'active' audience segments to engagement campaigns
--
-- AGENT NOTE: [2026-04-22] - supabase-dba
-- Reference: docs/plans/expand_engagement_segments_4e33aca7.plan.md
--
-- Changes:
--   1) Extend engagement_campaigns.audience_type CHECK to include 'all' and 'active'
--   2) New RPC get_members_by_segment — replaces per-segment calls in UI (backward compat)
--   3) Extend create_engagement_campaign to resolve 'all' and 'active' targets natively

-- ============================================================
-- 1) Extend CHECK constraint on engagement_campaigns
-- ============================================================

ALTER TABLE public.engagement_campaigns
  DROP CONSTRAINT IF EXISTS engagement_campaigns_audience_type_check;

ALTER TABLE public.engagement_campaigns
  ADD CONSTRAINT engagement_campaigns_audience_type_check
  CHECK (audience_type IN ('inactive', 'custom', 'all', 'active'));

-- ============================================================
-- 2) RPC get_members_by_segment
-- ============================================================
-- Returns the same shape as get_members_at_risk so the admin UI can use
-- either RPC transparently.
--
-- p_segment_type: 'all' | 'active' | 'inactive'
-- p_days: meaning depends on segment_type:
--   - 'active'   → had a check-in within the last p_days days (default 7)
--   - 'inactive' → no check-in in the last p_days days (default 14)
--   - 'all'      → p_days is ignored

CREATE OR REPLACE FUNCTION public.get_members_by_segment(
  p_gym_id       UUID,
  p_segment_type TEXT    DEFAULT 'inactive',
  p_days         INT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_cutoff   TIMESTAMPTZ;
  v_days     INT;
  v_result   JSONB;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_segment_type NOT IN ('all', 'active', 'inactive') THEN
    RETURN jsonb_build_object('error', 'Invalid segment_type. Use all, active, or inactive.');
  END IF;

  -- ── ALL members ──────────────────────────────────────────────────────────
  IF p_segment_type = 'all' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id',       p.id,
      'username',      p.username,
      'full_name',     p.full_name,
      'avatar_url',    p.avatar_url,
      'email',         p.email,
      'last_checkin',  NULL,
      'days_inactive', NULL,
      'total_checkins', (
        SELECT COUNT(*) FROM public.gym_checkins gc2
        WHERE gc2.user_id = p.id AND gc2.gym_id = p_gym_id
      ),
      'has_push_token', (p.expo_push_token IS NOT NULL AND p.expo_push_token != '')
    ) ORDER BY p.username), '[]'::jsonb)
    INTO v_result
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.gym_id = p_gym_id
      AND p.role = 'user';

  -- ── ACTIVE members ────────────────────────────────────────────────────────
  ELSIF p_segment_type = 'active' THEN
    v_days   := LEAST(365, GREATEST(1, COALESCE(p_days, 7)));
    v_cutoff := NOW() - (v_days || ' days')::INTERVAL;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id',        t.user_id,
      'username',       t.username,
      'full_name',      t.full_name,
      'avatar_url',     t.avatar_url,
      'email',          t.email,
      'last_checkin',   t.last_checkin,
      'days_inactive',  NULL,
      'total_checkins', t.total_checkins,
      'has_push_token', t.has_push_token
    ) ORDER BY t.last_checkin DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        p.id            AS user_id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.email,
        MAX(gc.checked_in_at)                                         AS last_checkin,
        COUNT(gc.id)::INT                                             AS total_checkins,
        (p.expo_push_token IS NOT NULL AND p.expo_push_token != '')   AS has_push_token
      FROM public.gym_memberships gm
      JOIN public.profiles p ON p.id = gm.user_id
      JOIN public.gym_checkins gc ON gc.user_id = p.id AND gc.gym_id = p_gym_id
      WHERE gm.gym_id = p_gym_id
        AND p.role = 'user'
      GROUP BY p.id, p.username, p.full_name, p.avatar_url, p.email, p.expo_push_token
      HAVING MAX(gc.checked_in_at) >= v_cutoff
    ) t;

  -- ── INACTIVE members (mirrors get_members_at_risk) ────────────────────────
  ELSE
    v_days   := LEAST(365, GREATEST(1, COALESCE(p_days, 14)));
    v_cutoff := NOW() - (v_days || ' days')::INTERVAL;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id',        t.user_id,
      'username',       t.username,
      'full_name',      t.full_name,
      'avatar_url',     t.avatar_url,
      'email',          t.email,
      'last_checkin',   t.last_checkin,
      'days_inactive',  t.days_inactive,
      'total_checkins', t.total_checkins,
      'has_push_token', t.has_push_token
    ) ORDER BY t.days_inactive DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        p.id            AS user_id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.email,
        MAX(gc.checked_in_at)                                                  AS last_checkin,
        EXTRACT(DAY FROM NOW() - MAX(gc.checked_in_at))::INT                   AS days_inactive,
        COUNT(gc.id)::INT                                                       AS total_checkins,
        (p.expo_push_token IS NOT NULL AND p.expo_push_token != '')            AS has_push_token
      FROM public.gym_memberships gm
      JOIN public.profiles p ON p.id = gm.user_id
      LEFT JOIN public.gym_checkins gc ON gc.user_id = p.id AND gc.gym_id = p_gym_id
      WHERE gm.gym_id = p_gym_id
        AND p.role = 'user'
      GROUP BY p.id, p.username, p.full_name, p.avatar_url, p.email, p.expo_push_token
      HAVING MAX(gc.checked_in_at) IS NULL OR MAX(gc.checked_in_at) < v_cutoff
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'members',        COALESCE(v_result, '[]'::jsonb),
    'count',          COALESCE(jsonb_array_length(v_result), 0),
    'segment_type',   p_segment_type,
    'days',           p_days
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_members_by_segment(UUID, TEXT, INT) TO authenticated;

-- ============================================================
-- 3) Extend create_engagement_campaign to resolve 'all' / 'active' targets
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_engagement_campaign(
  p_gym_id          UUID,
  p_campaign_type   TEXT    DEFAULT 'reminder',
  p_title           TEXT    DEFAULT '',
  p_body            TEXT    DEFAULT '',
  p_deep_link       TEXT    DEFAULT NULL,
  p_reward_id       UUID    DEFAULT NULL,
  p_audience_type   TEXT    DEFAULT 'inactive',
  p_audience_params JSONB   DEFAULT '{}'::jsonb,
  p_user_ids        UUID[]  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_campaign_id      UUID;
  v_caller           UUID;
  v_target_count     INT := 0;
  v_days_inactive    INT;
  v_days_active      INT;
  v_cutoff           TIMESTAMPTZ;
  v_today_campaigns  INT;
BEGIN
  v_caller := auth.uid();

  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF TRIM(COALESCE(p_title, '')) = '' OR TRIM(COALESCE(p_body, '')) = '' THEN
    RETURN jsonb_build_object('error', 'Title and body are required');
  END IF;

  IF p_audience_type NOT IN ('inactive', 'custom', 'all', 'active') THEN
    RETURN jsonb_build_object('error', 'Invalid audience_type');
  END IF;

  -- Rate limit: max 5 campaigns per gym per day (Belgrade day boundary)
  SELECT COUNT(*) INTO v_today_campaigns
  FROM public.engagement_campaigns
  WHERE gym_id = p_gym_id
    AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';

  IF v_today_campaigns >= 5 THEN
    RETURN jsonb_build_object('error', 'Daily campaign limit reached (max 5 per day)');
  END IF;

  INSERT INTO public.engagement_campaigns (
    gym_id, created_by, campaign_type, title, body, deep_link, reward_id,
    audience_type, audience_params, status
  )
  VALUES (
    p_gym_id, v_caller,
    COALESCE(p_campaign_type, 'reminder'),
    TRIM(p_title), TRIM(p_body), p_deep_link, p_reward_id,
    COALESCE(p_audience_type, 'inactive'),
    COALESCE(p_audience_params, '{}'::jsonb),
    'draft'
  )
  RETURNING id INTO v_campaign_id;

  -- ── Resolve targets based on audience_type ────────────────────────────────

  IF p_audience_type = 'custom' AND p_user_ids IS NOT NULL THEN
    -- Explicit user list — must be members of the gym
    INSERT INTO public.engagement_campaign_targets (campaign_id, user_id, push_token)
    SELECT v_campaign_id, p.id, p.expo_push_token
    FROM unnest(p_user_ids) uid(id)
    JOIN public.profiles p ON p.id = uid.id
    JOIN public.gym_memberships gm ON gm.user_id = p.id AND gm.gym_id = p_gym_id
    WHERE p.role = 'user';

    GET DIAGNOSTICS v_target_count = ROW_COUNT;

  ELSIF p_audience_type = 'inactive' THEN
    v_days_inactive := COALESCE((p_audience_params->>'days_inactive')::INT, 14);
    v_days_inactive := LEAST(365, GREATEST(1, v_days_inactive));
    v_cutoff        := NOW() - (v_days_inactive || ' days')::INTERVAL;

    INSERT INTO public.engagement_campaign_targets (campaign_id, user_id, push_token)
    SELECT v_campaign_id, p.id, p.expo_push_token
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    LEFT JOIN public.gym_checkins gc ON gc.user_id = p.id AND gc.gym_id = p_gym_id
    WHERE gm.gym_id = p_gym_id AND p.role = 'user'
    GROUP BY p.id, p.expo_push_token
    HAVING MAX(gc.checked_in_at) IS NULL OR MAX(gc.checked_in_at) < v_cutoff;

    GET DIAGNOSTICS v_target_count = ROW_COUNT;

  ELSIF p_audience_type = 'active' THEN
    v_days_active := COALESCE((p_audience_params->>'days_active')::INT, 7);
    v_days_active := LEAST(365, GREATEST(1, v_days_active));
    v_cutoff      := NOW() - (v_days_active || ' days')::INTERVAL;

    INSERT INTO public.engagement_campaign_targets (campaign_id, user_id, push_token)
    SELECT v_campaign_id, p.id, p.expo_push_token
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    JOIN public.gym_checkins gc ON gc.user_id = p.id AND gc.gym_id = p_gym_id
    WHERE gm.gym_id = p_gym_id AND p.role = 'user'
    GROUP BY p.id, p.expo_push_token
    HAVING MAX(gc.checked_in_at) >= v_cutoff;

    GET DIAGNOSTICS v_target_count = ROW_COUNT;

  ELSIF p_audience_type = 'all' THEN
    INSERT INTO public.engagement_campaign_targets (campaign_id, user_id, push_token)
    SELECT v_campaign_id, p.id, p.expo_push_token
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.gym_id = p_gym_id AND p.role = 'user';

    GET DIAGNOSTICS v_target_count = ROW_COUNT;
  END IF;

  UPDATE public.engagement_campaigns
  SET target_count = v_target_count
  WHERE id = v_campaign_id;

  RETURN jsonb_build_object(
    'success',      true,
    'campaign_id',  v_campaign_id,
    'target_count', v_target_count,
    'status',       'draft'
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_engagement_campaign(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID[]) TO authenticated;
