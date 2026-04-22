-- Migration: 20260422180000_fix_diag_views_security_invoker.sql
-- Description: Add WITH (security_invoker = true) to all three diagnostic views
--              to resolve Supabase Security Advisor CRITICAL warnings.
--
-- AGENT NOTE: [2026-04-22] - supabase-dba
--
-- ROOT CAUSE:
--   Supabase Security Advisor flags views that access pg_catalog / information_schema
--   system objects without explicit security_invoker = true. Without it, the view runs
--   with the VIEW OWNER's search_path and permissions, which is considered a potential
--   privilege escalation vector.
--
--   All three views are admin-only diagnostics that query public system views
--   (pg_stat_user_tables, pg_stat_user_indexes, pg_indexes, information_schema).
--   These system views are readable by all roles anyway — security_invoker = true
--   makes this explicit and satisfies the security advisor.
--
-- CHANGES:
--   Recreate v_diag_missing_fk_indexes, v_diag_table_bloat, v_diag_unused_indexes
--   with WITH (security_invoker = true). Query bodies are identical.
--
-- BREAKING CHANGES: None.

-- ============================================================
-- 1. v_diag_missing_fk_indexes
-- ============================================================
CREATE OR REPLACE VIEW public.v_diag_missing_fk_indexes
WITH (security_invoker = true)
AS
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

-- ============================================================
-- 2. v_diag_table_bloat
-- ============================================================
CREATE OR REPLACE VIEW public.v_diag_table_bloat
WITH (security_invoker = true)
AS
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

-- ============================================================
-- 3. v_diag_unused_indexes
-- ============================================================
CREATE OR REPLACE VIEW public.v_diag_unused_indexes
WITH (security_invoker = true)
AS
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
