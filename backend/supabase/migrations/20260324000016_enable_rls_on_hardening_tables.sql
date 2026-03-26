-- Migration: 20260324000016_enable_rls_on_hardening_tables.sql
-- Description: Enable and harden RLS on newly added anti-abuse/tokenomics tables.

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokenomics_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_snapshots_daily ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Drop old policies defensively (idempotent)
-- ============================================================
DROP POLICY IF EXISTS "fraud_events_select_policy" ON public.fraud_events;
DROP POLICY IF EXISTS "fraud_events_update_policy" ON public.fraud_events;

DROP POLICY IF EXISTS "drop_limits_select_policy" ON public.drop_limits;
DROP POLICY IF EXISTS "drop_limits_write_policy" ON public.drop_limits;

DROP POLICY IF EXISTS "tokenomics_config_select_policy" ON public.tokenomics_config;
DROP POLICY IF EXISTS "tokenomics_config_write_policy" ON public.tokenomics_config;

DROP POLICY IF EXISTS "drop_limit_counters_select_policy" ON public.drop_limit_counters;

DROP POLICY IF EXISTS "economy_snapshots_select_policy" ON public.economy_snapshots_daily;

-- ============================================================
-- fraud_events
-- ============================================================
CREATE POLICY "fraud_events_select_policy"
ON public.fraud_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND fraud_events.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = fraud_events.gym_id)
      )
  )
);

CREATE POLICY "fraud_events_update_policy"
ON public.fraud_events
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND fraud_events.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = fraud_events.gym_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND fraud_events.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = fraud_events.gym_id)
      )
  )
);

-- ============================================================
-- drop_limits
-- ============================================================
CREATE POLICY "drop_limits_select_policy"
ON public.drop_limits
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND (
          drop_limits.gym_id IS NULL
          OR drop_limits.gym_id IN (SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid())
        ))
        OR (p.role = 'gym_admin' AND (
          drop_limits.gym_id IS NULL OR p.admin_gym_id = drop_limits.gym_id
        ))
      )
  )
);

CREATE POLICY "drop_limits_write_policy"
ON public.drop_limits
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND drop_limits.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = drop_limits.gym_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND drop_limits.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = drop_limits.gym_id)
      )
  )
);

-- ============================================================
-- tokenomics_config
-- ============================================================
CREATE POLICY "tokenomics_config_select_policy"
ON public.tokenomics_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND (
          tokenomics_config.gym_id IS NULL
          OR tokenomics_config.gym_id IN (SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid())
        ))
        OR (p.role = 'gym_admin' AND (
          tokenomics_config.gym_id IS NULL OR p.admin_gym_id = tokenomics_config.gym_id
        ))
      )
  )
);

CREATE POLICY "tokenomics_config_write_policy"
ON public.tokenomics_config
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND tokenomics_config.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = tokenomics_config.gym_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND tokenomics_config.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = tokenomics_config.gym_id)
      )
  )
);

-- ============================================================
-- drop_limit_counters (read-only to admins/superadmin)
-- ============================================================
CREATE POLICY "drop_limit_counters_select_policy"
ON public.drop_limit_counters
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND drop_limit_counters.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = drop_limit_counters.gym_id)
      )
  )
);

-- ============================================================
-- economy_snapshots_daily (read-only to admins/superadmin)
-- ============================================================
CREATE POLICY "economy_snapshots_select_policy"
ON public.economy_snapshots_daily
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND economy_snapshots_daily.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = economy_snapshots_daily.gym_id)
      )
  )
);
