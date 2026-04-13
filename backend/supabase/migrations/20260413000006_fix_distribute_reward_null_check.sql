-- Migration: 20260413000006_fix_distribute_reward_null_check.sql
-- Description: Fix distribute_leaderboard_prizes so prizes are actually created.
--
-- ROOT CAUSE:
--   The condition `IF v_reward IS NOT NULL` uses composite-type NULL semantics.
--   In PL/pgSQL, `RECORD IS NOT NULL` returns false when ANY field is NULL.
--   Since leaderboard_rewards has nullable columns (reward_description, value),
--   this check ALWAYS fails, silently skipping the INSERT into redemptions.
--
-- FIX:
--   Replace `IF v_reward IS NOT NULL` with `IF FOUND` (the PL/pgSQL FOUND
--   variable is set to true after a successful SELECT INTO).

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
      WHERE gym_id = p_gym_id
        AND rank_position = v_top3.rank
        AND period::TEXT = p_period
        AND is_active = true;

      IF FOUND THEN
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
