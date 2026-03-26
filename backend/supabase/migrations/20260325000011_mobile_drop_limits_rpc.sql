-- Migration: 20260325000011_mobile_drop_limits_rpc.sql
-- Description: Expose safe, user-readable drop limits for mobile under RLS.

CREATE OR REPLACE FUNCTION public.get_user_drop_limits(
  p_gym_id UUID
)
RETURNS TABLE(
  max_drops_per_session INTEGER,
  max_rewarded_sessions_per_day INTEGER,
  max_drops_per_day INTEGER,
  max_drops_per_week INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_allowed BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Allow gym members and gym staff/superadmin.
  SELECT EXISTS (
    SELECT 1
    FROM public.gym_memberships gm
    WHERE gm.user_id = v_uid
      AND gm.gym_id = p_gym_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND EXISTS (
          SELECT 1 FROM public.gyms g WHERE g.id = p_gym_id AND g.owner_id = v_uid
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = p_gym_id)
      )
  )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    GREATEST(COALESCE(tc.max_drops_per_session, 120), 1)::INTEGER,
    GREATEST(COALESCE(tc.max_rewarded_sessions_per_day, 4), 1)::INTEGER,
    GREATEST(COALESCE(tc.max_drops_per_day, 300), GREATEST(COALESCE(tc.max_drops_per_session, 120), 1))::INTEGER,
    GREATEST(COALESCE(tc.max_drops_per_week, 1500), GREATEST(COALESCE(tc.max_drops_per_day, 300), GREATEST(COALESCE(tc.max_drops_per_session, 120), 1)))::INTEGER
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = p_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_drop_limits(UUID) TO authenticated;
