-- Migration: 20260402000002_cleanup_stale_push_tokens.sql
-- Description: One-time cleanup of push tokens for users who have not signed in
--              for 90+ days. Prevents logged-out/dormant users from receiving
--              push notifications.
--
-- AGENT NOTE: [2026-04-02] - supabase-dba
--
-- CHANGES:
-- - One-time UPDATE: clears expo_push_token for users inactive 90+ days
--
-- IMPACT ON FRONTEND:
-- - Mobile App: authStore.ts must clear push token on logout (Step 1 of Bug #3)
--   and send-push Edge Function should handle DeviceNotRegistered receipts (Step 3)
-- - Admin Panel: No changes
--
-- BREAKING CHANGES:
-- - None — affected users will re-register their token on next login

-- Clear push tokens for users who haven't signed in for 90+ days.
-- We join auth.users (via SECURITY DEFINER context) to check last_sign_in_at.
-- This is idempotent — already-NULL tokens are not affected.
UPDATE public.profiles p
SET expo_push_token = NULL
FROM auth.users u
WHERE p.id                  = u.id
  AND p.expo_push_token     IS NOT NULL
  AND u.last_sign_in_at     < NOW() - INTERVAL '90 days';
