-- Migration: 20260413000007_backfill_prev_week_prizes.sql
-- Description: Create missing leaderboard prize redemptions for the Apr 6-12 weekly
--              snapshot whose prizes_distributed was incorrectly marked true by the
--              buggy IF v_reward IS NOT NULL check (now fixed in 20260413000006).
--
-- This is a one-time data repair. The snapshot rankings are the source of truth.

DO $$
DECLARE
  v_gym_id  UUID := '4074dffe-6df8-4070-b560-5be794977bff';
  v_snap_id UUID := 'ce4bb745-ed59-49a8-a3e2-f6f168d41d9f';
  v_snap    RECORD;
  v_entry   JSONB;
  v_rank    INT;
  v_user_id UUID;
  v_username TEXT;
  v_reward  RECORD;
  v_code    TEXT;
  v_gym_name TEXT;
  v_count   INT := 0;
BEGIN
  SELECT name INTO v_gym_name FROM public.gyms WHERE id = v_gym_id;

  SELECT * INTO v_snap FROM public.leaderboard_snapshots WHERE id = v_snap_id;
  IF NOT FOUND THEN
    RAISE NOTICE 'Snapshot % not found — skipping', v_snap_id;
    RETURN;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_snap.rankings)
  LOOP
    v_rank    := (v_entry->>'rank')::INT;
    v_user_id := (v_entry->>'user_id')::UUID;
    v_username := v_entry->>'username';

    IF v_rank > 3 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.redemptions
      WHERE user_id = v_user_id
        AND gym_id = v_gym_id
        AND source_type = 'leaderboard_prize'
        AND created_at >= v_snap.period_start::TIMESTAMPTZ
        AND created_at < (v_snap.period_end + INTERVAL '2 days')::TIMESTAMPTZ
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_reward
    FROM public.leaderboard_rewards
    WHERE gym_id = v_gym_id
      AND rank_position = v_rank
      AND period = 'weekly'
      AND is_active = true;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    LOOP
      v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.redemptions r
        WHERE r.redemption_code = v_code AND r.status = 'pending'
      );
    END LOOP;

    INSERT INTO public.redemptions (
      user_id, reward_id, gym_id, drops_spent,
      status, source_type, description, redemption_code, expires_at,
      created_at
    ) VALUES (
      v_user_id,
      NULL,
      v_gym_id,
      0,
      'pending',
      'leaderboard_prize',
      format('Leaderboard Prize: #%s Weekly at %s — %s',
        v_rank, v_gym_name,
        COALESCE(v_reward.reward_description, v_reward.reward_name)),
      v_code,
      v_snap.created_at + INTERVAL '30 days',
      v_snap.created_at
    );

    v_count := v_count + 1;
    RAISE NOTICE 'Created prize for % (rank %) — code %', v_username, v_rank, v_code;
  END LOOP;

  UPDATE public.leaderboard_snapshots
  SET prizes_distributed = true
  WHERE id = v_snap_id;

  RAISE NOTICE 'Backfilled % prizes for snapshot %', v_count, v_snap_id;
END;
$$;
