-- Migration: 20260508140000_push_token_env_isolation.sql
-- Description: Tag every push token with the app environment that issued it
--              so cross-environment senders cannot deliver to the wrong
--              install. Adds metadata columns + index + a one-shot backfill
--              that assumes existing tokens are 'production' (auto-corrected
--              by the mobile app on next foreground sync if not).
--
-- AGENT NOTE: [2026-05-08] - supabase-dba
--   Root cause: dev `send-happy-hour-reminders` dispatched to a token row in
--   the dev DB whose owning install was the prod app, producing a real push
--   that opened the prod build with an unknown gym_id ("gym not found").
--   See review thread + send-push edge function update in this PR for the
--   matching client-side guard and runtime filter.
--
-- CHANGES:
-- - Added column: public.profiles.expo_push_token_env       TEXT (CHECK)
-- - Added column: public.profiles.expo_push_token_bundle    TEXT
-- - Added column: public.profiles.expo_push_token_updated_at TIMESTAMPTZ
-- - Added partial index on expo_push_token_env (only rows with a token)
-- - Backfilled all non-null tokens to 'production' (one-shot, idempotent)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: `savePushToken()` must additionally write
--     expo_push_token_env       = Constants.expoConfig?.extra?.appEnv
--     expo_push_token_bundle    = Constants.expoConfig?.extra?.bundleId
--     expo_push_token_updated_at = NOW()
--   AND must re-write the row when only the env changes (not just the
--   token string). See apps/mobile-app/lib/notifications.ts.
-- - Admin Panel: No changes.
--
-- IMPACT ON BACKEND:
-- - send-push edge function must read `APP_ENV` (Supabase secret) and drop
--   any input token whose stored expo_push_token_env != APP_ENV. Default
--   APP_ENV = 'production' so prod project keeps working without secret
--   configuration; dev Supabase project MUST set APP_ENV='development'
--   in its function secrets for the isolation to take effect there.
--
-- BREAKING CHANGES:
-- - None for prod (backfill = 'production' matches the existing routing).
-- - Dev DB: any prod-issued tokens previously copied into dev profiles will
--   stop receiving dev cron pushes once the dev project sets
--   APP_ENV='development'. They self-correct to the right env on next
--   mobile foreground sync.
--
-- ROLLBACK:
-- - DROP COLUMN expo_push_token_env, expo_push_token_bundle,
--   expo_push_token_updated_at; DROP INDEX idx_profiles_push_token_env.
--   send-push falls back to legacy behavior (ignores missing column).

-- 1. Columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token_env TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_expo_push_token_env_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_expo_push_token_env_check
      CHECK (
        expo_push_token_env IS NULL
        OR expo_push_token_env IN ('production', 'preview', 'development')
      );
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token_bundle TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token_updated_at TIMESTAMPTZ;

-- 2. Backfill: assume existing tokens are production-issued.
--    Mobile clients running the dev/preview build will overwrite this
--    on next foreground sync (savePushToken now re-writes when env differs,
--    not just when the token string differs).
UPDATE public.profiles
   SET expo_push_token_env = 'production',
       expo_push_token_updated_at = COALESCE(expo_push_token_updated_at, NOW())
 WHERE expo_push_token IS NOT NULL
   AND expo_push_token_env IS NULL;

-- 3. Index for the per-send token-env lookup performed by send-push.
CREATE INDEX IF NOT EXISTS idx_profiles_push_token_env
  ON public.profiles(expo_push_token_env)
  WHERE expo_push_token IS NOT NULL;

-- 4. Comments
COMMENT ON COLUMN public.profiles.expo_push_token_env IS
  'App environment that minted the current expo_push_token: production | preview | development. Senders MUST filter by this value to prevent cross-env push leaks.';
COMMENT ON COLUMN public.profiles.expo_push_token_bundle IS
  'Bundle identifier of the app install that minted the current expo_push_token (e.g. com.sweatdrop.app vs com.sweatdrop.app.dev). Diagnostic; senders do not branch on it.';
COMMENT ON COLUMN public.profiles.expo_push_token_updated_at IS
  'Wall-clock timestamp of the last expo_push_token write. Used for staleness audits.';
