-- Migration: 20260424120000_trim_realtime_phase2_drop_sessions_machines_engagement.sql
-- Description: Phase 2 of the supabase_realtime publication trim.
--              Removes the three remaining hot, write-heavy tables that mobile
--              does NOT subscribe to and that admin already covers with a
--              15-second unconditional polling fallback. Also enforces
--              REPLICA IDENTITY DEFAULT on every table that stays in the
--              publication, to minimize WAL row payload size.
--
-- AGENT NOTE: [2026-04-24] - supabase-dba
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS — fresh pg_stat_statements (post-Phase-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Even after migration 20260423210000_trim_realtime_hot_tables (which removed
-- drops_transactions and user_notifications), the production
-- pg_stat_statements top entry is STILL:
--
--   query        : SELECT … FROM realtime.list_changes($1,$2,$3,$4)
--   rolname      : supabase_admin
--   calls        : 80,754
--   mean_time    : 6.72 ms
--   MAX TIME     : 10,228 ms          ← 10-second stall
--   total_time   : 542,586 ms         ← 31.96 % of total DB time
--
-- A logical-decoding stall of 10 seconds means every concurrent authenticated
-- request queues behind it. Mobile clients then report "timeouts to
-- *.supabase.co". The mean per app RPC is sub-5 ms (healthy) — but the
-- max/P99 tail on otherwise trivial RPCs is 100–431 ms which is the classic
-- signature of lock contention behind the WAL decoder.
--
-- After Phase 1, the publication still contained:
--   - sessions                          (write-hot: every workout = many writes)
--   - machines                          (write-hot: is_busy + heartbeat updates)
--   - gym_checkins                      (write-warm: every check-in)
--   - engagement_campaign_deliveries    (write-warm, no subscribers)
--   - user_badges                       (low-volume, KEEP)
--   - redemptions                       (low-volume, KEEP)
--
-- ════════════════════════════════════════════════════════════════════════════
-- SUBSCRIBER AUDIT (cross-checked apps/mobile-app + apps/admin-panel)
-- ════════════════════════════════════════════════════════════════════════════
--
-- public.sessions
--   Mobile:  none (only direct .from('sessions') SELECT/INSERT/UPDATE — NOT realtime)
--   Admin:   MachineFloor.tsx, LiveMachineMonitor.tsx
--            ↳ Both poll getLiveMachineStatus(gymId) UNCONDITIONALLY every
--              15 s (POLL_INTERVAL = 15_000) regardless of realtime state.
--              Realtime was a "speed-up to <1 s" optimization. After the drop:
--              the UI updates within 15 s — fully acceptable for Live Monitor.
--   → SAFE TO DROP.
--
-- public.machines
--   Mobile:  none
--   Admin:   MachineFloor.tsx, LiveMachineMonitor.tsx, MachineHeatmapWidget.tsx
--            ↳ MachineFloor + LiveMachineMonitor: same 15 s unconditional poll
--              ↳ same status as sessions above.
--            ↳ MachineHeatmapWidget: NO polling fallback today; will show its
--              initial-mount count until page refresh. Cosmetic regression.
--              admin-coder will add a 30 s polling refresh in a follow-up.
--   → SAFE TO DROP. (Heatmap widget degrades from "live" to "load-time" count;
--     non-critical — it's a header KPI, not an alert.)
--
-- public.engagement_campaign_deliveries
--   Mobile:  none
--   Admin:   none (verified via grep — added in 20260327000006 but never wired)
--   → SAFE TO DROP unconditionally.
--
-- public.gym_checkins  ← INTENTIONALLY NOT DROPPED HERE
--   Mobile:  none
--   Admin:   DeskShell.tsx (toast alerts for unverified members on check-in),
--            CheckinStatsModule.tsx (live counters)
--            ↳ DeskShell HAS a polling fallback BUT it is gated on
--              !realtimeConnected. Dropping the table from the publication
--              still leaves the channel in SUBSCRIBED state on the Realtime
--              service (zero events flow), so realtimeConnected stays true
--              and polling never kicks in. Result: receptionist loses the
--              "unverified member just walked in" toast — operationally bad.
--            ↳ Phase 2b migration will drop this once admin-coder ships an
--              unconditional 30 s poll in DeskShell + CheckinStatsModule.
--   → KEEP for now. Tracked as follow-up.
--
-- public.user_badges, public.redemptions
--   Mobile:  useBadgeNotifications, useMyLeaderboardPrizes
--   Admin:   none
--   Volume:  one row per badge unlock / redemption — low.
--   → KEEP. Drives critical "you earned X" toasts.
--
-- ════════════════════════════════════════════════════════════════════════════
-- IMPACT ON FRONTEND
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mobile App: NO changes required. Mobile never subscribed to any of the
--             dropped tables. The build currently in App-Store / Play-Store
--             review is fully compatible.
--
-- Admin Panel:
--   - MachineFloor / LiveMachineMonitor: behavioural change is "<1 s realtime
--     update" → "≤15 s polled update". The little "live" connection-status
--     dot will likely show green (subscribed) but no events flow — cosmetic
--     only. admin-coder may want to disable that indicator in a follow-up.
--   - MachineHeatmapWidget: live counter freezes at mount value until page
--     refresh. admin-coder follow-up: add a 30 s polling refresh.
--   - DeskShell + CheckinStatsModule: UNAFFECTED by this migration
--     (gym_checkins stays in publication).
--
-- Edge Functions / cron: unaffected.
--
-- ════════════════════════════════════════════════════════════════════════════
-- BREAKING CHANGES
-- ════════════════════════════════════════════════════════════════════════════
-- - None at the API level. The .channel(...).on('postgres_changes', {table:
--   'sessions'|'machines'|'engagement_campaign_deliveries', ...}) calls in
--   admin-panel will still SUBSCRIBE successfully (Realtime service accepts
--   any table name) — they just won't receive events. No errors thrown.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_campaign_deliveries;
--
-- ════════════════════════════════════════════════════════════════════════════
-- EXPECTED PROD IMPACT
-- ════════════════════════════════════════════════════════════════════════════
-- Within 5 minutes of apply, monitor pg_stat_statements:
--   realtime.list_changes prop_total_time : 31.96 % → < 5 %    (target)
--   realtime.list_changes max_time        : 10,228 ms → < 500 ms (target)
--   per-RPC max_time tail (e.g. get_home_dashboard) : 431 ms → < 50 ms
--
-- If targets aren't met, gym_checkins is the next candidate (requires admin
-- polling refactor first — see Phase 2b TODO in MIGRATION_NOTES.md).
--
-- ════════════════════════════════════════════════════════════════════════════
-- NEXT STEPS
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Apply: cd backend && supabase db push
-- 2. Verify publication membership (see verification block at end of file).
-- 3. Watch pg_stat_statements for 10 minutes.
-- 4. Open follow-up admin-coder task: add unconditional 30 s polling to
--    DeskShell + CheckinStatsModule + MachineHeatmapWidget; then ship Phase 2b
--    to drop public.gym_checkins from supabase_realtime.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Drop the three tables from supabase_realtime (idempotent)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_dropped TEXT[] := ARRAY[]::TEXT[];
  v_targets TEXT[] := ARRAY[
    'sessions',
    'machines',
    'engagement_campaign_deliveries'
  ];
  v_target TEXT;
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_target
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
        v_target
      );
      v_dropped := array_append(v_dropped, v_target);
      RAISE NOTICE 'Dropped public.% from supabase_realtime publication',
        v_target;
    ELSE
      RAISE NOTICE 'public.% was not in supabase_realtime publication (no-op)',
        v_target;
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 2 trim: dropped % tables: %',
    array_length(v_dropped, 1), v_dropped;
