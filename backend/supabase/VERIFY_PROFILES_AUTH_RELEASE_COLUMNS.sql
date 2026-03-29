-- Verify migration 20260327140000_profiles_email_verified_and_release_compliance.sql
-- Run in SQL editor or: psql against local/remote after `supabase db push` / reset.

-- 1) Columns exist on public.profiles
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'email_verified_at',
    'terms_privacy_acknowledged_at',
    'terms_privacy_document_version'
  )
ORDER BY column_name;

-- 2) Index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND indexname = 'idx_profiles_email_pending_verification';

-- 3) Distribution: verified vs pending (email present)
SELECT
  COUNT(*) FILTER (WHERE email IS NOT NULL AND email_verified_at IS NOT NULL) AS email_profiles_verified,
  COUNT(*) FILTER (WHERE email IS NOT NULL AND email_verified_at IS NULL) AS email_profiles_not_verified,
  COUNT(*) FILTER (WHERE email IS NULL) AS no_email_on_profile
FROM public.profiles;

-- 4) Consistency spot-check: profile email_verified_at vs auth.users.email_confirmed_at (sample)
SELECT
  p.id,
  p.email,
  p.email_verified_at AS profile_verified_at,
  u.email_confirmed_at AS auth_confirmed_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email_confirmed_at IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 15;

-- 5) Expectation: for rows where auth has email_confirmed_at, profile.email_verified_at should match after migration
SELECT COUNT(*) AS mismatches_after_backfill
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email_confirmed_at IS NOT NULL
  AND (p.email_verified_at IS DISTINCT FROM u.email_confirmed_at);
