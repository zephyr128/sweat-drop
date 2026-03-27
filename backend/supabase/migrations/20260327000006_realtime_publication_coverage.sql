-- Migration: 20260327000006_realtime_publication_coverage.sql
-- Description: Add operational tables to supabase_realtime publication
--
-- AGENT NOTE: [2026-03-27] - supabase-dba
-- Reference: docs/plans/staff_identity_engagement_promotions_realtime_master_plan.md — Workstream E1
--
-- Current state: only machines and sessions are in supabase_realtime.
-- Adding: gym_checkins, redemptions, staff_invitations,
--         engagement_campaign_deliveries, gym_member_identities
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: Can subscribe to realtime changes on check-ins, redemptions, etc.
-- - Mobile App: Can subscribe to wallet/checkin updates in foreground.

-- Add tables to realtime publication (idempotent: ALTER ADD is a no-op if already present)
-- We use DO blocks to handle the case where the table is already in the publication.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gym_checkins;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.redemptions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_invitations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_campaign_deliveries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gym_member_identities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
