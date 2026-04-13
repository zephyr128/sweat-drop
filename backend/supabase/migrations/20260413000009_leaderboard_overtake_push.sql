-- Migration: 20260413000009_leaderboard_overtake_push.sql
-- Description: Push notification when a user overtakes another on the weekly leaderboard.
--
-- MECHANISM:
--   A trigger on pending_session_side_effects (AFTER INSERT) fires only from
--   award_drops — never from the cron refresh. The trigger reads the user's
--   updated weekly_score from leaderboard_live_scores, computes the old score
--   (new − drops_earned), and finds users whose score fell in that range.
--   For each overtaken user with a push token, it calls send-push via the
--   existing public._invoke_edge_function helper (non-blocking pg_net).
--
-- SAFEGUARDS:
--   • Skips if drops_earned <= 0 (no score change)
--   • Skips if old weekly score was 0 (first workout of the week — avoids
--     spamming everyone below a brand-new entry)
--   • Limited to 5 push calls per workout to cap fan-out
--   • Only weekly period (the most competitive period)
--
-- MOBILE:
--   rank_overtaken type already exists in notifications.ts and deep-links to
--   /leaderboard. No mobile code changes required.

CREATE OR REPLACE FUNCTION public.notify_leaderboard_overtakes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_my_new_weekly  NUMERIC;
  v_my_old_weekly  NUMERIC;
  v_overtaker_name TEXT;
  v_overtaken      RECORD;
  v_sent_count     INT := 0;
  v_max_pushes     INT := 5;
BEGIN
  IF NEW.drops_earned <= 0 THEN
    RETURN NEW;
  END IF;

  -- Get the user's current (post-award) weekly score
  SELECT weekly_score INTO v_my_new_weekly
  FROM public.leaderboard_live_scores
  WHERE gym_id = NEW.gym_id AND user_id = NEW.user_id;

  IF v_my_new_weekly IS NULL THEN
    RETURN NEW;
  END IF;

  v_my_old_weekly := v_my_new_weekly - NEW.drops_earned;

  -- Skip if this is the user's first contribution this week
  IF v_my_old_weekly <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(username, 'Someone') INTO v_overtaker_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  FOR v_overtaken IN
    SELECT p.expo_push_token
    FROM public.leaderboard_live_scores ls
    JOIN public.profiles p ON p.id = ls.user_id
    WHERE ls.gym_id  = NEW.gym_id
      AND ls.user_id != NEW.user_id
      AND ls.weekly_score >= v_my_old_weekly
      AND ls.weekly_score <  v_my_new_weekly
      AND p.expo_push_token IS NOT NULL
    ORDER BY ls.weekly_score DESC
    LIMIT v_max_pushes
  LOOP
    PERFORM public._invoke_edge_function(
      'send-push',
      jsonb_build_object(
        'client_ref', 'rank_overtaken',
        'tokens', jsonb_build_array(v_overtaken.expo_push_token),
        'title', 'You''ve been overtaken!',
        'body',  v_overtaker_name || ' just passed you on the weekly leaderboard!',
        'data',  jsonb_build_object(
          'type',   'rank_overtaken',
          'period', 'weekly'
        )
      )
    );

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger fires only when award_drops inserts a side-effect row with drops > 0
CREATE TRIGGER trg_leaderboard_overtake_push
  AFTER INSERT ON public.pending_session_side_effects
  FOR EACH ROW
  WHEN (NEW.drops_earned > 0)
  EXECUTE FUNCTION public.notify_leaderboard_overtakes();
