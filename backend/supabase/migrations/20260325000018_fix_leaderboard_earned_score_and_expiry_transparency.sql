-- Migration: 20260325000018_fix_leaderboard_earned_score_and_expiry_transparency.sql
-- Description: Fix leaderboard score semantics, harden 90-day expiry, add user transparency RPCs
--
-- AGENT NOTE: [2026-03-25] - supabase-dba
-- Reference: docs/plans/leaderboard_earned_score_and_quarterly_expiry_plan.md — Steps 1-3
--
-- CHANGES:
-- - Fix get_leaderboard() gym all_time to use earned-only score (not wallet balance)
-- - Add helper: get_user_earned_drops_gym(p_user_id, p_gym_id, p_period)
-- - Harden expire_stale_drops() to cover checkin/workout mint types + create audit trail
-- - Backfill expires_at for existing checkin/workout positive transactions
-- - Add RPC: get_user_expiring_drops(p_gym_id)
-- - Add RPC: get_user_drops_ledger_summary(p_gym_id)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Leaderboard gym all_time now reflects earned score, not wallet.
--              New RPCs available for expiry/ledger transparency.
-- - Admin Panel: Same leaderboard semantics change.
--
-- BREAKING CHANGES: None (function signatures unchanged, new RPCs added).

-- ============================================================
-- 1) HELPER: get_user_earned_drops_gym
-- ============================================================
-- Earned score = sum of positive mint transactions (session, checkin, workout, challenge)
-- for a given user+gym in a given period.

