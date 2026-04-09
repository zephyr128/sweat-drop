-- Migration: 20260409200001_mobile_read_rpcs.sql
-- Description: SECURITY DEFINER read RPCs for mobile app hot paths.
--              Bypasses RLS (373 policies, 189 with subqueries) for
--              authenticated user-scoped reads.
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- At 20k users, RLS policies with subqueries (EXISTS, is_superadmin(), etc.)
-- are evaluated per-row-considered, not per-row-returned. These RPCs do a
-- single auth.uid() check and filter directly, eliminating O(rows * policies)
-- overhead.
--
-- CHANGES:
--   - get_my_sessions(gym_id?, active_only?, since?, limit?)
--   - get_my_drops(gym_id?, types?, since?, limit?)
--   - get_my_redemptions(gym_id?, statuses?, limit?)
--   - get_my_challenges(gym_id?)
--   - get_my_checkins(gym_id?, since?, limit?)
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Switch .from('sessions').select()... to .rpc('get_my_sessions', ...)
--   - Admin Panel: No change (keeps using RLS-based queries)
--
-- BREAKING CHANGES: None (additive RPCs, old queries still work)

-- ============================================================
-- 1. get_my_sessions
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_sessions(
  p_gym_id     UUID    DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT NULL,
  p_since      TIMESTAMPTZ DEFAULT NULL,
  p_limit      INT     DEFAULT 50
)
RETURNS TABLE(
  id              UUID,
  gym_id          UUID,
  machine_id      UUID,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_seconds INT,
  drops_earned    INT,
  calories        NUMERIC,
  multiplier      NUMERIC,
  is_active       BOOLEAN,
  raw_metrics     JSONB,
  machine_name    TEXT,
  machine_type    TEXT,
  gym_name        TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.gym_id, s.machine_id, s.started_at, s.ended_at,
    s.duration_seconds, s.drops_earned, s.calories, s.multiplier,
    s.is_active, s.raw_metrics,
    m.name AS machine_name, m.type AS machine_type,
    g.name AS gym_name
  FROM public.sessions s
  LEFT JOIN public.machines m ON m.id = s.machine_id
  LEFT JOIN public.gyms g ON g.id = s.gym_id
  WHERE s.user_id = auth.uid()
    AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
    AND (p_active_only IS NULL OR s.is_active = p_active_only)
    AND (p_since IS NULL OR s.started_at >= p_since)
  ORDER BY s.started_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_sessions(UUID, BOOLEAN, TIMESTAMPTZ, INT) TO authenticated;

-- ============================================================
-- 2. get_my_drops
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_drops(
  p_gym_id  UUID     DEFAULT NULL,
  p_types   TEXT[]   DEFAULT NULL,
  p_since   TIMESTAMPTZ DEFAULT NULL,
  p_limit   INT      DEFAULT 100
)
RETURNS TABLE(
  id               UUID,
  amount           INT,
  transaction_type TEXT,
  balance_after    INT,
  description      TEXT,
  gym_id           UUID,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dt.id, dt.amount, dt.transaction_type, dt.balance_after,
    dt.description, dt.gym_id, dt.created_at
  FROM public.drops_transactions dt
  WHERE dt.user_id = auth.uid()
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id)
    AND (p_types IS NULL OR dt.transaction_type = ANY(p_types))
    AND (p_since IS NULL OR dt.created_at >= p_since)
  ORDER BY dt.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_drops(UUID, TEXT[], TIMESTAMPTZ, INT) TO authenticated;

-- ============================================================
-- 3. get_my_redemptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_redemptions(
  p_gym_id   UUID   DEFAULT NULL,
  p_statuses TEXT[] DEFAULT NULL,
  p_limit    INT    DEFAULT 50
)
RETURNS TABLE(
  id              UUID,
  reward_id       UUID,
  gym_id          UUID,
  drops_spent     INT,
  status          TEXT,
  redemption_code TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  reward_name     TEXT,
  reward_image    TEXT,
  gym_name        TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.reward_id, r.gym_id, r.drops_spent, r.status,
    r.redemption_code, r.description, r.created_at, r.confirmed_at,
    rw.name AS reward_name, rw.image_url AS reward_image,
    g.name AS gym_name
  FROM public.redemptions r
  LEFT JOIN public.rewards rw ON rw.id = r.reward_id
  LEFT JOIN public.gyms g ON g.id = r.gym_id
  WHERE r.user_id = auth.uid()
    AND (p_gym_id IS NULL OR r.gym_id = p_gym_id)
    AND (p_statuses IS NULL OR r.status = ANY(p_statuses))
  ORDER BY r.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_redemptions(UUID, TEXT[], INT) TO authenticated;

-- ============================================================
-- 4. get_my_challenges
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_challenges(
  p_gym_id UUID DEFAULT NULL
)
RETURNS TABLE(
  challenge_id      UUID,
  challenge_name    TEXT,
  challenge_type    TEXT,
  scoring_model     TEXT,
  target_drops      INT,
  streak_days       INT,
  milestone_threshold INT,
  reward_drops      INT,
  tiers             JSONB,
  start_date        DATE,
  end_date          DATE,
  badge_image_url   TEXT,
  current_value     NUMERIC,
  current_drops     INT,
  current_streak_days INT,
  is_completed      BOOLEAN,
  completed_at      TIMESTAMPTZ,
  tier_achieved     TEXT,
  drops_awarded     BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gc.id, gc.name, gc.challenge_type::TEXT, gc.scoring_model,
    gc.target_drops, gc.streak_days, gc.milestone_threshold,
    gc.reward_drops, gc.tiers, gc.start_date, gc.end_date,
    gc.badge_image_url,
    cp.current_value, cp.current_drops, cp.current_streak_days,
    cp.is_completed, cp.completed_at, cp.tier_achieved, cp.drops_awarded
  FROM public.gym_challenges gc
  LEFT JOIN public.challenge_progress cp
    ON cp.challenge_id = gc.id AND cp.user_id = auth.uid()
  WHERE gc.is_active = true
    AND (p_gym_id IS NULL OR gc.gym_id = p_gym_id)
    AND gc.start_date <= CURRENT_DATE
    AND (gc.end_date >= CURRENT_DATE OR gc.end_date IS NULL)
  ORDER BY gc.end_date ASC NULLS LAST, gc.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_challenges(UUID) TO authenticated;

-- ============================================================
-- 5. get_my_checkins
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_checkins(
  p_gym_id UUID        DEFAULT NULL,
  p_since  TIMESTAMPTZ DEFAULT NULL,
  p_limit  INT         DEFAULT 100
)
RETURNS TABLE(
  id            UUID,
  gym_id        UUID,
  checked_in_at TIMESTAMPTZ,
  drops_earned  INT,
  gps_verified  BOOLEAN,
  gym_name      TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gc.id, gc.gym_id, gc.checked_in_at, gc.drops_earned,
    gc.gps_verified, g.name AS gym_name
  FROM public.gym_checkins gc
  LEFT JOIN public.gyms g ON g.id = gc.gym_id
  WHERE gc.user_id = auth.uid()
    AND (p_gym_id IS NULL OR gc.gym_id = p_gym_id)
    AND (p_since IS NULL OR gc.checked_in_at >= p_since)
  ORDER BY gc.checked_in_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_checkins(UUID, TIMESTAMPTZ, INT) TO authenticated;
