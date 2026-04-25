-- Migration: 20260425184000_notifications_include_gym_name.sql
-- Description: Stamp gym name onto gym-scoped notifications so users can tell
--   which gym a notification is from. Phase 1 covers the rank_overtaken
--   trigger (the only DB-side notification source); edge-function-side
--   producers (happy hour, drops expiry, prizes, arenas) are patched in the
--   matching TS files in the same change set.
--
-- Without this, a user who is a member of multiple gyms gets "You've been
-- overtaken!" with body "X just passed you on the weekly leaderboard!" and
-- no way to know which leaderboard. After this migration the gym name is
-- baked into the body and also surfaced under data.gym_name so the in-app
-- inbox can render a "@ Gym Name" line.
--
-- Patches:
--   • notify_leaderboard_overtakes() — body now ends with " at <Gym Name>"
--     and data.gym_name carries the gym name for client-side display.

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
  v_gym_name       TEXT;
  v_overtaken      RECORD;
  v_sent_count     INT := 0;
  v_max_pushes     INT := 5;
  v_title          TEXT;
  v_body           TEXT;
  v_notif_data     JSONB;
BEGIN
  IF NEW.drops_earned <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT weekly_score INTO v_my_new_weekly
  FROM public.leaderboard_live_scores
  WHERE gym_id = NEW.gym_id AND user_id = NEW.user_id;

  IF v_my_new_weekly IS NULL THEN
    RETURN NEW;
  END IF;

  v_my_old_weekly := v_my_new_weekly - NEW.drops_earned;

  IF v_my_old_weekly <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(username, 'Someone') INTO v_overtaker_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Resolve gym name once per fanout. NULL-safe fallback so a missing or
  -- deleted gym doesn't break notifications.
  SELECT name INTO v_gym_name
  FROM public.gyms
  WHERE id = NEW.gym_id;

  IF v_gym_name IS NULL OR length(v_gym_name) = 0 THEN
    v_gym_name := 'your gym';
  END IF;

  v_title := 'You''ve been overtaken at ' || v_gym_name || '!';
  v_notif_data := jsonb_build_object(
    'type',     'rank_overtaken',
    'period',   'weekly',
    'gym_id',   NEW.gym_id,
    'gym_name', v_gym_name
  );

  FOR v_overtaken IN
    SELECT ls.user_id AS overtaken_user_id, p.expo_push_token
    FROM public.leaderboard_live_scores ls
    JOIN public.profiles p ON p.id = ls.user_id
    WHERE ls.gym_id  = NEW.gym_id
      AND ls.user_id != NEW.user_id
      AND ls.weekly_score >= v_my_old_weekly
      AND ls.weekly_score <  v_my_new_weekly
    ORDER BY ls.weekly_score DESC
    LIMIT v_max_pushes
  LOOP
    v_body := v_overtaker_name
              || ' just passed you on the weekly leaderboard at '
              || v_gym_name
              || '!';

    -- Persist to in-app notification inbox
    PERFORM public.persist_notification(
      v_overtaken.overtaken_user_id,
      'rank_overtaken',
      v_title,
      v_body,
      v_notif_data
    );

    -- Send push notification (non-blocking via pg_net)
    IF v_overtaken.expo_push_token IS NOT NULL THEN
      PERFORM public._invoke_edge_function(
        'send-push',
        jsonb_build_object(
          'client_ref', 'rank_overtaken',
          'tokens',     jsonb_build_array(v_overtaken.expo_push_token),
          'title',      v_title,
          'body',       v_body,
          'data',       v_notif_data
        )
      );
    END IF;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_leaderboard_overtakes() IS
  'Notifies users when overtaken on the weekly leaderboard. As of '
  '20260425184000 the title/body/data include the gym name so users who '
  'are members of multiple gyms can tell which leaderboard they were '
  'overtaken on.';
