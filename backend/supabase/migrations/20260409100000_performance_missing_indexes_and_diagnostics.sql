-- Migration: 20260409100000_performance_missing_indexes_and_diagnostics.sql
-- Description: Add missing B-tree/partial indexes for hot mobile-app queries,
--              remove excess Realtime tables, and install diagnostic helpers.
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- ANALYSIS SUMMARY (20 users, latency complaints):
--
-- 1. MISSING INDEXES identified by cross-referencing mobile-app .from()/.rpc()
--    filter columns against existing CREATE INDEX DDL:
--
--    sessions:           no composite (user_id, is_active) — every mobile query filters both
--    sessions:           no composite (user_id, gym_id, is_active)
--    sessions:           no composite (machine_id, is_active)
--    drops_transactions: no composite (user_id, transaction_type)
--    drops_transactions: no composite (user_id, gym_id, created_at)
--    challenge_progress: no composite (user_id, gym_id)
--    challenge_progress: no composite (user_id, is_completed)
--    redemptions:        no composite (user_id, reward_id, status)
--    gym_challenges:     no composite (gym_id, is_active, start_date, end_date)
--    referrals:          no index on invitee_user_id (idx_referrals_invitee may
--                        only exist after timeline migration; adding safely)
--    friend_challenges:  no index on opponent_user_id or compound challenger/opponent
--    profiles:           no index on role (used in every RLS admin/staff subquery)
--    gym_memberships:    no composite (user_id, gym_id, local_drops_balance)
--    leaderboard_snapshots: no index on (gym_id, period, period_end DESC)
--    user_badges:        no index on user_id (realtime subscription filter column)
--
-- 2. RLS POLICY SUBQUERY CONCERNS:
--    - "Gym staff can view gym checkins" does a correlated subquery on gyms +
--      gym_staff per row. With 20 users this is tolerable but will scale poorly.
--    - redemptions staff policies query profiles.role per row.
--    - leaderboard_snapshots user policy joins gym_memberships per row.
--    => Adding covering indexes on profiles(id, role) and gym_staff(user_id, gym_id)
--       for these subqueries.
--
-- 3. REALTIME PUBLICATION:
--    7 tables currently in supabase_realtime:
--      machines, sessions, gym_checkins, redemptions,
--      staff_invitations, engagement_campaign_deliveries, gym_member_identities
--    Mobile app only subscribes to: user_badges, drops_transactions
--    Admin panel may use: redemptions, staff_invitations, gym_member_identities
--    => Removing engagement_campaign_deliveries (bulk insert table, not subscribed)
--    => Adding drops_transactions + user_badges (actually subscribed by mobile)
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Faster query response on sessions, drops, checkins, challenges.
--                 drops_transactions and user_badges realtime now actually work.
--   - Admin Panel: No changes needed. engagement_campaign_deliveries realtime removed
--                  (admin doesn't subscribe to it).
--
-- BREAKING CHANGES: None (additive indexes, realtime cleanup)
--
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. MISSING INDEXES — sessions (hottest table in mobile app)
-- ============================================================

-- Every mobile query does: .eq('user_id', uid).eq('is_active', false)
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON public.sessions (user_id, is_active);

-- workout-history, session-summary: user_id + gym_id + is_active
CREATE INDEX IF NOT EXISTS idx_sessions_user_gym_active
  ON public.sessions (user_id, gym_id, is_active);

-- start_session_safely: machine_id WHERE is_active = true
CREATE INDEX IF NOT EXISTS idx_sessions_machine_active
  ON public.sessions (machine_id) WHERE is_active = true;

-- award_drops merge-window: user_id + is_active + started_at range
CREATE INDEX IF NOT EXISTS idx_sessions_user_active_started
  ON public.sessions (user_id, started_at DESC) WHERE is_active = false;

-- ============================================================
-- 2. MISSING INDEXES — drops_transactions
-- ============================================================

-- useMyStats, wallet, useDropLimitStatus: user_id + transaction_type + created_at
CREATE INDEX IF NOT EXISTS idx_drops_tx_user_type_created
  ON public.drops_transactions (user_id, transaction_type, created_at DESC);

-- wallet gym-scoped queries: user_id + gym_id + created_at
CREATE INDEX IF NOT EXISTS idx_drops_tx_user_gym_created
  ON public.drops_transactions (user_id, gym_id, created_at DESC);

-- ============================================================
-- 3. MISSING INDEXES — challenge_progress
-- ============================================================

-- challenges.tsx, useChallengeProgress: user_id + gym_id
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_gym
  ON public.challenge_progress (user_id, gym_id);

-- useMyStats completed badge count: user_id + is_completed
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_completed
  ON public.challenge_progress (user_id, is_completed) WHERE is_completed = true;

-- ============================================================
-- 4. MISSING INDEXES — redemptions
-- ============================================================

-- reward-detail.tsx: user_id + reward_id + status
CREATE INDEX IF NOT EXISTS idx_redemptions_user_reward_status
  ON public.redemptions (user_id, reward_id, status);

-- ============================================================
-- 5. MISSING INDEXES — gym_challenges
-- ============================================================

-- challenges.tsx, session-summary: gym_id + is_active + date range
CREATE INDEX IF NOT EXISTS idx_gym_challenges_gym_active_dates
  ON public.gym_challenges (gym_id, is_active, start_date, end_date)
  WHERE is_active = true;

-- ============================================================
-- 6. MISSING INDEXES — referrals / friend_challenges
-- ============================================================

-- friendSocialApi: invitee_user_id lookups
CREATE INDEX IF NOT EXISTS idx_referrals_invitee_user
  ON public.referrals (invitee_user_id) WHERE invitee_user_id IS NOT NULL;

-- friendSocialApi: opponent_user_id lookups
CREATE INDEX IF NOT EXISTS idx_friend_challenges_opponent
  ON public.friend_challenges (opponent_user_id, status);

-- friendSocialApi: challenger_user_id lookups
CREATE INDEX IF NOT EXISTS idx_friend_challenges_challenger
  ON public.friend_challenges (challenger_user_id, status);

-- ============================================================
-- 7. MISSING INDEXES — profiles (RLS subquery acceleration)
-- ============================================================

-- Every admin/staff RLS policy does: SELECT 1 FROM profiles WHERE id = auth.uid() AND role = '...'
-- PK lookup + role filter on 20 rows is fast, but covering index prevents heap fetch
CREATE INDEX IF NOT EXISTS idx_profiles_id_role
  ON public.profiles (id, role);

-- ============================================================
-- 8. MISSING INDEXES — gym_memberships
-- ============================================================

-- LeaderboardPreview: gym_id ORDER BY local_drops_balance DESC
CREATE INDEX IF NOT EXISTS idx_gym_memberships_gym_balance
  ON public.gym_memberships (gym_id, local_drops_balance DESC);

-- ============================================================
-- 9. MISSING INDEXES — leaderboard_snapshots
-- ============================================================

-- leaderboard.tsx: gym_id + period + period_end DESC
CREATE INDEX IF NOT EXISTS idx_leaderboard_snap_gym_period_end
  ON public.leaderboard_snapshots (gym_id, period, period_end DESC);

-- ============================================================
-- 10. MISSING INDEXES — user_badges (realtime + query)
-- ============================================================

-- useUserBadges, useBadgeNotifications: user_id lookups and realtime filter
CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON public.user_badges (user_id);

-- ============================================================
-- 11. REALTIME PUBLICATION CLEANUP
-- ============================================================

-- Remove table the mobile app doesn't subscribe to
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.engagement_campaign_deliveries;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Add tables the mobile app actually subscribes to
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.drops_transactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 12. FORCE ANALYZE on hot tables
-- ============================================================

ANALYZE public.sessions;
ANALYZE public.drops_transactions;
ANALYZE public.gym_checkins;
ANALYZE public.profiles;
ANALYZE public.gym_memberships;
ANALYZE public.challenge_progress;
ANALYZE public.redemptions;
ANALYZE public.rewards;
ANALYZE public.gym_challenges;
ANALYZE public.referrals;
ANALYZE public.user_badges;
ANALYZE public.leaderboard_snapshots;

-- ============================================================
-- 13. DIAGNOSTIC VIEWS (non-destructive, query-only)
-- ============================================================

-- View: Tables missing indexes on foreign key columns
CREATE OR REPLACE VIEW public.v_diag_missing_fk_indexes AS
WITH fks AS (
  SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
),
idx AS (
  SELECT
    schemaname,
    tablename,
    (string_to_array(indexdef, '('))[2] AS idx_cols
  FROM pg_indexes
  WHERE schemaname = 'public'
)
SELECT
  fks.table_name,
  fks.column_name,
  fks.constraint_name
FROM fks
LEFT JOIN idx ON idx.tablename = fks.table_name
  AND idx.idx_cols LIKE fks.column_name || '%'
WHERE idx.idx_cols IS NULL
ORDER BY fks.table_name, fks.column_name;

COMMENT ON VIEW public.v_diag_missing_fk_indexes IS
  'Foreign keys without a leading index. Run: SELECT * FROM v_diag_missing_fk_indexes;';

-- View: Table bloat estimates
CREATE OR REPLACE VIEW public.v_diag_table_bloat AS
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  CASE WHEN n_live_tup > 0
    THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
    ELSE 0
  END AS dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

COMMENT ON VIEW public.v_diag_table_bloat IS
  'Dead tuple ratio per table. dead_pct > 20% suggests autovacuum is behind. '
  'Run: SELECT * FROM v_diag_table_bloat WHERE dead_pct > 10;';

-- View: Unused / rarely used indexes (index bloat candidates)
CREATE OR REPLACE VIEW public.v_diag_unused_indexes AS
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan < 10
ORDER BY pg_relation_size(indexrelid) DESC;

COMMENT ON VIEW public.v_diag_unused_indexes IS
  'Indexes scanned fewer than 10 times since last stats reset. Candidates for removal. '
  'Run: SELECT * FROM v_diag_unused_indexes;';

-- Function: slow queries in last 24h (requires pg_stat_statements extension)
CREATE OR REPLACE FUNCTION public.get_slow_queries(p_min_ms NUMERIC DEFAULT 100)
RETURNS TABLE (
  query TEXT,
  calls BIGINT,
  mean_ms NUMERIC,
  max_ms NUMERIC,
  total_ms NUMERIC,
  rows_returned BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    pss.query,
    pss.calls,
    ROUND((pss.mean_exec_time)::numeric, 2) AS mean_ms,
    ROUND((pss.max_exec_time)::numeric, 2) AS max_ms,
    ROUND((pss.total_exec_time)::numeric, 2) AS total_ms,
    pss.rows
  FROM extensions.pg_stat_statements pss
  WHERE pss.mean_exec_time > p_min_ms
    AND pss.calls > 0
  ORDER BY pss.mean_exec_time DESC
  LIMIT 50;
$$;

COMMENT ON FUNCTION public.get_slow_queries(NUMERIC) IS
  'Top 50 queries with mean execution > p_min_ms. Requires pg_stat_statements extension. '
  'Run: SELECT * FROM get_slow_queries(50);';

GRANT EXECUTE ON FUNCTION public.get_slow_queries(NUMERIC) TO service_role;

-- Function: sequential scans per table (detects full table scans)
CREATE OR REPLACE FUNCTION public.get_seq_scan_tables()
RETURNS TABLE (
  table_name TEXT,
  seq_scans BIGINT,
  seq_rows_read BIGINT,
  idx_scans BIGINT,
  live_rows BIGINT,
  seq_to_idx_ratio NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    relname::TEXT,
    seq_scan,
    seq_tup_read,
    COALESCE(idx_scan, 0),
    n_live_tup,
    CASE WHEN COALESCE(idx_scan, 0) > 0
      THEN ROUND(seq_scan::numeric / idx_scan, 2)
      ELSE seq_scan::numeric
    END
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND seq_scan > 0
  ORDER BY seq_tup_read DESC
  LIMIT 30;
$$;

COMMENT ON FUNCTION public.get_seq_scan_tables() IS
  'Tables with sequential scans sorted by rows read. High seq_to_idx_ratio = missing index. '
  'Run: SELECT * FROM get_seq_scan_tables();';

GRANT EXECUTE ON FUNCTION public.get_seq_scan_tables() TO service_role;

-- Function: current realtime publication members
CREATE OR REPLACE FUNCTION public.get_realtime_tables()
RETURNS TABLE (table_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pt.tablename::TEXT
  FROM pg_publication_tables pt
  WHERE pt.pubname = 'supabase_realtime'
  ORDER BY pt.tablename;
$$;

COMMENT ON FUNCTION public.get_realtime_tables() IS
  'Lists all tables currently in the supabase_realtime publication. '
  'Run: SELECT * FROM get_realtime_tables();';

GRANT EXECUTE ON FUNCTION public.get_realtime_tables() TO service_role;
