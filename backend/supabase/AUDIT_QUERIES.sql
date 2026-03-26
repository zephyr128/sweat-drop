-- Database Audit Queries
-- Run these in Supabase SQL Editor

-- A — All tables and row counts
SELECT
  schemaname,
  tablename,
  n_live_tup AS row_count,
  n_dead_tup AS dead_rows,
  last_autoanalyze,
  last_autovacuum
FROM pg_stat_user_tables
ORDER BY schemaname, tablename;

-- B — All functions in public schema
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  obj_description(p.oid, 'pg_proc') AS description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- C — All views in public schema
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- D — Unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS times_used,
  idx_tup_read AS tuples_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey'  -- exclude PKs
  AND indexname NOT LIKE '%_key'   -- exclude unique constraints
ORDER BY pg_relation_size(indexrelid) DESC;

-- E — All columns in all tables
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- F — Foreign key relationships
SELECT
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- G — RLS policies
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- H — Enum types
SELECT
  t.typname AS enum_name,
  e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- I — Table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(
    quote_ident(tablename)
  )) AS total_size,
  pg_size_pretty(pg_relation_size(
    quote_ident(tablename)
  )) AS table_size,
  pg_size_pretty(
    pg_total_relation_size(quote_ident(tablename))
    - pg_relation_size(quote_ident(tablename))
  ) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(quote_ident(tablename)) DESC;

-- J — Extensions installed
SELECT
  extname,
  extversion,
  obj_description(oid, 'pg_extension') AS description
FROM pg_extension
ORDER BY extname;

-- Additional specific queries

-- Check user_badges FK usage
SELECT
  COUNT(*) AS total_badges,
  COUNT(challenge_id) AS has_challenge_id,
  COUNT(gym_challenge_id) AS has_gym_challenge_id,
  COUNT(global_achievement_id) AS has_global_achievement_id
FROM user_badges;

-- Check if old challenges table exists
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'challenges';

-- Check incorrect_challenge_rewards view
SELECT COUNT(*) FROM incorrect_challenge_rewards;

-- Check if add_drops function exists
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'add_drops'
  AND pronamespace = 'public'::regnamespace;
