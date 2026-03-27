-- Migration: 20260327000007_happy_hour_user_visibility_and_reminders.sql
-- Description: Happy Hour upcoming visibility + user reminder preferences + dedupe logs
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/happy_hour_visibility_and_reminders_plan.md — Step 1
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Home card showing upcoming windows via get_upcoming_happy_hours.
--   Settings screen: reminder toggle + offset selector via set_happy_hour_reminder_pref.
-- - Admin Panel: Boost rule form gains "Visible to members" toggle + display label field.
--   Schedule preview panel via get_happy_hour_schedule_preview.

-- ============================================================
-- 1) Extend gym_drop_boost_rules
-- ============================================================

ALTER TABLE public.gym_drop_boost_rules
  ADD COLUMN IF NOT EXISTS is_visible_to_members BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.gym_drop_boost_rules
  ADD COLUMN IF NOT EXISTS display_label TEXT NULL;

-- ============================================================
-- 2) Profile reminder preferences
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS happy_hour_reminders_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS happy_hour_reminder_offset_min INT NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_hh_reminder_offset_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_hh_reminder_offset_check
      CHECK (happy_hour_reminder_offset_min IN (0, 10, 30));
  END IF;
END $$;

-- ============================================================
-- 3) Reminder delivery dedupe table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.happy_hour_reminder_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id          UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES public.gym_drop_boost_rules(id) ON DELETE CASCADE,
  window_start_at TIMESTAMPTZ NOT NULL,
  offset_min      INT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_hh_reminder_dedupe'
  ) THEN
    ALTER TABLE public.happy_hour_reminder_logs
      ADD CONSTRAINT uq_hh_reminder_dedupe
      UNIQUE (user_id, rule_id, window_start_at, offset_min);
  END IF;
END $$;

ALTER TABLE public.happy_hour_reminder_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hhrl_superadmin_all' AND tablename = 'happy_hour_reminder_logs') THEN
    CREATE POLICY "hhrl_superadmin_all" ON public.happy_hour_reminder_logs FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hhrl_gym_staff_read' AND tablename = 'happy_hour_reminder_logs') THEN
    CREATE POLICY "hhrl_gym_staff_read" ON public.happy_hour_reminder_logs FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('gym_owner', 'gym_admin')
          AND (p.admin_gym_id = happy_hour_reminder_logs.gym_id OR p.assigned_gym_id = happy_hour_reminder_logs.gym_id)
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hhrl_user_own_read' AND tablename = 'happy_hour_reminder_logs') THEN
    CREATE POLICY "hhrl_user_own_read" ON public.happy_hour_reminder_logs FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 4) Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_boost_rules_gym_visible
  ON public.gym_drop_boost_rules (gym_id, is_active, is_visible_to_members)
  WHERE is_active = true AND is_visible_to_members = true;

