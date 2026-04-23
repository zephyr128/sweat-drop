-- Migration: 20260423220000_get_home_dashboard_rpc.sql
-- Description: Combine 6 parallel home-screen queries into a single RPC.
--
-- AGENT NOTE: [2026-04-23] - supabase-dba
--
-- PROBLEM:
--   useHomeStats.ts fires 6 concurrent round-trips on every home-screen mount:
--     1. rpc('get_my_drops', ...)      -- week drops
--     2. rpc('get_my_sessions', ...)   -- last workout
--     3. from('profiles').select()     -- streak
--     4. from('rewards').select()      -- closest reward
--     5. rpc('get_my_redemptions')     -- active redemptions
--     6. from('gym_memberships')       -- local drops balance
--   Plus home.tsx fires a 7th: rpc('get_checkin_status').
--
--   At prod load these 7 parallel requests hit PostgREST concurrently with every
--   other user's home-screen mount, adding to the connection-pool pressure that
--   compounded the Realtime stalls diagnosed in the preceding migration
--   (20260423210000_trim_realtime_hot_tables.sql).
--
-- CHANGES:
--   - Added RPC: get_home_dashboard(p_gym_id UUID DEFAULT NULL) RETURNS JSONB
--
-- IMPACT ON FRONTEND:
--   - Mobile App: useHomeStats.ts switches from 6 parallel calls to 1 call.
--     home.tsx's checkin_status loader reads from the same payload instead of
--     a separate rpc('get_checkin_status') call.
--   - Admin Panel: no change.
--
-- BREAKING CHANGES: None (additive RPC — existing RPCs remain callable).
--
-- NEXT STEPS:
--   1. Apply with: cd backend && supabase db push
--   2. Ship mobile build that uses get_home_dashboard
--   3. Monitor pg_stat_statements: prop_total_time of get_my_drops /
--      get_my_sessions / get_my_redemptions should drop sharply on the home
--      screen hot path. They remain used by /transactions, /trophy-room, etc.

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

  -- Monday 00:00 in Europe/Belgrade, expressed in UTC for timestamp comparison.
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

    -- All positive earning-typed drops since this week's Monday (Belgrade).
    -- Client aggregates today vs week locally (matches current useHomeStats
    -- logic, including capped vs bonus split).
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
    ), '[]'::jsonb),

    -- Most recent completed session (non-active, ended_at IS NOT NULL).
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

    -- Inline the checkin-status shape so the client doesn't need a second RPC.
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

COMMENT ON FUNCTION public.get_home_dashboard(UUID) IS
  'Returns the combined home-screen payload (profile streak, week drops, last '
  'session, local balance, rewards, active redemptions, check-in status). '
  'Replaces 7 parallel round-trips with 1. Caller passes active gym_id; the '
  'gym-scoped sections return null/[] when p_gym_id is NULL.';
