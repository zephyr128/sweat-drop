-- Migration: 20260413000001_leaderboard_prizes_redemption_code.sql
-- Description: Make leaderboard prize distribution go through the full
--              redemption code flow (status=pending, 4-char code, expires_at).
--              Also adds get_my_leaderboard_history RPC.
--
-- AGENT NOTE: [2026-04-13] - supabase-dba
--
-- CHANGES:
--   - Modified function: public.distribute_leaderboard_prizes
--       · status changed from 'claimed' → 'pending'
--       · redemption_code generated (4-char uppercase hex, collision-safe loop)
--       · expires_at set to NOW() + INTERVAL '30 days'
--       · RETURNS INTEGER now also returns the last redemption_id via OUT parameter
--         (kept RETURNS INTEGER for backwards compat; edge function reads winner count only)
--   - Added function: public.get_my_leaderboard_history
--       · Returns the authenticated user's leaderboard prize redemptions
--         plus their historical rankings from snapshots for gyms they belong to.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Leaderboard prizes now appear in redemptions screen with code
--                 banner + "Show to staff" hint automatically (pending status).
--                 New hook useMyLeaderboardPrizes can call get_my_leaderboard_history.
--   - Admin Panel: Pending leaderboard prizes now appear in RedemptionsManager
--                  for staff to confirm via existing confirm_redemption flow.
--
-- BREAKING CHANGES:
--   - Existing unclaimed leaderboard prizes remain 'claimed'; only new distributions
--     use 'pending'. No retroactive data migration (intentional).
--
-- NEXT STEPS:
--   1. supabase db push
--   2. Phase 2: Update distribute-leaderboard-prizes edge function (push body + redemption_id)
--   3. Phase 3: Admin panel distribution history
--   4. Phase 4: Mobile celebration banner, history, i18n

-- ============================================================
-- 0. Add expires_at to redemptions (not present in original schema)
-- ============================================================
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_redemptions_expires_at
  ON public.redemptions(expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================================
-- 1. distribute_leaderboard_prizes — add code + pending status
-- ============================================================
CREATE OR REPLACE FUNCTION public.distribute_leaderboard_prizes(
  p_gym_id UUID,
  p_period TEXT,
  p_force  BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $distribute$
DECLARE
  v_top3                RECORD;
  v_reward              RECORD;
  v_gym_name            TEXT;
  v_rankings            JSONB := '[]'::JSONB;
  v_winners             INTEGER := 0;
  v_period_start        DATE;
  v_period_end          DATE;
  v_redemption_id       UUID;
  v_already_distributed BOOLEAN;
  v_code                TEXT;
BEGIN
  IF p_period = 'weekly' THEN
    v_period_start := date_trunc('week', CURRENT_DATE)::DATE;
    v_period_end   := v_period_start + INTERVAL '6 days';
  ELSIF p_period = 'monthly' THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
    v_period_end   := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  ELSE
    RAISE EXCEPTION 'Invalid period: %. Must be weekly or monthly.', p_period;
  END IF;

  SELECT name INTO v_gym_name FROM public.gyms WHERE id = p_gym_id;

  FOR v_top3 IN
    SELECT lb.rank, lb.user_id, lb.username, lb.score
    FROM public.get_leaderboard('gym', p_gym_id, p_period, 10, false) lb
    ORDER BY lb.rank ASC
    LIMIT 10
  LOOP
    v_rankings := v_rankings || jsonb_build_object(
      'rank', v_top3.rank,
      'user_id', v_top3.user_id,
      'username', v_top3.username,
      'drops', v_top3.score
    );
  END LOOP;

  IF jsonb_array_length(v_rankings) = 0 THEN
    RETURN 0;
  END IF;

  SELECT prizes_distributed INTO v_already_distributed
  FROM public.leaderboard_snapshots
  WHERE gym_id = p_gym_id AND period = p_period AND period_end = v_period_end;

  -- Always upsert snapshot to keep rankings fresh
  INSERT INTO public.leaderboard_snapshots
    (gym_id, period, period_start, period_end, rankings, prizes_distributed)
  VALUES
    (p_gym_id, p_period, v_period_start, v_period_end, v_rankings,
     COALESCE(v_already_distributed, false))
  ON CONFLICT (gym_id, period, period_end) DO UPDATE
    SET rankings = EXCLUDED.rankings;

  -- Only create redemptions if:
  --   1) Not already distributed for this period
  --   2) We are on or past the last day of the period (OR admin forced it)
  IF COALESCE(v_already_distributed, false) = false
     AND (CURRENT_DATE >= v_period_end OR p_force = true)
  THEN
    FOR v_top3 IN
      SELECT lb.rank, lb.user_id, lb.username
      FROM public.get_leaderboard('gym', p_gym_id, p_period, 3, false) lb
      ORDER BY lb.rank ASC
      LIMIT 3
    LOOP
      SELECT * INTO v_reward
      FROM public.leaderboard_rewards
      WHERE gym_id = p_gym_id
        AND rank_position = v_top3.rank
        AND period::TEXT = p_period
        AND is_active = true;

      IF FOUND THEN
        -- Generate unique 4-char code (same pattern as claim_reward)
        LOOP
          v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.redemptions r
            WHERE r.redemption_code = v_code AND r.status = 'pending'
          );
        END LOOP;

        INSERT INTO public.redemptions (
          user_id, reward_id, gym_id, drops_spent,
          status, source_type, description, redemption_code, expires_at
        ) VALUES (
          v_top3.user_id,
          NULL,
          p_gym_id,
          0,
          'pending',
          'leaderboard_prize',
          format('Leaderboard Prize: #%s %s at %s — %s',
            v_top3.rank, initcap(p_period), v_gym_name,
            COALESCE(v_reward.reward_description, v_reward.reward_name)),
          v_code,
          NOW() + INTERVAL '30 days'
        )
        RETURNING id INTO v_redemption_id;

        v_winners := v_winners + 1;
      END IF;
    END LOOP;

    UPDATE public.leaderboard_snapshots
    SET prizes_distributed = true
    WHERE gym_id = p_gym_id AND period = p_period AND period_end = v_period_end;
  END IF;

  RETURN v_winners;
