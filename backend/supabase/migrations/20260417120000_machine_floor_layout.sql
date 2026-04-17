-- Migration: 20260417120000_machine_floor_layout.sql
-- Description: Add gym floor-layout support — floor position columns on machines
--              and a new gym_floor_config table for grid dimensions.
--
-- AGENT NOTE: 2026-04-17 — supabase-dba
--
-- CHANGES:
--   - Added columns to public.machines:
--       floor_row    SMALLINT (nullable — NULL means unplaced)
--       floor_col    SMALLINT (nullable — NULL means unplaced)
--       floor_rotation SMALLINT NOT NULL DEFAULT 0  (0/90/180/270 degrees, for future UI)
--   - Added unique partial index: machines_floor_cell_unique
--       (gym_id, floor_row, floor_col) WHERE floor_row IS NOT NULL AND floor_col IS NOT NULL
--       Prevents two machines occupying the same cell in the same gym.
--   - Added table: public.gym_floor_config
--       Stores per-gym grid dimensions (rows × cols). One row per gym.
--   - RLS on gym_floor_config mirrors public.machines policies:
--       SELECT  — any authenticated user (staff can see)
--       ALL     — gym_admin for their own gym, superadmin for all
--
-- IMPACT ON FRONTEND:
--   - Admin Panel: new server actions + MachineFloorLayout component (admin-coder — see plan)
--   - Mobile App: none in v1 (floor view is admin-only for now)
--
-- BREAKING CHANGES:
--   - None. New columns are nullable; existing queries are unaffected.
--
-- NEXT STEPS:
--   1. Run: supabase db push
--   2. Run: supabase gen types typescript --local > backend/types/database.types.ts
--   3. Update CHANGELOG.md

-- ============================================================
-- 1. Add floor-position columns to machines
-- ============================================================

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS floor_row      SMALLINT,
  ADD COLUMN IF NOT EXISTS floor_col      SMALLINT,
  ADD COLUMN IF NOT EXISTS floor_rotation SMALLINT NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Unique partial index — one machine per cell per gym
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS machines_floor_cell_unique
  ON public.machines (gym_id, floor_row, floor_col)
  WHERE floor_row IS NOT NULL
    AND floor_col IS NOT NULL;

-- ============================================================
-- 3. gym_floor_config — grid dimensions per gym
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gym_floor_config (
  gym_id     UUID        PRIMARY KEY REFERENCES public.gyms (id) ON DELETE CASCADE,
  rows       SMALLINT    NOT NULL DEFAULT 12,
  cols       SMALLINT    NOT NULL DEFAULT 8,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. RLS on gym_floor_config
-- ============================================================

ALTER TABLE public.gym_floor_config ENABLE ROW LEVEL SECURITY;

-- Any authenticated user (gym staff, receptionist) can read the config
-- so the read-only layout view works without elevated roles.
CREATE POLICY "Authenticated users can view gym floor config"
  ON public.gym_floor_config
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- gym_admin can manage the config for their own gym only
CREATE POLICY "Gym admins can manage their gym floor config"
  ON public.gym_floor_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id          = auth.uid()
        AND profiles.role        = 'gym_admin'
        AND profiles.admin_gym_id = gym_floor_config.gym_id
    )
  );

-- superadmin can manage all gyms
CREATE POLICY "Superadmins can manage all gym floor configs"
  ON public.gym_floor_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id   = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );
