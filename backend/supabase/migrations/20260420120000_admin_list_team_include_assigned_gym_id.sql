-- Team list RPC used admin_gym_id only; accept_staff_invitation sets assigned_gym_id
-- (see 20240101000022_fix_accept_invitation_function.sql). Include both so invited
-- staff appear in the admin Team table.

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
  WHERE (p.admin_gym_id = p_gym_id OR p.assigned_gym_id = p_gym_id)
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
      WHERE (p.admin_gym_id = %L OR p.assigned_gym_id = %L)
        AND p.role IN (''gym_owner'', ''gym_admin'', ''receptionist'')
        AND (%L IS NULL OR %L = ''''
             OR p.username ILIKE ''%%'' || %L || ''%%''
             OR p.email ILIKE ''%%'' || %L || ''%%''
             OR p.full_name ILIKE ''%%'' || %L || ''%%'')
      ORDER BY %s %s NULLS LAST
      LIMIT %s OFFSET %s
    ) t',
    p_gym_id, p_gym_id,
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