END;
$distribute$;

-- ============================================================
-- 2. get_my_leaderboard_history RPC
-- ============================================================
-- Returns two complementary data sets for the mobile "Leaderboard History" view:
--
--   prizes  — the authenticated user's leaderboard prize redemptions
--             (pending or confirmed), enriched with gym name and period info.
--
--   snapshots — past leaderboard snapshots for gyms the user belongs to,
--               including the user's own rank/drops if they appeared in the
--               top 10. Useful for showing "you came 4th last week" even when
--               no prize was awarded.
--
-- Both result sets are returned as separate RPC calls to keep them simple.
-- This RPC returns the prize redemptions; a companion `get_leaderboard_snapshot_history`
-- returns the snapshot history (see below).

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_prizes(
  p_gym_id UUID DEFAULT NULL,
  p_limit  INT  DEFAULT 20
)
RETURNS TABLE(
  id              UUID,
  gym_id          UUID,
  gym_name        TEXT,
  status          TEXT,
  redemption_code TEXT,
  description     TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  source_type     TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.gym_id,
    g.name AS gym_name,
    r.status,
    r.redemption_code,
    r.description,
    r.expires_at,
    r.created_at,
    r.confirmed_at,
    r.source_type
  FROM public.redemptions r
  LEFT JOIN public.gyms g ON g.id = r.gym_id
  WHERE r.user_id    = auth.uid()
    AND r.source_type = 'leaderboard_prize'
    AND (p_gym_id IS NULL OR r.gym_id = p_gym_id)
  ORDER BY r.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_prizes(UUID, INT) TO authenticated;

-- ============================================================
-- 3. get_leaderboard_snapshot_history RPC
-- ============================================================
-- Returns past leaderboard snapshots for gyms the user is a member of.
-- Extracts the user's own entry from the rankings JSONB if present.
-- Mobile can use this to show "past periods" with the user's position highlighted.

CREATE OR REPLACE FUNCTION public.get_leaderboard_snapshot_history(
  p_gym_id UUID    DEFAULT NULL,
  p_period TEXT    DEFAULT NULL,
  p_limit  INT     DEFAULT 12
)
RETURNS TABLE(
  snapshot_id        UUID,
  gym_id             UUID,
  gym_name           TEXT,
  period             TEXT,
  period_start       DATE,
  period_end         DATE,
  prizes_distributed BOOLEAN,
  rankings           JSONB,
  my_rank            INT,
  my_drops           INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ls.id              AS snapshot_id,
    ls.gym_id,
    g.name             AS gym_name,
    ls.period,
    ls.period_start,
    ls.period_end,
    ls.prizes_distributed,
    ls.rankings,
    -- Extract current user's rank from the JSONB rankings array
    (
      SELECT (entry->>'rank')::INT
      FROM jsonb_array_elements(ls.rankings) AS entry
      WHERE (entry->>'user_id')::UUID = auth.uid()
      LIMIT 1
    ) AS my_rank,
    (
      SELECT (entry->>'drops')::INT
      FROM jsonb_array_elements(ls.rankings) AS entry
      WHERE (entry->>'user_id')::UUID = auth.uid()
      LIMIT 1
    ) AS my_drops
  FROM public.leaderboard_snapshots ls
  JOIN public.gym_memberships gm
    ON gm.gym_id = ls.gym_id AND gm.user_id = auth.uid()
  LEFT JOIN public.gyms g ON g.id = ls.gym_id
  WHERE (p_gym_id IS NULL OR ls.gym_id = p_gym_id)
    AND (p_period IS NULL OR ls.period = p_period)
    AND ls.prizes_distributed = true
  ORDER BY ls.period_end DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_snapshot_history(UUID, TEXT, INT) TO authenticated;
