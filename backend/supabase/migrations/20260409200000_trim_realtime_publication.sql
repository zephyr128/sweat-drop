-- Migration: 20260409200000_trim_realtime_publication.sql
-- Description: Remove high-write tables from Realtime that no client subscribes to
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- Current supabase_realtime members:
--   machines, sessions, gym_checkins, redemptions, staff_invitations,
--   gym_member_identities, drops_transactions, user_badges
--
-- Mobile app subscribes to: drops_transactions, user_badges
-- Admin panel uses: redemptions, staff_invitations, gym_member_identities
-- Nobody subscribes to: machines, sessions, gym_checkins
--
-- sessions gets UPDATEd on every heartbeat (~every 5s per active workout).
-- machines gets UPDATEd on every lock/unlock/heartbeat.
-- At 20k users with 200 concurrent workouts, that's ~40 WAL events/sec
-- broadcast to the Realtime server for zero subscribers.
--
-- CHANGES:
--   - Removed machines from supabase_realtime
--   - Removed sessions from supabase_realtime
--   - Removed gym_checkins from supabase_realtime
--
-- IMPACT ON FRONTEND:
--   - Mobile App: No change (never subscribed to these)
--   - Admin Panel: No change (never subscribed to these)
--
-- BREAKING CHANGES: None

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.machines;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.sessions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.gym_checkins;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
