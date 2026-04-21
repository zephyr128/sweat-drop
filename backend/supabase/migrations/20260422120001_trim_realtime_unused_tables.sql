-- Remove tables from supabase_realtime that have no active mobile subscribers.
-- This reduces WAL broadcast load: every INSERT/UPDATE/DELETE on these tables
-- was being serialized and broadcast even though nothing listens.
--
-- staff_invitations  — admin-only flow, no mobile Realtime subscription
-- gym_member_identities — no mobile Realtime subscription
--
-- Tables intentionally KEPT in the publication:
--   drops_transactions   (home.tsx, wallet.tsx via useRealtimeRefresh)
--   user_badges          (useUserBadges, useBadgeNotifications)
--   user_notifications   (useNotifications inbox + badge counter)
--   redemptions          (useMyLeaderboardPrizes)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff_invitations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.staff_invitations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gym_member_identities'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.gym_member_identities';
  END IF;
END
$$;