CREATE OR REPLACE FUNCTION public.get_user_earned_drops_gym(
  p_user_id  UUID,
  p_gym_id   UUID,
  p_period   TEXT DEFAULT 'all_time'
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result NUMERIC;
  v_period_start TIMESTAMPTZ;
BEGIN
  CASE p_period
    WHEN 'weekly' THEN
      v_period_start := date_trunc('week', NOW());
    WHEN 'monthly' THEN
      v_period_start := date_trunc('month', NOW());
    WHEN 'all_time' THEN
      v_period_start := NULL;
    ELSE
      v_period_start := NULL;
  END CASE;

  SELECT COALESCE(SUM(dt.amount), 0) INTO v_result
  FROM public.drops_transactions dt
  WHERE dt.user_id = p_user_id
    AND dt.gym_id = p_gym_id
    AND dt.amount > 0
    AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND (v_period_start IS NULL OR dt.created_at >= v_period_start);

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_user_earned_drops_gym(UUID, UUID, TEXT) IS
  'Returns the sum of positive mint transactions (earned drops only) for a user '
  'in a specific gym, filtered by period (weekly/monthly/all_time). '
  'Does NOT include spending, expiry, or other negative transactions.';

GRANT EXECUTE ON FUNCTION public.get_user_earned_drops_gym(UUID, UUID, TEXT) TO authenticated;

-- ============================================================
-- 2) FIX: get_leaderboard() — gym all_time uses earned score
-- ============================================================
-- Replace gm.local_drops_balance with earned-only calculation.
-- weekly/monthly for gym scope also switched to earned-based
-- (sessions + checkins sum) to be consistent.
-- Global scope unchanged (profiles.total_drops / weekly_drops / monthly_drops).

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_type          TEXT,
  p_scope_id      UUID,
  p_period        TEXT DEFAULT 'weekly',
  p_limit         INT DEFAULT 50,
  p_newcomer_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  rank            BIGINT,
  user_id         UUID,
  username        TEXT,
  avatar_url      TEXT,
  score           NUMERIC,
  score_label     TEXT,
  is_newcomer     BOOLEAN,
  streak_days     INT,
  gym_name        TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_type

  WHEN 'gym' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY sv.score_val DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      sv.score_val::NUMERIC,
      TO_CHAR(sv.score_val, 'FM999,999') || ' 💧'::TEXT,
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.profiles p
    JOIN public.gym_memberships gm ON gm.user_id = p.id AND gm.gym_id = p_scope_id
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly' THEN
          COALESCE((
            SELECT SUM(s.drops_earned)
            FROM public.sessions s
            WHERE s.user_id = p.id
              AND s.gym_id = p_scope_id
              AND s.started_at >= date_trunc('week', NOW())
          ), 0)
          + COALESCE((
            SELECT SUM(gc.drops_earned)
            FROM public.gym_checkins gc
            WHERE gc.user_id = p.id
              AND gc.gym_id = p_scope_id
              AND gc.checked_in_at >= date_trunc('week', NOW())
          ), 0)
        WHEN 'monthly' THEN
          COALESCE((
            SELECT SUM(s.drops_earned)
            FROM public.sessions s
            WHERE s.user_id = p.id
              AND s.gym_id = p_scope_id
              AND s.started_at >= date_trunc('month', NOW())
          ), 0)
          + COALESCE((
            SELECT SUM(gc.drops_earned)
            FROM public.gym_checkins gc
            WHERE gc.user_id = p.id
              AND gc.gym_id = p_scope_id
              AND gc.checked_in_at >= date_trunc('month', NOW())
          ), 0)
        ELSE
          -- all_time: use earned-only score from drops_transactions
          COALESCE((
            SELECT SUM(dt.amount)
            FROM public.drops_transactions dt
            WHERE dt.user_id = p.id
              AND dt.gym_id = p_scope_id
              AND dt.amount > 0
              AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
          ), 0)
      END AS score_val
    ) sv
    WHERE p.role = 'user'
      AND (NOT p_newcomer_only OR p.is_newcomer = true)
      AND sv.score_val > 0
    ORDER BY sv.score_val DESC, p.username ASC
    LIMIT p_limit;

  WHEN 'global' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY sv.score_val DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      sv.score_val::NUMERIC,
      TO_CHAR(sv.score_val, 'FM999,999') || ' 💧'::TEXT,
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.profiles p
    CROSS JOIN LATERAL (
      SELECT CASE p_period
        WHEN 'weekly'  THEN p.weekly_drops
        WHEN 'monthly' THEN p.monthly_drops
        ELSE p.total_drops
      END AS score_val
    ) sv
    WHERE p.role = 'user'
      AND (NOT p_newcomer_only OR p.is_newcomer = true)
      AND sv.score_val > 0
    ORDER BY sv.score_val DESC, p.username ASC
    LIMIT p_limit;

  WHEN 'challenge' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY cp.current_value DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      cp.current_value::NUMERIC,
      CASE gc.scoring_model
        WHEN 'total_drops'  THEN TO_CHAR(cp.current_value, 'FM999,999') || ' 💧'
        WHEN 'distance_km'  THEN TO_CHAR(cp.current_value, 'FM999,999.0') || ' km'
        WHEN 'days_visited'  THEN cp.current_value::TEXT || ' days'
        WHEN 'streak_days'   THEN '🔥 ' || cp.current_value::TEXT || ' days'
        ELSE cp.current_value::TEXT
      END::TEXT,
      p.is_newcomer,
      p.streak_days,
      NULL::TEXT
    FROM public.challenge_progress cp
    JOIN public.profiles p ON p.id = cp.user_id
    JOIN public.gym_challenges gc ON gc.id = cp.challenge_id
    WHERE cp.challenge_id = p_scope_id
      AND cp.current_value > 0
    ORDER BY cp.current_value DESC, p.username ASC
    LIMIT p_limit;

  WHEN 'arena' THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC)::BIGINT,
      p.id,
      p.username::TEXT,
      p.avatar_url::TEXT,
      ap.current_score::NUMERIC,
      CASE sa.scoring_model
        WHEN 'total_drops'   THEN TO_CHAR(ap.current_score::INTEGER, 'FM999,999') || ' 💧'
        WHEN 'days_visited'  THEN ap.current_score::INTEGER::TEXT || ' days'
        WHEN 'variety_score' THEN ap.current_score::INTEGER::TEXT || ' machines'
        WHEN 'streak_days'   THEN '🔥 ' || ap.current_score::INTEGER::TEXT || ' days'
        ELSE ap.current_score::TEXT
      END::TEXT,
      p.is_newcomer,
      p.streak_days,
      g.name::TEXT
    FROM public.arena_participants ap
    JOIN public.profiles p ON p.id = ap.user_id
    JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
    LEFT JOIN public.gyms g ON g.id = ap.gym_id
    WHERE ap.arena_id = p_scope_id
      AND ap.current_score > 0
    ORDER BY ap.current_score DESC, p.username ASC
    LIMIT p_limit;

  ELSE
    RETURN;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) IS
  'Generic leaderboard RPC. Supports gym, global, challenge, and arena types. '
  'Gym all_time uses earned-only score (not wallet balance). '
  'Replaces get_local_leaderboard() and get_global_leaderboard().';

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;

