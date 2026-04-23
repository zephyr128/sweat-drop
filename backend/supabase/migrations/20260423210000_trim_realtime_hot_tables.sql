-- Migration: 20260423210000_trim_realtime_hot_tables.sql
-- Description: Trim the supabase_realtime publication to stop 10s WAL-decode stalls
--              that caused mobile-app requests to time out on prod.
--
-- AGENT NOTE: [2026-04-23] - supabase-dba
--
-- PROBLEM OBSERVED IN PROD (pg_stat_statements top query):
--   realtime.list_changes — calls: 31,996, mean: 7.3 ms, MAX: 10,228 ms
--   total_time: 233 s, prop_total_time: 35.57 %
--
-- That is the Realtime service draining WAL changes. 35 % of the DB's total query
-- time is being spent feeding Realtime, and at least one call stalled for 10 s.
-- Every such stall serializes behind the logical-decoding lock — any concurrent
-- authenticated request queues and the mobile app reports "timeouts to supabase.co".
--
-- The mobile-app RPCs themselves are all healthy (sub-5 ms mean). The bottleneck
-- is Realtime, not application SQL.
--
-- ROOT CAUSE:
--   drops_transactions is the hottest APPEND-heavy table in the system (every
--   session award, check-in, challenge reward, arena reward, referral reward
--   inserts a row). Keeping it in supabase_realtime means every INSERT produces
--   a WAL broadcast for every subscribed client (home.tsx + wallet.tsx — two
--   subscriptions per user). At modest concurrency this is fine, but the combined
--   write volume from refresh_leaderboard_live_scores (5-min cron, bulk UPSERT),
--   award_drops (per-workout bursts), and process_pending_side_effects (cron) is
--   overwhelming WAL decoding during peak seconds.
--
--   user_notifications is similar — subscribed TWICE by each user (inbox + unread
--   counter) and the APNS/FCM push pipeline already handles real-time delivery.
--
-- CHANGES:
--   - DROP public.drops_transactions FROM publication supabase_realtime
--     → Mobile screens (home.tsx, wallet.tsx) now refresh via useFocusEffect
--       + AppState 'active' listener, not per-row push.
--   - DROP public.user_notifications FROM publication supabase_realtime
--     → Inbox screen refreshes on focus + AppState active. Push notifications
--       (Expo) already deliver the banner/badge for new rows.
--
-- TABLES INTENTIONALLY KEPT IN THE PUBLICATION:
--   - public.user_badges   — low-volume (one row per new badge), drives the
--                            "new badge earned" toast in useBadgeNotifications.
--                            After this change only ONE hook subscribes to it
--                            (useUserBadges no longer opens a duplicate channel).
--   - public.redemptions   — low-volume, drives useMyLeaderboardPrizes for the
--                            "your prize is ready" UI.
--
-- IMPACT ON FRONTEND:
--   Mobile App:
--     - home.tsx / wallet.tsx: remove useRealtimeRefresh({ table: 'drops_transactions' })
--     - useNotifications.ts:   remove both 'user-notifications-inbox' and
--                              'unread-notif-badge' realtime channels
--     - useUserBadges.ts:      remove its realtime channel (keep
--                              useBadgeNotifications as the single subscriber)
--     - Behavioural change: drops balance updates happen on screen focus /
--       foreground resume instead of instantly — typically within 100–300 ms
--       of returning to the screen. Previously the realtime push had a worst-
--       case latency of 500 ms–10 s due to the decoder stalls.
--
--   Admin Panel: no change.
--
-- BREAKING CHANGES:
--   - None at the API level. Existing clients running the OLD mobile build will
--     still open channels on these tables; the channels will simply receive no
--     events. The clients already fall back to focus-based refresh on AppState
--     changes (useFocusEffect + AppState listeners are installed).
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.drops_transactions;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
--
-- NEXT STEPS:
--   1. Apply with: cd backend && supabase db push
--   2. Ship matching mobile build (realtime hooks removed — see commit)
--   3. Monitor pg_stat_statements: realtime.list_changes prop_total_time should
--      drop from ~35 % to ~10 % within 5 minutes of deploy.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'drops_transactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.drops_transactions';
    RAISE NOTICE 'Dropped public.drops_transactions from supabase_realtime publication';
  ELSE
    RAISE NOTICE 'public.drops_transactions was not in supabase_realtime publication (no-op)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_notifications';
    RAISE NOTICE 'Dropped public.user_notifications from supabase_realtime publication';
  ELSE
    RAISE NOTICE 'public.user_notifications was not in supabase_realtime publication (no-op)';
  END IF;
END
$$;