END
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) REPLICA IDENTITY audit on all tables remaining in supabase_realtime.
--
--    Postgres logical decoding writes the OLD row image into WAL on every
--    UPDATE/DELETE according to REPLICA IDENTITY:
--      - DEFAULT  : primary-key columns only (smallest WAL footprint)
--      - INDEX    : columns of the named unique index
--      - FULL     : EVERY column of the row (largest WAL footprint, ~3-10x)
--      - NOTHING  : no old image (would break Realtime payloads)
--
--    Anything left at FULL on a write-warm table multiplies WAL-decode work
--    for no Realtime UX benefit (the broadcast payload is built from the
--    new image). Force DEFAULT where it isn't already.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  v_changed INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      pt.schemaname,
      pt.tablename,
      c.relreplident AS current_identity
    FROM pg_publication_tables pt
    JOIN pg_namespace n ON n.nspname = pt.schemaname
    JOIN pg_class    c ON c.relname  = pt.tablename
                      AND c.relnamespace = n.oid
    WHERE pt.pubname = 'supabase_realtime'
  LOOP
    IF rec.current_identity = 'f' THEN
      -- Switch FULL → DEFAULT. Requires a primary key, which all our tables
      -- have (UUID PK convention enforced by supabase-dba rule).
      EXECUTE format(
        'ALTER TABLE %I.%I REPLICA IDENTITY DEFAULT',
        rec.schemaname, rec.tablename
      );
      v_changed := v_changed + 1;
      RAISE NOTICE 'REPLICA IDENTITY changed FULL → DEFAULT on %.%',
        rec.schemaname, rec.tablename;
    ELSE
      RAISE NOTICE 'REPLICA IDENTITY already non-FULL (code=%) on %.% — no change',
        rec.current_identity, rec.schemaname, rec.tablename;
    END IF;
  END LOOP;

  RAISE NOTICE 'REPLICA IDENTITY audit: % table(s) flipped to DEFAULT',
    v_changed;
END
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Verification — log the final state of the publication so the apply log
--    captures the post-migration ground truth.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '── supabase_realtime publication membership (post-Phase-2) ──';
  FOR rec IN
    SELECT pt.schemaname, pt.tablename, c.relreplident
    FROM pg_publication_tables pt
    JOIN pg_namespace n ON n.nspname = pt.schemaname
    JOIN pg_class    c ON c.relname  = pt.tablename
                      AND c.relnamespace = n.oid
    WHERE pt.pubname = 'supabase_realtime'
    ORDER BY pt.schemaname, pt.tablename
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  %.%  (REPLICA IDENTITY = %)',
      rec.schemaname, rec.tablename, rec.relreplident;
  END LOOP;
  RAISE NOTICE '── total: % table(s) in publication ──', v_count;
END
$$;