-- ============================================================
-- 3) BACKFILL: Set expires_at for positive checkin/workout transactions
-- ============================================================
-- Policy: all positive mint transactions expire 90 days after creation.

UPDATE public.drops_transactions
SET expires_at = created_at + INTERVAL '90 days'
WHERE amount > 0
  AND expires_at IS NULL
  AND transaction_type IN ('session', 'checkin', 'workout');

-- ============================================================
-- 4) HARDEN: expire_stale_drops() — cover all mint types + audit trail
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_drops()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count    INTEGER := 0;
  v_expired  RECORD;
BEGIN
  -- Process expired positive mint transactions (session, checkin, workout)
  -- within the last 25-hour window to avoid double-processing.
  FOR v_expired IN
    SELECT
      dt.id AS tx_id,
      dt.user_id,
      dt.gym_id,
      dt.amount,
      dt.transaction_type AS source_type,
      dt.description AS source_description,
      dt.expires_at
    FROM public.drops_transactions dt
    WHERE dt.expires_at IS NOT NULL
      AND dt.expires_at < NOW()
      AND dt.expires_at > NOW() - INTERVAL '25 hours'
      AND dt.amount > 0
      AND dt.transaction_type IN ('session', 'checkin', 'workout')
  LOOP
    -- 4a. Deduct from profiles.available_drops (global wallet)
    UPDATE public.profiles
    SET available_drops = GREATEST(0, available_drops - v_expired.amount)
    WHERE id = v_expired.user_id;

    -- 4b. Deduct from gym_memberships.local_drops_balance (gym wallet)
    IF v_expired.gym_id IS NOT NULL THEN
      UPDATE public.gym_memberships
      SET local_drops_balance = GREATEST(0, local_drops_balance - v_expired.amount),
          updated_at = NOW()
      WHERE user_id = v_expired.user_id
        AND gym_id = v_expired.gym_id;
    END IF;

    -- 4c. Insert audit trail transaction
    INSERT INTO public.drops_transactions (
      user_id, amount, transaction_type, reference_id,
      description, gym_id, balance_after
    ) VALUES (
      v_expired.user_id,
      -v_expired.amount,
      'expiry_deduction',
      v_expired.tx_id,
      'Expired ' || v_expired.amount || ' drops from '
        || v_expired.source_type || ' ('
        || COALESCE(LEFT(v_expired.source_description, 60), 'n/a') || ')',
      v_expired.gym_id,
      GREATEST(0, (SELECT available_drops FROM public.profiles WHERE id = v_expired.user_id))
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.expire_stale_drops() IS
  'Deducts expired drops from profiles.available_drops and gym_memberships.local_drops_balance. '
  'Covers session, checkin, and workout mint types. Creates expiry_deduction audit trail '
  'transactions with reference to original mint transaction. Processes recent 25h window.';

-- ============================================================
-- 5) RPC: get_user_expiring_drops(p_gym_id)
-- ============================================================
-- Returns upcoming expiry buckets for the authenticated user.
-- If p_gym_id is NULL, returns global (all gyms) expiry data.

