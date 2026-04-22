-- Migration: 20260422160000_prod_performance_hardening.sql
-- Description: Production performance hardening — duplicate index cleanup,
--              3 missing hot-path indexes, and autovacuum tuning for high-write tables.
--
-- AGENT NOTE: [2026-04-22] - supabase-dba
--
-- ANALYSIS (diagnostic run on sweat-drop-prod-v2 immediately after migration push):
--
-- 1. DUPLICATE INDEXES (wasted write I/O on every INSERT/UPDATE):
--    sessions:     idx_sessions_gym_started_at == idx_sessions_gym_started
--                  both: USING btree (gym_id, started_at DESC) — planner picks one, other is dead weight
--    gym_checkins: idx_gym_checkins_gym_checked_at == idx_gym_checkins_gym
--                  both: USING btree (gym_id, checked_in_at DESC) — same situation
--
-- 2. MISSING INDEXES (seq scans confirmed by get_seq_scan_tables()):
--    tokenomics_config: seq_to_idx_ratio 17x — query "WHERE gym_id IS NULL" does full scan
--                       because B-tree unique index on gym_id does NOT index NULL values.
--                       The global default config row is fetched on EVERY award_drops call.
--    leaderboard_live_scores: user_id FK has no leading index — PK is (gym_id, user_id),
--                             so user-first lookups (wallet/profile) cannot use it.
--    gym_checkins: streak calculation query pattern:
--                  WHERE user_id = $1 AND gym_id = $2 ORDER BY checked_in_at DESC LIMIT 1
--                  hits only idx_gym_checkins_user(user_id, checked_in_at DESC) which requires
--                  filtering gym_id in a second pass. Composite covering index fixes this.
--
-- 3. AUTOVACUUM (not configured on any table — Postgres defaults kick in at 20% dead tuples):
--    At production scale (sessions, drops, checkins written every workout):
--    - Default: vacuum after 20% dead tuples, analyze after 10% row changes
--    - Hot tables need: vacuum after 1-2%, analyze after 0.5-1%
--    - Without this: planner stats go stale, bloat accumulates, index quality degrades
--
-- CHANGES:
--   DROP: idx_sessions_gym_started_at (duplicate)
--   DROP: idx_gym_checkins_gym_checked_at (duplicate)
--   ADD:  idx_tokenomics_config_global — partial on tokenomics_config WHERE gym_id IS NULL
--   ADD:  idx_lb_live_scores_user — leaderboard_live_scores(user_id)
--   ADD:  idx_gym_checkins_user_gym_at — gym_checkins(user_id, gym_id, checked_in_at DESC)
--   SET:  autovacuum aggressive settings on 6 high-write tables
--   RUN:  ANALYZE on all newly indexed/affected tables
--
-- IMPACT ON FRONTEND:
--   Mobile App: Faster award_drops (tokenomics config lookup), faster streak check,
--               faster leaderboard user lookup
--   Admin Panel: No changes needed
--
-- BREAKING CHANGES: None — DROP INDEX is instant in Postgres (no table lock)
--
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. DROP DUPLICATE INDEXES
--    Safe: Postgres DROP INDEX does not lock the table (CONCURRENTLY not needed
--    on empty prod, but IF EXISTS guards against any race)
-- ============================================================

-- sessions: keep idx_sessions_gym_started, drop the alias
DROP INDEX IF EXISTS public.idx_sessions_gym_started_at;

-- gym_checkins: keep idx_gym_checkins_gym, drop the alias
DROP INDEX IF EXISTS public.idx_gym_checkins_gym_checked_at;

-- ============================================================
-- 2. MISSING INDEX: tokenomics_config global default
--    NULL values are not stored in B-tree indexes — the existing
--    UNIQUE INDEX ON tokenomics_config(gym_id) does not cover NULL gym_id rows.
--    Every award_drops call fetches the global config with WHERE gym_id IS NULL.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tokenomics_config_global
  ON public.tokenomics_config (id)
  WHERE gym_id IS NULL;

-- ============================================================
-- 3. MISSING INDEX: leaderboard_live_scores user-leading
--    PK is (gym_id, user_id) — covers gym-first queries only.
--    User profile page and wallet queries need user_id as leading column.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lb_live_scores_user
  ON public.leaderboard_live_scores (user_id);

