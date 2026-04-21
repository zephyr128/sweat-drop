-- Migration: 20260421195628_machines_is_demo_machine_and_rpc.sql
-- Description: Add machines.is_demo_machine and get_my_demo_machine() RPC for server-gated simulator flow.
--
-- AGENT NOTE: [2026-04-21] - supabase-dba
--
-- CHANGES:
-- - Added column: public.machines.is_demo_machine (BOOLEAN NOT NULL DEFAULT false)
-- - Added index: idx_machines_is_demo_machine (partial index for true values)
-- - Added RPC: public.get_my_demo_machine()
--
-- IMPACT ON FRONTEND:
-- - Mobile App: can request one eligible demo machine only for demo users.
-- - Admin Panel: can mark demo-capable machines via is_demo_machine toggle.
--
-- BREAKING CHANGES:
-- - None (additive)

SET search_path TO public;

-- -----------------------------------------------------------------------------
-- machines.is_demo_machine
-- Marks a machine as allowed for demo/simulator workouts.
-- -----------------------------------------------------------------------------
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS is_demo_machine BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.machines.is_demo_machine IS
  'When true, this machine is exposed to is_demo users via get_my_demo_machine() RPC for simulator workouts. Configure through admin panel; never expose to regular users.';

CREATE INDEX IF NOT EXISTS idx_machines_is_demo_machine
  ON public.machines(is_demo_machine)
  WHERE is_demo_machine = true;

-- -----------------------------------------------------------------------------
-- RPC: get_my_demo_machine()
-- Returns one demo machine for the caller's home gym when caller is_demo=true.
-- If user is not demo or no eligible machine exists, returns 0 rows.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_demo_machine();

CREATE OR REPLACE FUNCTION public.get_my_demo_machine()
RETURNS TABLE (
  machine_id UUID,
  qr_uuid UUID,
  machine_name TEXT,
  machine_type TEXT,
  gym_id UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id AS machine_id,
    m.qr_uuid,
    m.name AS machine_name,
    m.type::text AS machine_type,
    m.gym_id
  FROM public.machines m
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE p.is_demo = true
    AND m.is_demo_machine = true
    AND COALESCE(m.is_active, true) = true
    AND (p.home_gym_id IS NULL OR m.gym_id = p.home_gym_id)
  ORDER BY (m.gym_id = p.home_gym_id) DESC, m.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_demo_machine() TO authenticated;
