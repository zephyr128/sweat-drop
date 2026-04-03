-- Fix leaderboard prize distribution:
--   1. Current cron only runs weekly (no body → defaults to 'weekly').
--      Add a separate monthly cron on the 1st of each month at 00:30 UTC.
--   2. Add admin-callable RPC distribute_leaderboard_prizes_now() so gym
--      owners can manually trigger distribution from the admin panel.
--
-- IMPACT:
--   - Monthly leaderboard prizes will now be distributed automatically.
--   - Admin panel gains a "Distribute Now" button.
--
-- ROLLBACK:
--   SELECT cron.unschedule('leaderboard-prize-distribution-monthly');
--   DROP FUNCTION IF EXISTS public.distribute_leaderboard_prizes_now(UUID, TEXT);

-- ═══════════════════════════════════════════════════════════════
-- 1) Add monthly cron schedule
--    Runs at 23:50 UTC on 28th-31st of every month.
--    get_leaderboard uses date_trunc('month', NOW()) so we must
--    run BEFORE the month rolls over (not on the 1st).
--    The duplicate guard in distribute_leaderboard_prizes prevents
--    repeat prize creation when it fires on multiple days.
-- ═══════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'leaderboard-prize-distribution-monthly',
  '50 23 28-31 * *',
  $$SELECT public._invoke_edge_function('distribute-leaderboard-prizes', '{"period":"monthly"}'::jsonb);$$
);

-- ═══════════════════════════════════════════════════════════════
-- 2) Admin-callable RPC: distribute prizes for a single gym on demand
--    Requires gym_owner / gym_admin / superadmin role.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.distribute_leaderboard_prizes_now(
  p_gym_id UUID,
  p_period TEXT DEFAULT 'weekly'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_winners INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Authorization: superadmin, gym_owner of this gym, or gym_admin assigned to it
  IF NOT public.is_superadmin(v_uid) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.gyms g WHERE g.id = p_gym_id AND g.owner_id = v_uid
    ) AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid AND p.role IN ('gym_owner', 'gym_admin')
        AND (p.admin_gym_id = p_gym_id OR p.assigned_gym_id = p_gym_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
  END IF;

  IF p_period NOT IN ('weekly', 'monthly') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_period');
  END IF;

  -- Check that the gym has active rewards configured
  IF NOT EXISTS (
    SELECT 1 FROM public.leaderboard_rewards
    WHERE gym_id = p_gym_id AND period::TEXT = p_period AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_rewards_configured',
      'message', 'Configure prizes for ' || p_period || ' period first.');
  END IF;

  -- Call the existing distribution function with force=true (bypasses period-end check)
  v_winners := public.distribute_leaderboard_prizes(p_gym_id, p_period, true);

  RETURN jsonb_build_object(
    'success', true,
    'winners', v_winners,
    'period', p_period
  );
END;
$$;

COMMENT ON FUNCTION public.distribute_leaderboard_prizes_now(UUID, TEXT) IS
  'Admin-callable wrapper around distribute_leaderboard_prizes. Use from admin panel "Distribute Now" button.';

GRANT EXECUTE ON FUNCTION public.distribute_leaderboard_prizes_now(UUID, TEXT) TO authenticated;