CREATE INDEX IF NOT EXISTS idx_hh_reminder_logs_gym_sent
  ON public.happy_hour_reminder_logs (gym_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_hh_reminder_logs_dedupe
  ON public.happy_hour_reminder_logs (user_id, rule_id, window_start_at, offset_min);

-- ============================================================
-- 5) RPC: get_upcoming_happy_hours
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_upcoming_happy_hours(
  p_gym_id UUID,
  p_limit  INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result JSONB;
  v_now    TIMESTAMPTZ := NOW();
BEGIN
  p_limit := LEAST(10, GREATEST(1, COALESCE(p_limit, 3)));

  WITH windows AS (
    SELECT
      r.id AS rule_id,
      COALESCE(r.display_label, r.name) AS label,
      r.multiplier,
      (d.gen_date + r.start_time_local) AT TIME ZONE r.timezone AS window_start,
      (d.gen_date + r.end_time_local) AT TIME ZONE r.timezone AS window_end,
      GREATEST(0, EXTRACT(EPOCH FROM ((d.gen_date + r.start_time_local) AT TIME ZONE r.timezone - v_now)) / 60)::INT AS mins_until,
      (d.gen_date = (v_now AT TIME ZONE r.timezone)::DATE) AS is_today
    FROM public.gym_drop_boost_rules r
    CROSS JOIN LATERAL (
      SELECT generate_series(
        (v_now AT TIME ZONE r.timezone)::DATE,
        ((v_now AT TIME ZONE r.timezone)::DATE + INTERVAL '7 days')::DATE,
        '1 day'::INTERVAL
      )::DATE AS gen_date
    ) d
    WHERE r.gym_id = p_gym_id
      AND r.is_active = true
      AND r.is_visible_to_members = true
      AND EXTRACT(DOW FROM d.gen_date)::INT = ANY(r.days_of_week)
      AND (d.gen_date + r.end_time_local) AT TIME ZONE r.timezone > v_now
    ORDER BY (d.gen_date + r.start_time_local) AT TIME ZONE r.timezone ASC
    LIMIT p_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rule_id', w.rule_id,
    'label', w.label,
    'multiplier', w.multiplier,
    'start_at', w.window_start,
    'end_at', w.window_end,
    'minutes_until_start', w.mins_until,
    'is_today', w.is_today
  ) ORDER BY w.window_start ASC), '[]'::jsonb)
  INTO v_result
  FROM windows w;

  RETURN jsonb_build_object(
    'windows', COALESCE(v_result, '[]'::jsonb),
    'count', COALESCE(jsonb_array_length(v_result), 0)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_happy_hours(UUID, INT) TO authenticated;

-- ============================================================
-- 6) RPC: set_happy_hour_reminder_pref
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_happy_hour_reminder_pref(
  p_enabled    BOOLEAN,
  p_offset_min INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_offset_min NOT IN (0, 10, 30) THEN
    RETURN jsonb_build_object('error', 'Invalid offset. Must be 0, 10, or 30.');
  END IF;

  UPDATE public.profiles
  SET happy_hour_reminders_enabled = COALESCE(p_enabled, happy_hour_reminders_enabled),
      happy_hour_reminder_offset_min = COALESCE(p_offset_min, happy_hour_reminder_offset_min),
      updated_at = NOW()
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'enabled', COALESCE(p_enabled, true),
    'offset_min', COALESCE(p_offset_min, 30)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_happy_hour_reminder_pref(BOOLEAN, INT) TO authenticated;

-- ============================================================
-- 7) RPC: get_happy_hour_schedule_preview (admin)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_happy_hour_schedule_preview(
  p_gym_id UUID,
  p_days   INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result JSONB;
  v_now    TIMESTAMPTZ := NOW();
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_days := LEAST(30, GREATEST(1, COALESCE(p_days, 7)));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rule_id', t.rule_id,
    'name', t.rule_name,
    'label', t.label,
    'multiplier', t.multiplier,
    'date', t.gen_date::TEXT,
    'day_name', TO_CHAR(t.gen_date, 'Dy'),
    'start_time', t.start_time::TEXT,
    'end_time', t.end_time::TEXT,
    'start_at', t.window_start,
    'end_at', t.window_end,
    'is_visible', t.is_visible,
    'machine_types', t.machine_types,
    'is_past', t.window_end < v_now
  ) ORDER BY t.window_start ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id AS rule_id,
      r.name AS rule_name,
      COALESCE(r.display_label, r.name) AS label,
      r.multiplier,
      d.gen_date,
      r.start_time_local AS start_time,
      r.end_time_local AS end_time,
      (d.gen_date + r.start_time_local) AT TIME ZONE r.timezone AS window_start,
      (d.gen_date + r.end_time_local) AT TIME ZONE r.timezone AS window_end,
      r.is_visible_to_members AS is_visible,
      r.machine_types
    FROM public.gym_drop_boost_rules r
    CROSS JOIN LATERAL (
      SELECT generate_series(
        (v_now AT TIME ZONE r.timezone)::DATE,
        ((v_now AT TIME ZONE r.timezone)::DATE + (p_days || ' days')::INTERVAL)::DATE,
        '1 day'::INTERVAL
      )::DATE AS gen_date
    ) d
    WHERE r.gym_id = p_gym_id
      AND r.is_active = true
      AND EXTRACT(DOW FROM d.gen_date)::INT = ANY(r.days_of_week)
  ) t;

  RETURN jsonb_build_object(
    'schedule', COALESCE(v_result, '[]'::jsonb),
    'count', COALESCE(jsonb_array_length(v_result), 0),
    'days', p_days
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_happy_hour_schedule_preview(UUID, INT) TO authenticated;
