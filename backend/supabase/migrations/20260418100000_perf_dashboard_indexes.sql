-- Migration: 20260418100000_perf_dashboard_indexes.sql
-- Description: Missing indexes for get_gym_dashboard_overview performance (Step 2).
--
-- AGENT NOTE: 2026-04-18 — supabase-dba
-- Plan: docs/plans/perf_gym_dashboard_rpc.md — Step 2
--
-- ANALYSIS:
--   After reading the full RPC body (20260326000002), three index gaps remain:
--
--   1. redemptions (gym_id, status, confirmed_at DESC)
--      The RPC filters: gym_id=? AND status='confirmed' AND confirmed_at >= today_start.
--      The existing idx_redemptions_gym_status only covers (gym_id, status).
--      Adding confirmed_at lets Postgres apply the date predicate without a heap scan.
--
--   2. drops_transactions (gym_id, created_at DESC) WHERE amount > 0
--      Two window-aggregation queries filter: gym_id=? AND amount>0 AND
--      transaction_type IN (...) AND created_at BETWEEN prev_window AND now.
--      idx_drops_transactions_gym_created (gym_id, created_at DESC) exists but is NOT
--      partial — it includes all rows including refunds/deductions (amount <= 0).
--      A partial index shrinks the index by ~30-50% on typical datasets and lets
--      the planner skip all negative-amount rows immediately.
--
--   3. drops_transactions (gym_id, user_id) WHERE amount > 0
--      The top-performers subquery aggregates SUM(amount) per user across ALL time
--      for a given gym. idx_drops_tx_user_gym_positive is keyed (user_id, gym_id) —
--      the wrong leading column for a gym-scoped scan. A (gym_id, user_id) partial
--      index with an amount INCLUDE lets the planner do a pure index-only scan for
--      the GROUP BY user_id without touching heap pages.
--
-- EXISTING INDEXES (confirmed, no duplication needed):
--   idx_sessions_gym_started_at        (gym_id, started_at DESC)      ✅
--   idx_sessions_gym_active_updated    (gym_id, is_active, updated_at) ✅
--   idx_gym_checkins_gym_checked_at    (gym_id, checked_in_at DESC)    ✅
--   idx_redemptions_gym_status         (gym_id, status)               ✅
--   idx_drops_transactions_gym_created (gym_id, created_at DESC)      ✅ (not partial)
--   idx_fraud_events_gym_unresolved    partial WHERE resolved_at IS NULL ✅
--   idx_economy_snapshots_gym_date     (gym_id, snapshot_date DESC)   ✅
--
-- IMPACT ON FRONTEND: None — pure backend performance.
-- BREAKING CHANGES: None.
--
-- NOTE: Supabase db push wraps migrations in a pipeline context that does NOT
--       support CREATE INDEX CONCURRENTLY. Using plain CREATE INDEX instead.
--       Each index creation takes a brief ShareLock — apply during a low-traffic
--       window if the tables are large (sessions, drops_transactions).

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. redemptions: cover the "confirmed today" query
--    Pattern: WHERE gym_id = ? AND status = 'confirmed' AND confirmed_at >= ?
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_redemptions_gym_status_confirmed_at
  ON public.redemptions (gym_id, status, confirmed_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. drops_transactions: partial index for positive-amount window aggregations
--    Pattern: WHERE gym_id = ? AND amount > 0 AND created_at BETWEEN ? AND ?
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_drops_tx_gym_created_positive
  ON public.drops_transactions (gym_id, created_at DESC)
  WHERE amount > 0;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. drops_transactions: gym-leading partial index for top-performers aggregation
--    INCLUDE (amount) → index-only scan for the GROUP BY SUM(amount).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_drops_tx_gym_user_positive
  ON public.drops_transactions (gym_id, user_id)
  INCLUDE (amount)
  WHERE amount > 0;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. gym_memberships: cover the members-count join
--    (gym_id, user_id) → index-only scan, then probe profiles for role check.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gym_memberships_gym_user
  ON public.gym_memberships (gym_id, user_id);

COMMIT;
