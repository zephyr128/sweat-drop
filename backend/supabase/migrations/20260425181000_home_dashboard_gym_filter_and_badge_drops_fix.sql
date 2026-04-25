-- Migration: 20260425181000_home_dashboard_gym_filter_and_badge_drops_fix.sql
-- Description: Fix daily goal gym scoping and stop global achievements from minting spendable drops
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- CHANGES:
-- - Patched get_home_dashboard(): week_drops now filters by dt.gym_id = p_gym_id when provided
-- - Patched evaluate_badges(): no longer adds reward_drops to profiles or drops_transactions
-- - Data fix: set global_achievements.reward_drops = 0 for all active achievements
--
-- ECONOMY INVARIANT (MVP):
--   Spendable drops are gym-local only (gym_memberships.local_drops_balance).
--   Global achievements award badges/progress (user_badges) but do NOT mint
--   spendable currency. A global store with global balance is a future product
--   decision, not implemented in this batch.
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Daily goal progress now correctly reflects only the active gym's drops.
--              Profile total_drops will no longer inflate from achievement rewards.
-- - Admin Panel: No change
--
-- BREAKING CHANGES:
-- - Global achievements no longer award bonus drops. Existing badge drops already
--   awarded are not rolled back (they were never gym-spendable anyway).

-- ============================================================
-- 1. Patch get_home_dashboard: filter week_drops by gym
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_home_dashboard(
  p_gym_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_week_start_utc TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  v_week_start_utc := (
    date_trunc('week', (now() AT TIME ZONE 'Europe/Belgrade'))::timestamp
    AT TIME ZONE 'Europe/Belgrade'
  );

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'streak_days',     p.streak_days,
        'last_visit_date', p.last_visit_date
      )
      FROM public.profiles p
      WHERE p.id = v_user_id
    ),

    'week_drops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'amount',           dt.amount,
          'transaction_type', dt.transaction_type,
          'created_at',       dt.created_at
        )
        ORDER BY dt.created_at DESC
      )
      FROM public.drops_transactions dt
      WHERE dt.user_id = v_user_id
        AND dt.created_at >= v_week_start_utc
        AND dt.amount > 0
        AND dt.transaction_type = ANY (
          ARRAY['session','checkin','challenge','bonus','arena','referral_reward']
        )
        AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id)
    ), '[]'::jsonb),

    'last_session', (
      SELECT jsonb_build_object(
        'ended_at',         s.ended_at,
        'duration_seconds', s.duration_seconds,
        'drops_earned',     s.drops_earned
      )
      FROM public.sessions s
      WHERE s.user_id = v_user_id
        AND s.is_active = false
        AND s.ended_at IS NOT NULL
      ORDER BY s.ended_at DESC
      LIMIT 1
    ),

    'local_drops_balance', CASE
      WHEN p_gym_id IS NOT NULL THEN (
        SELECT gm.local_drops_balance
        FROM public.gym_memberships gm
        WHERE gm.user_id = v_user_id AND gm.gym_id = p_gym_id
        LIMIT 1
      )
      ELSE NULL
    END,

    'rewards', CASE
      WHEN p_gym_id IS NOT NULL THEN COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               r.id,
            'name',             r.name,
            'price_drops',      r.price_drops,
            'image_url',        r.image_url,
            'reward_type',      r.reward_type,
            'redemption_limit', r.redemption_limit,
            'stock',            r.stock
          )
          ORDER BY r.price_drops ASC
        )
        FROM (
          SELECT rw.id, rw.name, rw.price_drops, rw.image_url,
                 rw.reward_type, rw.redemption_limit, rw.stock
          FROM public.rewards rw
          WHERE rw.gym_id = p_gym_id
            AND rw.is_active = true
          ORDER BY rw.price_drops ASC
          LIMIT 20
        ) r
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END,

    'active_redemptions', CASE
      WHEN p_gym_id IS NOT NULL THEN COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'reward_id',  rd.reward_id,
            'created_at', rd.created_at
          )
        )
        FROM public.redemptions rd
        WHERE rd.user_id = v_user_id
          AND rd.gym_id  = p_gym_id
          AND rd.status  = ANY (ARRAY['pending','confirmed'])
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END,

    'checkin_status', CASE
      WHEN p_gym_id IS NOT NULL THEN (
        SELECT jsonb_build_object(
          'already_checked_in', EXISTS (
            SELECT 1 FROM public.gym_checkins c
            WHERE c.user_id = v_user_id
              AND c.gym_id  = p_gym_id
              AND DATE(c.checked_in_at AT TIME ZONE 'Europe/Belgrade')
                  = (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE
          ),
          'checkin_drops',  g.checkin_drops,
          'gym_name',       g.name,
          'total_checkins', (
            SELECT COUNT(*) FROM public.gym_checkins c2
            WHERE c2.user_id = v_user_id AND c2.gym_id = p_gym_id
          )
        )
        FROM public.gyms g
        WHERE g.id = p_gym_id
      )
      ELSE NULL
    END
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_dashboard(UUID) TO authenticated;

-- ============================================================
-- 2. Patch evaluate_badges: stop minting spendable drops
--    Badge awarding (user_badges insert) is preserved.
--    reward_drops field is kept for future use but no longer
--    creates profile balance or transaction rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.evaluate_badges(
  p_user_id    UUID,
  p_session_id UUID
)
RETURNS TABLE(badge_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_achievement   RECORD;
  v_profile       RECORD;
  v_criteria      JSONB;
  v_met           BOOLEAN;
  v_session_count INTEGER;
  v_gym_count     INTEGER;
  v_row_count     INTEGER;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_session_count
  FROM public.sessions
  WHERE user_id = p_user_id
    AND drops_earned > 0;

  SELECT COUNT(DISTINCT gym_id) INTO v_gym_count
  FROM public.gym_memberships
  WHERE user_id = p_user_id;

  FOR v_achievement IN
    SELECT * FROM public.global_achievements
    WHERE is_active = true
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.user_badges
      WHERE user_id = p_user_id
        AND global_achievement_id = v_achievement.id
    ) THEN
      CONTINUE;
    END IF;

    v_criteria := v_achievement.criteria;
    v_met := false;

    CASE v_criteria->>'type'
      WHEN 'session_count' THEN
        v_met := v_session_count >= (v_criteria->>'value')::INTEGER;

      WHEN 'total_drops' THEN
        v_met := v_profile.total_drops >= (v_criteria->>'value')::INTEGER;

      WHEN 'streak_days' THEN
        v_met := v_profile.streak_days >= (v_criteria->>'value')::INTEGER;

      WHEN 'gym_count' THEN
        v_met := v_gym_count >= (v_criteria->>'value')::INTEGER;

      WHEN 'distance_km' THEN
        v_met := (
          SELECT COALESCE(SUM((raw_metrics->>'total_distance')::NUMERIC), 0) / 1000.0
          FROM public.sessions
          WHERE user_id = p_user_id AND drops_earned > 0
        ) >= (v_criteria->>'value')::NUMERIC;

      ELSE
        v_met := false;
    END CASE;

    IF v_met THEN
      INSERT INTO public.user_badges
        (user_id, global_achievement_id, earned_at)
      VALUES
        (p_user_id, v_achievement.id, NOW())
      ON CONFLICT (user_id, global_achievement_id) WHERE global_achievement_id IS NOT NULL
      DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;

      IF v_row_count > 0 THEN
        -- MVP economy invariant: global achievements do NOT mint spendable drops.
        -- Badge is awarded (user_badges row above) but no profile balance update
        -- or drops_transaction is created. A global store with spendable achievement
        -- drops requires a separate architecture plan.

        RETURN QUERY SELECT v_achievement.name::TEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_badges(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.evaluate_badges(UUID, UUID) IS
  'Evaluates all active global achievements against user stats. '
  'Awards badges (user_badges) for newly met criteria. '
  'MVP: does NOT mint spendable drops for global achievements. '
  'Supports: session_count, total_drops, streak_days, gym_count, distance_km.';

-- ============================================================
-- 3. Zero out reward_drops on active global achievements
--    Prevents any old code path from accidentally awarding drops.
-- ============================================================

UPDATE public.global_achievements
SET reward_drops = 0
WHERE is_active = true
  AND reward_drops > 0;
