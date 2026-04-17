-- Migration: 20260418000001_verification_gate_and_fulfillment.sql
-- Description: Verification gate for leaderboard & arena prizes + prize fulfillment columns.
--
-- AGENT NOTE: 2026-04-18 — supabase-dba
-- Implements Phase 1 of exec_verification_gate_fulfillment_v1.md
--
-- CHANGES:
--   1. Helper fn:  public.is_member_verified(p_user_id, p_gym_id) → BOOLEAN
--   2. Columns:    redemptions.fulfilled_at / fulfilled_by / fulfillment_notes
--                  + index idx_redemptions_fulfilled_at
--   3. Patched:    public.distribute_leaderboard_prizes
--                  status = 'pending_verification' when unverified, 'pending' when verified
--   4. Patched:    public.finalize_arena
--                  (a) membership-aware gym fallback chain (§7.2 of parent plan)
--                  (b) same verification-aware status
--   5. Patched:    public.confirm_redemption
--                  (a) rejects pending_verification rows → VERIFICATION_REQUIRED
--                  (b) live re-check at confirm time even for pending rows
--   6. Trigger:    promote_pending_verification_redemptions
--                  auto-promotes pending_verification → pending when is_verified flips true
--   7. New RPC:    public.mark_redemption_fulfilled — admin panel "Mark received" action
--   8. New RPC:    public.get_arena_fulfillment_manifest — fulfillment view data
--
-- IMPACT ON FRONTEND:
--   - Mobile App:   render pending_verification cards differently (mobile-coder — Phase 3)
--   - Admin Panel:  RedemptionsManager new badge, Fulfillment view (admin-coder — Phase 4)
--   - Edge Fns:     branch push copy on status (edge-function-agent — Phase 2)
--
-- BREAKING CHANGES:
--   - confirm_redemption now rejects pending_verification rows (intentional gate)
--   - confirm_redemption now re-checks live verification on pending rows (intentional §7.4)
--   Both behaviours are consistent with existing claim_reward() gate.
--
-- NEXT STEPS:
--   1. supabase gen types typescript --linked > backend/types/database.types.ts
--   2. Phase 2: edge function push-copy branching
--   3. Phase 3: mobile pending_verification card UI
--   4. Phase 4: admin fulfillment view

BEGIN;

