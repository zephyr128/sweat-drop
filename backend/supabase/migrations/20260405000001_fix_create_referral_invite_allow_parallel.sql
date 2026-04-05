-- Migration: 20260405000001_fix_create_referral_invite_allow_parallel.sql
-- Description: Allow users to generate a new invite code even when a previous
--              referral is already in progress (invitee accepted but hasn't
--              completed the journey yet).
--
-- PROBLEM:
--   The old logic blocked new code generation if ANY active/pending referral
--   with an invitee existed. This meant: if a friend accepted your link but
--   never did their first check-in, you were permanently locked out from
--   inviting anyone else.
--
-- FIX:
--   Only reuse an existing code when it is still truly "fresh" (pending +
--   no invitee). In all other cases, generate a brand-new code freely.
--   Multiple in-flight referrals are fine — the monthly payout cap (5) is
--   the actual business-side limit, not the ability to share.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: 'active_referral_in_progress' error is no longer returned.
--     The invite screen will always receive a valid code.
--   - Admin Panel: No change.
--
-- BREAKING CHANGES: None

CREATE OR REPLACE FUNCTION public.create_referral_invite(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid        UUID := auth.uid();
  v_row        public.referrals%ROWTYPE;
  v_fresh      public.referrals%ROWTYPE;
  v_code       TEXT;
  v_expiry_d   INT;
  v_join_url   TEXT;
  v_deep_link  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_memberships m
    WHERE m.user_id = v_uid AND m.gym_id = p_gym_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_gym_member');
  END IF;

  -- Look for a "fresh" pending code that hasn't been claimed yet.
  -- We can safely reuse it — no one has accepted it, so sharing it again
  -- with a different person is perfectly fine.
  SELECT * INTO v_fresh
  FROM public.referrals r
  WHERE r.referrer_user_id = v_uid
    AND r.gym_id            = p_gym_id
    AND r.status            = 'pending'
    AND r.invitee_user_id   IS NULL
    AND (r.expires_at IS NULL OR r.expires_at > NOW())
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_join_url  := 'https://sweat-drop.com/join/' || v_fresh.invite_code;
    v_deep_link := 'sweatdrop://join/'             || v_fresh.invite_code;
    RETURN jsonb_build_object(
      'success',     true,
      'referral_id', v_fresh.id,
      'invite_code', v_fresh.invite_code,
      'join_url',    v_join_url,
      'deep_link',   v_deep_link,
      'expires_at',  v_fresh.expires_at,
      'status',      v_fresh.status,
      'reused',      true
    );
  END IF;

  -- No fresh code available — generate a new one.
  -- Any existing in-progress referrals continue independently; the monthly
  -- payout cap ensures the user can't farm unlimited rewards.
  v_expiry_d := COALESCE(
    (SELECT (value#>>'{}')::INT FROM public.app_runtime_flags WHERE key = 'referral_expiry_days'),
    30
  );
  v_code := public._referral_generate_code();

  INSERT INTO public.referrals (gym_id, referrer_user_id, invite_code, status, expires_at)
  VALUES (p_gym_id, v_uid, v_code, 'pending', NOW() + (v_expiry_d || ' days')::INTERVAL)
  RETURNING * INTO v_row;

  v_join_url  := 'https://sweat-drop.com/join/' || v_row.invite_code;
  v_deep_link := 'sweatdrop://join/'             || v_row.invite_code;

  RETURN jsonb_build_object(
    'success',     true,
    'referral_id', v_row.id,
    'invite_code', v_row.invite_code,
    'join_url',    v_join_url,
    'deep_link',   v_deep_link,
    'expires_at',  v_row.expires_at,
    'status',      v_row.status,
    'reused',      false
  );
END;
$fn$;

COMMENT ON FUNCTION public.create_referral_invite(UUID) IS
  'Returns a shareable invite code for the calling user at the given gym.
   Reuses an unclaimed pending code if one exists; otherwise creates a new one.
   Multiple in-flight referrals are allowed — monthly payout cap enforces limits.';
