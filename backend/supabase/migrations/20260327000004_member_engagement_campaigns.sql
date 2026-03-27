-- Migration: 20260327000004_member_engagement_campaigns.sql
-- Description: Admin-triggered at-risk push campaigns
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/staff_identity_engagement_promotions_realtime_master_plan.md — Workstream C1
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: Campaign creation UI, at-risk member segment picker, delivery dashboard
-- - Mobile App: Push notification deep links for campaign messages

-- ============================================================
-- 1) Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.engagement_campaigns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id          UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  campaign_type   TEXT NOT NULL DEFAULT 'reminder' CHECK (campaign_type IN ('reminder', 'offer')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  deep_link       TEXT NULL,
  reward_id       UUID NULL REFERENCES public.rewards(id) ON DELETE SET NULL,
  audience_type   TEXT NOT NULL DEFAULT 'inactive' CHECK (audience_type IN ('inactive', 'custom')),
  audience_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
  target_count    INT NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  sent_count      INT NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count    INT NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  queued_at       TIMESTAMPTZ NULL,
  sent_at         TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.engagement_campaign_targets (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id  UUID NOT NULL REFERENCES public.engagement_campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_token   TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.engagement_campaign_deliveries (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id  UUID NOT NULL REFERENCES public.engagement_campaigns(id) ON DELETE CASCADE,
  target_id    UUID NOT NULL REFERENCES public.engagement_campaign_targets(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  provider_id  TEXT NULL,
  error_text   TEXT NULL,
  retry_count  INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  sent_at      TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2) Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_eng_campaigns_gym_status
  ON public.engagement_campaigns (gym_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eng_targets_campaign
  ON public.engagement_campaign_targets (campaign_id);

CREATE INDEX IF NOT EXISTS idx_eng_deliveries_campaign_status
  ON public.engagement_campaign_deliveries (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_eng_deliveries_user
  ON public.engagement_campaign_deliveries (user_id, created_at DESC);

-- ============================================================
-- 3) RLS
-- ============================================================

ALTER TABLE public.engagement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_campaign_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ec_superadmin_all' AND tablename = 'engagement_campaigns') THEN
    CREATE POLICY "ec_superadmin_all" ON public.engagement_campaigns FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ec_gym_staff' AND tablename = 'engagement_campaigns') THEN
    CREATE POLICY "ec_gym_staff" ON public.engagement_campaigns FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('gym_owner', 'gym_admin')
          AND (p.admin_gym_id = engagement_campaigns.gym_id OR p.assigned_gym_id = engagement_campaigns.gym_id)
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ect_superadmin_all' AND tablename = 'engagement_campaign_targets') THEN
    CREATE POLICY "ect_superadmin_all" ON public.engagement_campaign_targets FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ect_gym_staff' AND tablename = 'engagement_campaign_targets') THEN
    CREATE POLICY "ect_gym_staff" ON public.engagement_campaign_targets FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.engagement_campaigns ec
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE ec.id = engagement_campaign_targets.campaign_id
          AND p.role IN ('gym_owner', 'gym_admin')
          AND (p.admin_gym_id = ec.gym_id OR p.assigned_gym_id = ec.gym_id)
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ecd_superadmin_all' AND tablename = 'engagement_campaign_deliveries') THEN
    CREATE POLICY "ecd_superadmin_all" ON public.engagement_campaign_deliveries FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ecd_gym_staff' AND tablename = 'engagement_campaign_deliveries') THEN
    CREATE POLICY "ecd_gym_staff" ON public.engagement_campaign_deliveries FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.engagement_campaigns ec
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE ec.id = engagement_campaign_deliveries.campaign_id
          AND p.role IN ('gym_owner', 'gym_admin')
          AND (p.admin_gym_id = ec.gym_id OR p.assigned_gym_id = ec.gym_id)
      ));
  END IF;
END $$;

-- ============================================================
-- 4) RPC: get_members_at_risk
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_members_at_risk(
  p_gym_id        UUID,
  p_days_inactive INT DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_days_inactive := LEAST(365, GREATEST(1, COALESCE(p_days_inactive, 14)));
  v_cutoff := NOW() - (p_days_inactive || ' days')::INTERVAL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', t.user_id,
    'username', t.username,
    'full_name', t.full_name,
    'avatar_url', t.avatar_url,
    'email', t.email,
    'last_checkin', t.last_checkin,
    'days_inactive', t.days_inactive,
    'total_checkins', t.total_checkins,
    'has_push_token', t.has_push_token
  ) ORDER BY t.days_inactive DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.id AS user_id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.email,
      MAX(gc.checked_in_at) AS last_checkin,
      EXTRACT(DAY FROM NOW() - MAX(gc.checked_in_at))::INT AS days_inactive,
      COUNT(gc.id)::INT AS total_checkins,
      (p.expo_push_token IS NOT NULL AND p.expo_push_token != '') AS has_push_token
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    LEFT JOIN public.gym_checkins gc ON gc.user_id = p.id AND gc.gym_id = p_gym_id
    WHERE gm.gym_id = p_gym_id
      AND p.role = 'user'
    GROUP BY p.id, p.username, p.full_name, p.avatar_url, p.email, p.expo_push_token
    HAVING MAX(gc.checked_in_at) IS NULL OR MAX(gc.checked_in_at) < v_cutoff
  ) t;

  RETURN jsonb_build_object(
    'members', COALESCE(v_result, '[]'::jsonb),
    'count', COALESCE(jsonb_array_length(v_result), 0),
    'days_inactive_threshold', p_days_inactive
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_members_at_risk(UUID, INT) TO authenticated;

-- ============================================================
-- 5) RPC: create_engagement_campaign
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_engagement_campaign(
  p_gym_id        UUID,
  p_campaign_type TEXT DEFAULT 'reminder',
  p_title         TEXT DEFAULT '',
  p_body          TEXT DEFAULT '',
  p_deep_link     TEXT DEFAULT NULL,
  p_reward_id     UUID DEFAULT NULL,
  p_audience_type TEXT DEFAULT 'inactive',
  p_audience_params JSONB DEFAULT '{}'::jsonb,
  p_user_ids      UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_campaign_id UUID;
  v_caller      UUID;
  v_target_count INT := 0;
  v_days_inactive INT;
  v_cutoff TIMESTAMPTZ;

  -- Quota: max 5 campaigns per gym per day
  v_today_campaigns INT;
BEGIN
  v_caller := auth.uid();

  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF TRIM(COALESCE(p_title, '')) = '' OR TRIM(COALESCE(p_body, '')) = '' THEN
    RETURN jsonb_build_object('error', 'Title and body are required');
  END IF;

  -- Rate limit: max 5 campaigns per gym per day
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

  -- Resolve targets
  IF p_audience_type = 'custom' AND p_user_ids IS NOT NULL THEN
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
    v_cutoff := NOW() - (v_days_inactive || ' days')::INTERVAL;

    INSERT INTO public.engagement_campaign_targets (campaign_id, user_id, push_token)
    SELECT v_campaign_id, p.id, p.expo_push_token
    FROM public.gym_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    LEFT JOIN public.gym_checkins gc ON gc.user_id = p.id AND gc.gym_id = p_gym_id
    WHERE gm.gym_id = p_gym_id AND p.role = 'user'
    GROUP BY p.id, p.expo_push_token
    HAVING MAX(gc.checked_in_at) IS NULL OR MAX(gc.checked_in_at) < v_cutoff;

    GET DIAGNOSTICS v_target_count = ROW_COUNT;
  END IF;

  UPDATE public.engagement_campaigns
  SET target_count = v_target_count
  WHERE id = v_campaign_id;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', v_campaign_id,
    'target_count', v_target_count,
    'status', 'draft'
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_engagement_campaign(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID[]) TO authenticated;

-- ============================================================
-- 6) RPC: queue_engagement_delivery
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_engagement_delivery(
  p_campaign_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_campaign RECORD;
  v_queued_count INT := 0;
BEGIN
  SELECT * INTO v_campaign FROM public.engagement_campaigns WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Campaign not found');
  END IF;

  IF NOT public._admin_check_gym_access(v_campaign.gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF v_campaign.status NOT IN ('draft', 'failed') THEN
    RETURN jsonb_build_object('error', 'Campaign cannot be queued from status: ' || v_campaign.status);
  END IF;

  IF v_campaign.target_count = 0 THEN
    RETURN jsonb_build_object('error', 'No targets resolved for this campaign');
  END IF;

  -- Create delivery records for targets with push tokens
  INSERT INTO public.engagement_campaign_deliveries (campaign_id, target_id, user_id, status)
  SELECT t.campaign_id, t.id, t.user_id, 'pending'
  FROM public.engagement_campaign_targets t
  WHERE t.campaign_id = p_campaign_id
    AND t.push_token IS NOT NULL
    AND t.push_token != ''
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_queued_count = ROW_COUNT;

  UPDATE public.engagement_campaigns
  SET status = 'queued',
      queued_at = NOW(),
      updated_at = NOW()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', p_campaign_id,
    'queued_deliveries', v_queued_count,
    'status', 'queued'
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.queue_engagement_delivery(UUID) TO authenticated;