-- ============================================================
-- 1. Helper: is_member_verified
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_member_verified(
  p_user_id UUID,
  p_gym_id  UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gym_member_identities
    WHERE user_id   = p_user_id
      AND gym_id    = p_gym_id
      AND is_verified = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_member_verified(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- 2. Fulfillment columns on redemptions
-- ============================================================

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS fulfilled_at        TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS fulfilled_by        UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_notes   TEXT        NULL;

CREATE INDEX IF NOT EXISTS idx_redemptions_fulfilled_at
  ON public.redemptions (fulfilled_at)
  WHERE fulfilled_at IS NOT NULL;

-- ============================================================
-- 3. Patch distribute_leaderboard_prizes
--    Only change: status CASE expression based on is_member_verified()
--    Everything else preserved verbatim from 20260413000006.
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
  v_status              TEXT;
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
      'rank',    v_top3.rank,
      'user_id', v_top3.user_id,
      'username', v_top3.username,
      'drops',   v_top3.score
    );
  END LOOP;

  IF jsonb_array_length(v_rankings) = 0 THEN
    RETURN 0;
  END IF;

  SELECT prizes_distributed INTO v_already_distributed
  FROM public.leaderboard_snapshots
  WHERE gym_id = p_gym_id AND period = p_period AND period_end = v_period_end;

  INSERT INTO public.leaderboard_snapshots
    (gym_id, period, period_start, period_end, rankings, prizes_distributed)
  VALUES
    (p_gym_id, p_period, v_period_start, v_period_end, v_rankings,
     COALESCE(v_already_distributed, false))
  ON CONFLICT (gym_id, period, period_end) DO UPDATE
    SET rankings = EXCLUDED.rankings;

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
      WHERE gym_id         = p_gym_id
        AND rank_position  = v_top3.rank
        AND period::TEXT   = p_period
        AND is_active      = true;

      IF FOUND THEN
        -- Generate unique 4-char code (same logic as before)
        LOOP
          v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.redemptions r
            WHERE r.redemption_code = v_code AND r.status = 'pending'
          );
        END LOOP;

        -- Verification gate: set status based on member verification
        v_status := CASE
          WHEN public.is_member_verified(v_top3.user_id, p_gym_id) THEN 'pending'
          ELSE 'pending_verification'
        END;

        INSERT INTO public.redemptions (
          user_id, reward_id, gym_id, drops_spent,
          status, source_type, description, redemption_code, expires_at
        ) VALUES (
          v_top3.user_id,
          NULL,
          p_gym_id,
          0,
          v_status,
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
-- 4. Patch finalize_arena
--    Changes:
--      (a) membership-aware gym fallback chain (§7.2 of parent plan)
--      (b) verification-aware status on redemption INSERT
--    Everything else preserved verbatim from 20260311000001.
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_arena(p_arena_id UUID)
RETURNS TABLE(winners_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arena         RECORD;
  v_winner        RECORD;
  v_prize         JSONB;
  v_redemption_id UUID;
  v_winner_count  INTEGER := 0;
  v_rank          INTEGER;
  v_user_gym_id   UUID;
  v_status        TEXT;
BEGIN
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arena not found: %', p_arena_id;
  END IF;

  IF v_arena.is_finalized THEN
    RAISE EXCEPTION 'Arena already finalized: %', p_arena_id;
  END IF;

  IF v_arena.end_date >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Arena has not ended yet. End date: %', v_arena.end_date;
  END IF;

  v_rank := 0;
  FOR v_winner IN
    SELECT
      ap.user_id,
      ap.gym_id,
      ap.current_score,
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC) AS rank
    FROM public.arena_participants ap
    JOIN public.profiles p ON p.id = ap.user_id
    WHERE ap.arena_id = p_arena_id
      AND ap.current_score > 0
    ORDER BY ap.current_score DESC, p.username ASC
  LOOP
    v_rank := v_rank + 1;

    -- ── Gym resolution (§7.2 membership-aware fallback chain) ─────────────
    -- Step 1: participant's opt-in gym (set at Join time, correct 99% of the time)
    v_user_gym_id := v_winner.gym_id;

    -- Step 2: home_gym_id — only valid if it is in this arena AND user is a member there
    IF v_user_gym_id IS NULL THEN
      SELECT p.home_gym_id INTO v_user_gym_id
      FROM public.profiles p
      JOIN public.arena_gyms ag
        ON ag.arena_id = p_arena_id AND ag.gym_id = p.home_gym_id
      JOIN public.gym_memberships gm
        ON gm.gym_id = p.home_gym_id AND gm.user_id = v_winner.user_id
      WHERE p.id = v_winner.user_id;
    END IF;

    -- Step 3: any arena gym where the user holds a membership (oldest first → deterministic)
    IF v_user_gym_id IS NULL THEN
      SELECT ag.gym_id INTO v_user_gym_id
      FROM public.arena_gyms ag
      JOIN public.gym_memberships gm
        ON gm.gym_id = ag.gym_id AND gm.user_id = v_winner.user_id
      WHERE ag.arena_id = p_arena_id
      ORDER BY gm.created_at ASC
      LIMIT 1;
    END IF;

    -- Step 4: hard failure — user scored but has no membership anywhere in this arena
    IF v_user_gym_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot determine collection gym for user % in arena %. '
        'User has no membership in any arena gym.',
        v_winner.user_id, p_arena_id;
    END IF;
    -- ─────────────────────────────────────────────────────────────────────

    v_prize := NULL;
    IF jsonb_array_length(v_arena.prizes) > 0 THEN
      SELECT prize INTO v_prize
      FROM jsonb_array_elements(v_arena.prizes) AS prize
      WHERE (prize->>'rank')::INTEGER = v_rank
      LIMIT 1;
    END IF;

    IF v_prize IS NOT NULL THEN
      -- Verification gate: status depends on whether user is verified at that gym
      v_status := CASE
        WHEN public.is_member_verified(v_winner.user_id, v_user_gym_id) THEN 'pending'
        ELSE 'pending_verification'
      END;

      INSERT INTO public.redemptions (
        user_id, reward_id, gym_id, drops_spent,
        status, source_type, description
      )
      VALUES (
        v_winner.user_id, NULL, v_user_gym_id, 0,
        v_status,
        'arena_prize',
        format('Arena Prize: %s #%s - %s', v_arena.name, v_rank, v_prize->>'prize')
      )
      RETURNING id INTO v_redemption_id;

      INSERT INTO public.arena_results (
        arena_id, user_id, final_rank, final_score, prize_description, redemption_id
      )
      VALUES (
        p_arena_id, v_winner.user_id, v_rank, v_winner.current_score,
        v_prize->>'prize', v_redemption_id
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
        SET final_rank        = EXCLUDED.final_rank,
            final_score       = EXCLUDED.final_score,
            prize_description = EXCLUDED.prize_description,
            redemption_id     = EXCLUDED.redemption_id;

      v_winner_count := v_winner_count + 1;
    ELSE
      INSERT INTO public.arena_results (
        arena_id, user_id, final_rank, final_score, prize_description, redemption_id
      )
      VALUES (
        p_arena_id, v_winner.user_id, v_rank, v_winner.current_score, NULL, NULL
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
        SET final_rank        = EXCLUDED.final_rank,
            final_score       = EXCLUDED.final_score,
            prize_description = EXCLUDED.prize_description,
            redemption_id     = EXCLUDED.redemption_id;
    END IF;
  END LOOP;

  UPDATE public.sweat_arenas
  SET is_finalized = true,
      finalized_at = NOW(),
      updated_at   = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT v_winner_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error finalizing arena %: %', p_arena_id, SQLERRM;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.finalize_arena(UUID) IS
  'Finalizes an arena: ranks participants, creates arena_results, awards prizes. '
  'Status = pending_verification when winner is not verified at their collection gym; '
  'auto-promotes to pending when staff verifies them (trigger). '
  'Gym fallback uses membership-aware chain to prevent dead prizes (§7.2).';

GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO authenticated, service_role;

-- ============================================================
-- 5. Patch confirm_redemption
--    (a) reject pending_verification with VERIFICATION_REQUIRED
--    (b) live re-check at confirm time (§7.4 — handles revocation gap)
--    Preserves all other logic verbatim from 20240101000011.
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_redemption(
  p_redemption_id UUID,
  p_confirmed_by  UUID
)
RETURNS TABLE(
  success       BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption RECORD;
BEGIN
  SELECT * INTO v_redemption
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Redemption not found'::TEXT;
    RETURN;
  END IF;

  -- (a) Hard block: pending_verification rows cannot be confirmed until verified
  IF v_redemption.status = 'pending_verification' THEN
    RETURN QUERY SELECT false, 'VERIFICATION_REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status != 'pending' THEN
    RETURN QUERY SELECT false, format('Redemption is already %s', v_redemption.status)::TEXT;
    RETURN;
  END IF;

  -- (b) Live re-check: guard against revocation between distribution and confirm (§7.4)
  IF NOT public.is_member_verified(v_redemption.user_id, v_redemption.gym_id) THEN
    RETURN QUERY SELECT false, 'VERIFICATION_REQUIRED'::TEXT;
    RETURN;
  END IF;

  UPDATE public.redemptions
  SET status       = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = NOW(),
      updated_at   = NOW()
  WHERE id = p_redemption_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_redemption(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- 6. Auto-promote trigger on gym_member_identities
--    When is_verified flips to true, promote all pending_verification
--    redemptions for that (user, gym) pair to pending.
-- ============================================================

CREATE OR REPLACE FUNCTION public.promote_pending_verification_redemptions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Fire on INSERT or on UPDATE where is_verified was not previously true
  IF NEW.is_verified = true
     AND (TG_OP = 'INSERT' OR OLD.is_verified IS DISTINCT FROM true)
  THEN
    UPDATE public.redemptions
    SET status     = 'pending',
        updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND gym_id  = NEW.gym_id
      AND status  = 'pending_verification';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_pending_verification_redemptions
  ON public.gym_member_identities;

CREATE TRIGGER trg_promote_pending_verification_redemptions
  AFTER INSERT OR UPDATE OF is_verified
  ON public.gym_member_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_pending_verification_redemptions();

-- ============================================================
-- 7. mark_redemption_fulfilled RPC
--    Admin panel "Mark received" — staff confirms the physical prize
--    has arrived at the gym and is ready for collection.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_redemption_fulfilled(
  p_redemption_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption RECORD;
BEGIN
  SELECT * INTO v_redemption
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Redemption not found');
  END IF;

  -- Auth: caller must have gym access or be superadmin
  IF NOT public._admin_check_gym_access(v_redemption.gym_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  IF v_redemption.fulfilled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already marked as fulfilled',
      'fulfilled_at', v_redemption.fulfilled_at
    );
  END IF;

  -- Only allow fulfillment on redemptions that are in an active state
  IF v_redemption.status NOT IN ('pending', 'pending_verification') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot fulfil a redemption with status: %s', v_redemption.status)
    );
  END IF;

  UPDATE public.redemptions
  SET fulfilled_at      = NOW(),
      fulfilled_by      = auth.uid(),
      fulfillment_notes = p_notes,
      updated_at        = NOW()
  WHERE id = p_redemption_id;

  -- Return enough data for the edge function to fire the "prize ready" push
  RETURN jsonb_build_object(
    'success',        true,
    'redemption_id',  p_redemption_id,
    'fulfilled_at',   NOW(),
    'user_id',        v_redemption.user_id,
    'gym_id',         v_redemption.gym_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_redemption_fulfilled(UUID, TEXT) TO authenticated;

-- ============================================================
-- 8. get_arena_fulfillment_manifest RPC
--    Returns all prize redemptions for an arena, scoped to the
--    caller's gym access.  Superadmin sees all rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_arena_fulfillment_manifest(
  p_arena_id UUID
)
RETURNS TABLE(
  redemption_id     UUID,
  user_id           UUID,
  username          TEXT,
  full_name         TEXT,
  rank              INT,
  prize_description TEXT,
  gym_id            UUID,
  gym_name          TEXT,
  status            TEXT,
  redemption_code   TEXT,
  fulfilled_at      TIMESTAMPTZ,
  fulfilled_by      UUID,
  confirmed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID;
  v_role TEXT;
BEGIN
  v_uid := auth.uid();

  SELECT role::TEXT INTO v_role
  FROM public.profiles
  WHERE id = v_uid;

  RETURN QUERY
  SELECT
    r.id                              AS redemption_id,
    r.user_id,
    p.username::TEXT,
    p.full_name::TEXT,
    ar.final_rank::INT                AS rank,
    ar.prize_description::TEXT,
    r.gym_id,
    g.name::TEXT                      AS gym_name,
    r.status::TEXT,
    r.redemption_code::TEXT,
    r.fulfilled_at,
    r.fulfilled_by,
    r.confirmed_at,
    r.expires_at
  FROM public.arena_results ar
  JOIN public.redemptions r  ON r.id      = ar.redemption_id
  JOIN public.profiles p     ON p.id      = ar.user_id
  JOIN public.gyms g         ON g.id      = r.gym_id
  WHERE ar.arena_id = p_arena_id
    AND ar.redemption_id IS NOT NULL
    AND (
      -- Superadmin sees all gyms in this arena
      v_role = 'superadmin'
      OR
      -- Gym staff see only their own gym's rows
      public._admin_check_gym_access(r.gym_id)
    )
  ORDER BY ar.final_rank ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_arena_fulfillment_manifest(UUID) TO authenticated;

COMMIT;
