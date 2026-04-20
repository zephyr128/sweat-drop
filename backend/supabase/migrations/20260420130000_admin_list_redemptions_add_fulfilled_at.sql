-- Migration: 20260420130000_admin_list_redemptions_add_fulfilled_at.sql
-- Description: Expose fulfilled_at in admin_list_redemptions RPC so the
--              Desk queue can distinguish "awaiting shipment" from "ready to collect".
--
-- AGENT NOTE: 2026-04-20 — admin-coder (reception_reward_flow plan)
--
-- CHANGES:
--   - Updated function: public.admin_list_redemptions — adds fulfilled_at to the SELECT
--   - No schema changes; fulfilled_at column already exists (migration 20260418000001)
--
-- IMPACT ON FRONTEND:
--   - Admin Panel: RedemptionRow.fulfilled_at now populated; RedemptionsList uses it
--     to render correct status badges and action buttons.
--   - Mobile App: no change
--
-- BREAKING CHANGES: None — new field appended to JSONB output only

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
             r.created_at, r.confirmed_at,
             r.fulfilled_at
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