CREATE OR REPLACE FUNCTION public.get_user_expiring_drops(
  p_gym_id UUID DEFAULT NULL
)
RETURNS TABLE(
  expiring_in_7d  INTEGER,
  expiring_in_30d INTEGER,
  next_expiry_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
  v_7d  INTEGER;
  v_30d INTEGER;
  v_next TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Expiring within 7 days
  SELECT COALESCE(SUM(dt.amount), 0) INTO v_7d
  FROM public.drops_transactions dt
  WHERE dt.user_id = v_uid
    AND dt.amount > 0
    AND dt.expires_at IS NOT NULL
    AND dt.expires_at > NOW()
    AND dt.expires_at <= NOW() + INTERVAL '7 days'
    AND dt.transaction_type IN ('session', 'checkin', 'workout')
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id);

  -- Expiring within 30 days
  SELECT COALESCE(SUM(dt.amount), 0) INTO v_30d
  FROM public.drops_transactions dt
  WHERE dt.user_id = v_uid
    AND dt.amount > 0
    AND dt.expires_at IS NOT NULL
    AND dt.expires_at > NOW()
    AND dt.expires_at <= NOW() + INTERVAL '30 days'
    AND dt.transaction_type IN ('session', 'checkin', 'workout')
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id);

  -- Next expiry date
  SELECT MIN(dt.expires_at) INTO v_next
  FROM public.drops_transactions dt
  WHERE dt.user_id = v_uid
    AND dt.amount > 0
    AND dt.expires_at IS NOT NULL
    AND dt.expires_at > NOW()
    AND dt.transaction_type IN ('session', 'checkin', 'workout')
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id);

  RETURN QUERY SELECT v_7d, v_30d, v_next;
END;
$function$;

COMMENT ON FUNCTION public.get_user_expiring_drops(UUID) IS
  'Returns upcoming drops expiry for the authenticated user: '
  'amounts expiring in 7d and 30d, plus next expiry date. '
  'Optionally scoped to a gym.';

GRANT EXECUTE ON FUNCTION public.get_user_expiring_drops(UUID) TO authenticated;

-- ============================================================
-- 6) RPC: get_user_drops_ledger_summary(p_gym_id)
-- ============================================================
-- Returns wallet balance + earned score breakdown for the authenticated user.

CREATE OR REPLACE FUNCTION public.get_user_drops_ledger_summary(
  p_gym_id UUID DEFAULT NULL
)
RETURNS TABLE(
  wallet_balance         INTEGER,
  earned_score_weekly    INTEGER,
  earned_score_monthly   INTEGER,
  earned_score_all_time  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_wallet       INTEGER;
  v_weekly       INTEGER;
  v_monthly      INTEGER;
  v_all_time     INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_gym_id IS NOT NULL THEN
    -- Gym-scoped: wallet from gym_memberships, earned from transactions
    SELECT COALESCE(gm.local_drops_balance, 0) INTO v_wallet
    FROM public.gym_memberships gm
    WHERE gm.user_id = v_uid AND gm.gym_id = p_gym_id;

    v_wallet := COALESCE(v_wallet, 0);
  ELSE
    -- Global: wallet from profiles
    SELECT COALESCE(p.available_drops, 0) INTO v_wallet
    FROM public.profiles p
    WHERE p.id = v_uid;

    v_wallet := COALESCE(v_wallet, 0);
  END IF;

  -- Earned weekly
  SELECT COALESCE(SUM(dt.amount), 0)::INTEGER INTO v_weekly
  FROM public.drops_transactions dt
  WHERE dt.user_id = v_uid
    AND dt.amount > 0
    AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND dt.created_at >= date_trunc('week', NOW())
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id);

  -- Earned monthly
  SELECT COALESCE(SUM(dt.amount), 0)::INTEGER INTO v_monthly
  FROM public.drops_transactions dt
  WHERE dt.user_id = v_uid
    AND dt.amount > 0
    AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND dt.created_at >= date_trunc('month', NOW())
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id);

  -- Earned all_time
  SELECT COALESCE(SUM(dt.amount), 0)::INTEGER INTO v_all_time
  FROM public.drops_transactions dt
  WHERE dt.user_id = v_uid
    AND dt.amount > 0
    AND dt.transaction_type IN ('session', 'checkin', 'workout', 'challenge')
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id);

  RETURN QUERY SELECT v_wallet, v_weekly, v_monthly, v_all_time;
END;
$function$;

COMMENT ON FUNCTION public.get_user_drops_ledger_summary(UUID) IS
  'Returns wallet balance (spendable) and earned score breakdown (weekly/monthly/all_time) '
  'for the authenticated user. Optionally scoped to a gym. '
  'Earned score is never reduced by spending or expiry.';

GRANT EXECUTE ON FUNCTION public.get_user_drops_ledger_summary(UUID) TO authenticated;
