-- Extend get_my_redemptions to include fields the mobile redemptions screen
-- needs but that were missing from the original RPC:
--   fulfilled_at  — used by getRedemptionDisplayState() for pending_not_fulfilled vs pending_ready
--   source_type   — used to detect leaderboard_prize / arena_prize cards
--   expires_at    — used by getRedemptionDisplayState() for the 'expired' state
--   reward_type   — used to pick the icon (coffee / protein / discount / merch / gift)
--
-- Adding p_offset so the caller can page without a high p_limit.
-- BREAKING: return shape is additive — no existing columns removed.

CREATE OR REPLACE FUNCTION public.get_my_redemptions(
  p_gym_id   UUID    DEFAULT NULL,
  p_statuses TEXT[]  DEFAULT NULL,
  p_limit    INT     DEFAULT 50,
  p_offset   INT     DEFAULT 0
)
RETURNS TABLE(
  id              UUID,
  reward_id       UUID,
  gym_id          UUID,
  drops_spent     INT,
  status          TEXT,
  redemption_code TEXT,
  description     TEXT,
  source_type     TEXT,
  expires_at      TIMESTAMPTZ,
  fulfilled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  reward_name     TEXT,
  reward_image    TEXT,
  reward_type     TEXT,
  gym_name        TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.reward_id, r.gym_id, r.drops_spent, r.status,
    r.redemption_code, r.description, r.source_type, r.expires_at,
    r.fulfilled_at, r.created_at, r.confirmed_at,
    rw.name        AS reward_name,
    rw.image_url   AS reward_image,
    rw.reward_type AS reward_type,
    g.name         AS gym_name
  FROM public.redemptions r
  LEFT JOIN public.rewards rw ON rw.id = r.reward_id
  LEFT JOIN public.gyms    g  ON g.id  = r.gym_id
  WHERE r.user_id = auth.uid()
    AND (p_gym_id   IS NULL OR r.gym_id   = p_gym_id)
    AND (p_statuses IS NULL OR r.status   = ANY(p_statuses))
  ORDER BY r.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- Revoke old signature (3 params) and grant the new one (4 params).
-- The old 3-param signature still exists until Postgres resolves by argument
-- count; drop it to avoid ambiguity.
DROP FUNCTION IF EXISTS public.get_my_redemptions(UUID, TEXT[], INT);

GRANT EXECUTE ON FUNCTION public.get_my_redemptions(UUID, TEXT[], INT, INT) TO authenticated;
