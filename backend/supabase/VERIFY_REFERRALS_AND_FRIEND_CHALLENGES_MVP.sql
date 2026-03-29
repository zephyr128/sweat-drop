-- Verify migration 20260327150000_referrals_and_friend_challenges_mvp.sql
-- Run after `supabase db reset` (local) or after migration applied on target DB.

-- 1) Tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('referrals', 'friend_challenges', 'friend_challenge_progress')
ORDER BY table_name;

-- 2) RLS enabled
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('referrals', 'friend_challenges', 'friend_challenge_progress')
ORDER BY c.relname;

-- 3) Referral indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'referrals'
ORDER BY indexname;

-- 4) RPCs registered (public schema)
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_referral_invite',
    'apply_referral_code',
    'evaluate_referral_qualification',
    'create_friend_challenge',
    'respond_friend_challenge',
    'refresh_friend_challenge_scores',
    'cancel_friend_challenge'
  )
ORDER BY p.proname;

-- 5) Helpers should not be executable by PUBLIC (after REVOKE)
SELECT
  p.proname,
  has_function_privilege('anon', p.oid::regprocedure, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid::regprocedure, 'EXECUTE') AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    '_referral_generate_code',
    '_friend_challenge_compute_score',
    '_friend_challenge_credit_winner'
  )
ORDER BY p.proname;

-- Expect: anon_exec = false, auth_exec = false for all three (Supabase roles must exist).
