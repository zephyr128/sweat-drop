-- Migration: 20260413000010_user_notifications_inbox.sql
-- Description: In-app notification inbox — stores every notification sent to a
--   user so they can browse their history in the Notification Center screen.
--
-- Tables:  public.user_notifications
-- RPCs:    mark_notifications_read, mark_all_notifications_read, get_unread_notification_count
-- Realtime: added to supabase_realtime publication
-- Trigger:  Updates notify_leaderboard_overtakes to also persist to this table.

-- ─────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       DEFAULT '{}'::JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.user_notifications IS 'In-app notification inbox. One row per notification per user.';

-- ─────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications (user_id)
  WHERE read_at IS NULL;

-- ─────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.user_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.user_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Inserts happen via SECURITY DEFINER functions or service-role clients
CREATE POLICY "Service inserts notifications"
  ON public.user_notifications FOR INSERT
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- 4. Realtime publication
-- ─────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

-- ─────────────────────────────────────────────
-- 5. RPCs
-- ─────────────────────────────────────────────

-- 5a. Mark specific notifications read
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.user_notifications
  SET read_at = now()
  WHERE id = ANY(p_ids)
    AND user_id = auth.uid()
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5b. Mark ALL unread notifications read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.user_notifications
  SET read_at = now()
  WHERE user_id = auth.uid()
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5c. Unread count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INT
  FROM public.user_notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL;
$$;

-- ─────────────────────────────────────────────
-- 6. Helper: persist notification (used by DB triggers)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.persist_notification(
  p_user_id UUID,
  p_type    TEXT,
  p_title   TEXT,
  p_body    TEXT,
  p_data    JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, p_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 7. Update overtake trigger to also persist
-- ─────────────────────────────────────────────

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

  v_title := 'You''ve been overtaken!';
  v_notif_data := jsonb_build_object(
    'type',   'rank_overtaken',
    'period', 'weekly'
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
    v_body := v_overtaker_name || ' just passed you on the weekly leaderboard!';

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
          'tokens', jsonb_build_array(v_overtaken.expo_push_token),
          'title', v_title,
          'body',  v_body,
          'data',  v_notif_data
        )
      );
    END IF;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN NEW;
END;
$$;