-- ============================================================
-- 4. MISSING INDEX: gym_checkins composite for streak calculation
--    Streak calculation: WHERE user_id = $1 AND gym_id = $2 ORDER BY checked_in_at DESC LIMIT 1
--    Current idx_gym_checkins_user(user_id, checked_in_at DESC) can't filter gym_id inline.
--    This composite index covers the full predicate in one index scan.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gym_checkins_user_gym_at
  ON public.gym_checkins (user_id, gym_id, checked_in_at DESC);

-- ============================================================
-- 5. AUTOVACUUM TUNING — high-write production tables
--
--    Rationale:
--    - Postgres default: vacuum after 20% dead tuples (autovacuum_vacuum_scale_factor = 0.20)
--    - At 1000 sessions/day: 200 dead tuples before vacuum kicks in — acceptable
--    - At 10k sessions/day: 2000 dead tuples before vacuum — index quality degrades
--    - autovacuum_vacuum_scale_factor = 0.01 → vacuum after 1% dead tuples
--    - autovacuum_analyze_scale_factor = 0.005 → analyze after 0.5% changes
--    - autovacuum_vacuum_cost_delay = 2 → less I/O throttling on hot tables
--      (default is 2ms, but explicitly setting it prevents inheritance from GUC resets)
--
--    These are per-table storage parameters — they override the global GUC for
--    these specific tables only and are persisted in pg_class.reloptions.
-- ============================================================

-- sessions: written once per workout start + updated every drop award
ALTER TABLE public.sessions SET (
  autovacuum_vacuum_scale_factor   = 0.01,
  autovacuum_analyze_scale_factor  = 0.005,
  autovacuum_vacuum_cost_delay     = 2
);

-- drops_transactions: appended on every drop award (hottest append-heavy table)
ALTER TABLE public.drops_transactions SET (
  autovacuum_vacuum_scale_factor   = 0.01,
  autovacuum_analyze_scale_factor  = 0.005,
  autovacuum_vacuum_cost_delay     = 2
);

-- leaderboard_live_scores: upserted on every drop award (high UPDATE rate)
ALTER TABLE public.leaderboard_live_scores SET (
  autovacuum_vacuum_scale_factor   = 0.02,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_vacuum_cost_delay     = 2
);

-- challenge_progress: upserted on every drop award and checkin
ALTER TABLE public.challenge_progress SET (
  autovacuum_vacuum_scale_factor   = 0.02,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_vacuum_cost_delay     = 2
);

-- gym_checkins: one row per gym visit; low volume but streak-critical
ALTER TABLE public.gym_checkins SET (
  autovacuum_vacuum_scale_factor   = 0.02,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_vacuum_cost_delay     = 2
);

-- pending_session_side_effects: high-churn (insert + processed_at update per session end)
ALTER TABLE public.pending_session_side_effects SET (
  autovacuum_vacuum_scale_factor   = 0.01,
  autovacuum_analyze_scale_factor  = 0.005,
  autovacuum_vacuum_cost_delay     = 2
);

-- drop_limit_counters: updated on every drop award to enforce daily/weekly caps
ALTER TABLE public.drop_limit_counters SET (
  autovacuum_vacuum_scale_factor   = 0.02,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_vacuum_cost_delay     = 2
);

-- ============================================================
-- 6. ANALYZE — refresh planner statistics on affected tables
--    Fresh prod project has cold stats; also catches newly indexed tables.
-- ============================================================

ANALYZE public.tokenomics_config;
ANALYZE public.leaderboard_live_scores;
ANALYZE public.gym_checkins;
ANALYZE public.sessions;
ANALYZE public.drops_transactions;
ANALYZE public.challenge_progress;
ANALYZE public.pending_session_side_effects;
ANALYZE public.drop_limit_counters;
ANALYZE public.gym_memberships;
ANALYZE public.profiles;
ANALYZE public.rewards;
ANALYZE public.redemptions;
ANALYZE public.gym_challenges;
ANALYZE public.sweat_arenas;
ANALYZE public.arena_participants;
