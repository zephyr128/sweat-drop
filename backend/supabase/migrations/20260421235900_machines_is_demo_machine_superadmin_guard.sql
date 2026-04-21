-- Migration: 20260421235900_machines_is_demo_machine_superadmin_guard.sql
-- Description: Enforce superadmin-only mutation for machines.is_demo_machine.
--
-- AGENT NOTE: [2026-04-21] - reviewer-followup
--
-- CHANGES:
-- - Added trigger function: public.enforce_machines_is_demo_machine_superadmin_only()
-- - Added trigger: trg_machines_guard_is_demo_machine_update on public.machines
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: non-superadmin updates that attempt to change is_demo_machine are blocked.
-- - Mobile App: no direct impact.
--
-- BREAKING CHANGES:
-- - None (additive hardening, existing non-demo machine updates remain allowed).

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.enforce_machines_is_demo_machine_superadmin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Service-role/postgres contexts may not carry auth.uid(); allow those flows.
  IF NEW.is_demo_machine IS DISTINCT FROM OLD.is_demo_machine
     AND auth.uid() IS NOT NULL
     AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmin can modify machines.is_demo_machine';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_machines_guard_is_demo_machine_update ON public.machines;

CREATE TRIGGER trg_machines_guard_is_demo_machine_update
  BEFORE UPDATE ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_machines_is_demo_machine_superadmin_only();
