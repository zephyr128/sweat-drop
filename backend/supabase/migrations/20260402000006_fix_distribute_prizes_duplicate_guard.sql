-- Fix distribute_leaderboard_prizes:
--
-- BUG 1: Creates duplicate redemption rows every time it runs (cron is daily).
-- BUG 2: Distributes prizes on the FIRST call of a period (e.g., Monday 01:00
--   for weekly) when there's almost no data, instead of waiting for the end.
--
-- FIX:
--   - Snapshot is upserted daily to keep rankings fresh (no behavior change).
--   - Prizes (redemptions) are ONLY created when:
--     a) prizes_distributed is false for this period, AND
--     b) CURRENT_DATE >= period_end (we are on or past the last day).
--   - This means weekly prizes are distributed on Sunday, monthly on the last day.
--   - Manual "Distribute Now" from admin bypasses the date guard by passing
--     p_force := true.

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
  v_top3          RECORD;
  v_reward        RECORD;
  v_gym_name      TEXT;
  v_rankings      JSONB := '[]'::JSONB;
  v_winners       INTEGER := 0;
  v_period_start  DATE;
  v_period_end    DATE;
  v_redemption_id UUID;
  v_already_distributed BOOLEAN;
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

      IF v_reward IS NOT NULL THEN
        INSERT INTO public.redemptions (
          user_id, reward_id, gym_id, drops_spent,
          status, source_type, description
        ) VALUES (
          v_top3.user_id,
          NULL,
          p_gym_id,
          0,
          'claimed',
          'leaderboard_prize',
          format('Leaderboard Prize: #%s %s at %s — %s',
            v_top3.rank, initcap(p_period), v_gym_name,
            COALESCE(v_reward.reward_description, v_reward.reward_name))
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
