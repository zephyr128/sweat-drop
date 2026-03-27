-- Migration: 20260325000022_fix_admin_list_clamp_call.sql
-- Description: Fix _admin_clamp_pagination call pattern in all admin_list_* RPCs
-- The INOUT function returns a record, must destructure properly.

-- Simplify: replace helper with inline clamping in each RPC.
-- Drop the helper and redefine all 7 functions with inline clamping.

DROP FUNCTION IF EXISTS public._admin_clamp_pagination(INT, INT, TEXT);

-- ============================================================
-- 1) MEMBERS LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_members(
  p_gym_id   UUID,
  p_search   TEXT    DEFAULT NULL,
  p_page     INT     DEFAULT 1,
  p_limit    INT     DEFAULT 25,
  p_sort_by  TEXT    DEFAULT 'created_at',
  p_sort_dir TEXT    DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset     INT;
  v_total      BIGINT;
  v_items      JSONB;
  v_sort_col   TEXT;
  v_sql        TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  p_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'username'       THEN 'p.username'
    WHEN 'email'          THEN 'p.email'
    WHEN 'created_at'     THEN 'gm.created_at'
    WHEN 'last_visit_date' THEN 'p.last_visit_date'
    WHEN 'local_drops_balance' THEN 'gm.local_drops_balance'
    WHEN 'total_drops'    THEN 'p.total_drops'
    WHEN 'streak_days'    THEN 'p.streak_days'
    ELSE 'gm.created_at'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(*) INTO v_total
  FROM public.gym_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.gym_id = p_gym_id
    AND p.role = 'user'
    AND (p_search IS NULL OR p_search = ''
         OR p.username ILIKE '%' || p_search || '%'
         OR p.email ILIKE '%' || p_search || '%'
         OR p.full_name ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT p.id, p.username, p.email, p.full_name, p.avatar_url,
             p.total_drops, p.streak_days, p.last_visit_date, p.is_newcomer,
             gm.local_drops_balance, gm.created_at AS joined_at
      FROM public.gym_memberships gm
      JOIN public.profiles p ON p.id = gm.user_id
      WHERE gm.gym_id = %L
        AND p.role = %L
        AND (%L IS NULL OR %L = ''''
             OR p.username ILIKE ''%%'' || %L || ''%%''
             OR p.email ILIKE ''%%'' || %L || ''%%''
             OR p.full_name ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id, 'user',
    p_search, p_search, p_search, p_search, p_search,
    v_sort_col, p_sort_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_members(UUID,TEXT,INT,INT,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 2) REDEMPTIONS LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_redemptions(
  p_gym_id     UUID,
  p_search     TEXT    DEFAULT NULL,
  p_status     TEXT    DEFAULT NULL,
  p_page       INT     DEFAULT 1,
  p_limit      INT     DEFAULT 25,
  p_sort_by    TEXT    DEFAULT 'created_at',
  p_sort_dir   TEXT    DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset   INT;
  v_total    BIGINT;
  v_items    JSONB;
  v_sort_col TEXT;
  v_sql      TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  p_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'created_at'      THEN 'r.created_at'
    WHEN 'drops_spent'     THEN 'r.drops_spent'
    WHEN 'status'          THEN 'r.status'
    WHEN 'redemption_code' THEN 'r.redemption_code'
    ELSE 'r.created_at'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(*) INTO v_total
  FROM public.redemptions r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.gym_id = p_gym_id
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_search IS NULL OR p_search = ''
         OR r.redemption_code ILIKE '%' || p_search || '%'
         OR p.username ILIKE '%' || p_search || '%'
         OR r.description ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT r.id, r.user_id, p.username, p.avatar_url,
             r.reward_id, rw.name AS reward_name,
             r.drops_spent, r.status, r.redemption_code,
             r.source_type, r.description,
             r.created_at, r.confirmed_at
      FROM public.redemptions r
      LEFT JOIN public.profiles p ON p.id = r.user_id
      LEFT JOIN public.rewards rw ON rw.id = r.reward_id
      WHERE r.gym_id = %L
        AND (%L IS NULL OR r.status = %L)
        AND (%L IS NULL OR %L = ''''
             OR r.redemption_code ILIKE ''%%'' || %L || ''%%''
             OR p.username ILIKE ''%%'' || %L || ''%%''
             OR r.description ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id,
    p_status, p_status,
    p_search, p_search, p_search, p_search, p_search,
    v_sort_col, p_sort_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_redemptions(UUID,TEXT,TEXT,INT,INT,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 3) REWARDS / STORE ITEMS LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_rewards(
  p_gym_id     UUID,
  p_search     TEXT    DEFAULT NULL,
  p_is_active  BOOLEAN DEFAULT NULL,
  p_page       INT     DEFAULT 1,
  p_limit      INT     DEFAULT 25,
  p_sort_by    TEXT    DEFAULT 'created_at',
  p_sort_dir   TEXT    DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset   INT;
  v_total    BIGINT;
  v_items    JSONB;
  v_sort_col TEXT;
  v_sql      TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  p_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'name'        THEN 'rw.name'
    WHEN 'price_drops' THEN 'rw.price_drops'
    WHEN 'reward_type' THEN 'rw.reward_type'
    WHEN 'created_at'  THEN 'rw.created_at'
    WHEN 'stock'       THEN 'rw.stock'
    ELSE 'rw.created_at'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(*) INTO v_total
  FROM public.rewards rw
  WHERE rw.gym_id = p_gym_id
    AND (p_is_active IS NULL OR rw.is_active = p_is_active)
    AND (p_search IS NULL OR p_search = ''
         OR rw.name ILIKE '%' || p_search || '%'
         OR rw.reward_type ILIKE '%' || p_search || '%'
         OR rw.sponsor_name ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT rw.id, rw.name, rw.description, rw.reward_type, rw.price_drops,
             rw.stock, rw.is_active, rw.image_url, rw.sponsor_name,
             rw.price_calc_mode, rw.discount_percent, rw.base_price_rsd,
             rw.available_from, rw.available_until, rw.redemption_limit,
             rw.created_at
      FROM public.rewards rw
      WHERE rw.gym_id = %L
        AND (%L::boolean IS NULL OR rw.is_active = %L::boolean)
        AND (%L IS NULL OR %L = ''''
             OR rw.name ILIKE ''%%'' || %L || ''%%''
             OR rw.reward_type ILIKE ''%%'' || %L || ''%%''
             OR rw.sponsor_name ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id,
    p_is_active, p_is_active,
    p_search, p_search, p_search, p_search, p_search,
    v_sort_col, p_sort_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_rewards(UUID,TEXT,BOOLEAN,INT,INT,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 4) MACHINES LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_machines(
  p_gym_id     UUID,
  p_search     TEXT    DEFAULT NULL,
  p_type       TEXT    DEFAULT NULL,
  p_page       INT     DEFAULT 1,
  p_limit      INT     DEFAULT 25,
  p_sort_by    TEXT    DEFAULT 'name',
  p_sort_dir   TEXT    DEFAULT 'asc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset   INT;
  v_total    BIGINT;
  v_items    JSONB;
  v_sort_col TEXT;
  v_sql      TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  p_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'name'       THEN 'm.name'
    WHEN 'type'       THEN 'm.type'
    WHEN 'created_at' THEN 'm.created_at'
    WHEN 'zone'       THEN 'm.zone'
    ELSE 'm.name'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(*) INTO v_total
  FROM public.machines m
  WHERE m.gym_id = p_gym_id
    AND (p_type IS NULL OR m.type = p_type)
    AND (p_search IS NULL OR p_search = ''
         OR m.name ILIKE '%' || p_search || '%'
         OR m.zone ILIKE '%' || p_search || '%'
         OR m.unique_qr_code ILIKE '%' || p_search || '%'
         OR m.sensor_id ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT m.id, m.name, m.type, m.zone, m.unique_qr_code, m.qr_uuid,
             m.is_active, m.is_busy, m.is_under_maintenance,
             m.sensor_id, m.ble_protocol, m.protocol_verified,
             m.current_user_id, m.last_heartbeat, m.last_rpm,
             m.created_at
      FROM public.machines m
      WHERE m.gym_id = %L
        AND (%L IS NULL OR m.type = %L)
        AND (%L IS NULL OR %L = ''''
             OR m.name ILIKE ''%%'' || %L || ''%%''
             OR m.zone ILIKE ''%%'' || %L || ''%%''
             OR m.unique_qr_code ILIKE ''%%'' || %L || ''%%''
             OR m.sensor_id ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id,
    p_type, p_type,
    p_search, p_search, p_search, p_search, p_search, p_search,
    v_sort_col, p_sort_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_machines(UUID,TEXT,TEXT,INT,INT,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 5) TEAM / STAFF LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_team(
  p_gym_id   UUID,
  p_search   TEXT    DEFAULT NULL,
  p_page     INT     DEFAULT 1,
  p_limit    INT     DEFAULT 25,
  p_sort_by  TEXT    DEFAULT 'created_at',
  p_sort_dir TEXT    DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset   INT;
  v_total    BIGINT;
  v_items    JSONB;
  v_sort_col TEXT;
  v_sql      TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  p_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'username'   THEN 'p.username'
    WHEN 'email'      THEN 'p.email'
    WHEN 'role'       THEN 'p.role'
    WHEN 'created_at' THEN 'p.created_at'
    ELSE 'p.created_at'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(*) INTO v_total
  FROM public.profiles p
  WHERE p.admin_gym_id = p_gym_id
    AND p.role IN ('gym_owner', 'gym_admin', 'receptionist')
    AND (p_search IS NULL OR p_search = ''
         OR p.username ILIKE '%' || p_search || '%'
         OR p.email ILIKE '%' || p_search || '%'
         OR p.full_name ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT p.id, p.username, p.email, p.full_name, p.avatar_url,
             p.role::TEXT, p.created_at
      FROM public.profiles p
      WHERE p.admin_gym_id = %L
        AND p.role IN (''gym_owner'', ''gym_admin'', ''receptionist'')
        AND (%L IS NULL OR %L = ''''
             OR p.username ILIKE ''%%'' || %L || ''%%''
             OR p.email ILIKE ''%%'' || %L || ''%%''
             OR p.full_name ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id,
    p_search, p_search, p_search, p_search, p_search,
    v_sort_col, p_sort_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_team(UUID,TEXT,INT,INT,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 6) CHALLENGES LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_challenges(
  p_gym_id     UUID,
  p_search     TEXT    DEFAULT NULL,
  p_is_active  BOOLEAN DEFAULT NULL,
  p_page       INT     DEFAULT 1,
  p_limit      INT     DEFAULT 25,
  p_sort_by    TEXT    DEFAULT 'created_at',
  p_sort_dir   TEXT    DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset   INT;
  v_total    BIGINT;
  v_items    JSONB;
  v_sort_col TEXT;
  v_sql      TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  p_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'name'           THEN 'c.name'
    WHEN 'challenge_type' THEN 'c.challenge_type'
    WHEN 'start_date'     THEN 'c.start_date'
    WHEN 'end_date'       THEN 'c.end_date'
    WHEN 'created_at'     THEN 'c.created_at'
    ELSE 'c.created_at'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(*) INTO v_total
  FROM public.gym_challenges c
  WHERE c.gym_id = p_gym_id
    AND (p_is_active IS NULL OR c.is_active = p_is_active)
    AND (p_search IS NULL OR p_search = ''
         OR c.name ILIKE '%' || p_search || '%'
         OR c.description ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT c.id, c.name, c.description, c.challenge_type::TEXT,
             c.target_drops, c.reward_drops, c.streak_days,
             c.start_date, c.end_date, c.is_active,
             c.scoring_model, c.sponsor_name,
             c.badge_image_url, c.created_at
      FROM public.gym_challenges c
      WHERE c.gym_id = %L
        AND (%L::boolean IS NULL OR c.is_active = %L::boolean)
        AND (%L IS NULL OR %L = ''''
             OR c.name ILIKE ''%%'' || %L || ''%%''
             OR c.description ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id,
    p_is_active, p_is_active,
    p_search, p_search, p_search, p_search,
    v_sort_col, p_sort_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_challenges(UUID,TEXT,BOOLEAN,INT,INT,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 7) ARENAS LIST
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_arenas(
  p_gym_id     UUID,
  p_search     TEXT    DEFAULT NULL,
  p_is_active  BOOLEAN DEFAULT NULL,
  p_page       INT     DEFAULT 1,
  p_limit      INT     DEFAULT 25,
  p_sort_by    TEXT    DEFAULT 'created_at',
  p_sort_dir   TEXT    DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_offset   INT;
  v_total    BIGINT;
  v_items    JSONB;
  v_sort_col TEXT;
  v_dir      TEXT;
  v_sql      TEXT;
BEGIN
  IF NOT public._admin_check_gym_access(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  p_page     := GREATEST(1, COALESCE(p_page, 1));
  p_limit    := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  v_dir      := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  v_sort_col := CASE p_sort_by
    WHEN 'name'       THEN 'name'
    WHEN 'start_date' THEN 'start_date'
    WHEN 'end_date'   THEN 'end_date'
    WHEN 'created_at' THEN 'created_at'
    ELSE 'created_at'
  END;

  v_offset := (p_page - 1) * p_limit;

  SELECT COUNT(DISTINCT sa.id) INTO v_total
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
  LEFT JOIN public.arena_invitations ai ON ai.arena_id = sa.id AND ai.invited_gym_id = p_gym_id
  WHERE (sa.created_by IN (SELECT pp.id FROM public.profiles pp WHERE pp.admin_gym_id = p_gym_id)
         OR ag.gym_id IS NOT NULL
         OR ai.invited_gym_id IS NOT NULL)
    AND (p_is_active IS NULL OR sa.is_active = p_is_active)
    AND (p_search IS NULL OR p_search = ''
         OR sa.name ILIKE '%' || p_search || '%'
         OR sa.sponsor_name ILIKE '%' || p_search || '%');

  v_sql := format(
    'SELECT jsonb_agg(row_to_json(sub)) FROM (
      SELECT sa.id, sa.name, sa.description, sa.arena_scope, sa.scoring_model,
             sa.sponsor_name, sa.start_date, sa.end_date,
             sa.is_active, sa.is_finalized,
             sa.opt_in_type, sa.opt_in_value,
             sa.card_color, sa.card_text_color,
             sa.created_at,
             (SELECT COUNT(*) FROM public.arena_participants ap WHERE ap.arena_id = sa.id) AS participant_count
      FROM (
        SELECT DISTINCT sa2.id
        FROM public.sweat_arenas sa2
        LEFT JOIN public.arena_gyms ag ON ag.arena_id = sa2.id AND ag.gym_id = %L
        LEFT JOIN public.arena_invitations ai ON ai.arena_id = sa2.id AND ai.invited_gym_id = %L
        WHERE (sa2.created_by IN (SELECT pp.id FROM public.profiles pp WHERE pp.admin_gym_id = %L)
               OR ag.gym_id IS NOT NULL
               OR ai.invited_gym_id IS NOT NULL)
          AND (%L::boolean IS NULL OR sa2.is_active = %L::boolean)
          AND (%L IS NULL OR %L = ''''
               OR sa2.name ILIKE ''%%'' || %L || ''%%''
               OR sa2.sponsor_name ILIKE ''%%'' || %L || ''%%'')
      ) ids
      JOIN public.sweat_arenas sa ON sa.id = ids.id
      ORDER BY sa.%I %s NULLS LAST
      LIMIT %s OFFSET %s
    ) sub',
    p_gym_id, p_gym_id, p_gym_id,
    p_is_active, p_is_active,
    p_search, p_search, p_search, p_search,
    v_sort_col, v_dir,
    p_limit, v_offset
  );

  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(v_total::NUMERIC / p_limit)::INT
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_arenas(UUID,TEXT,BOOLEAN,INT,INT,TEXT,TEXT) TO authenticated;
