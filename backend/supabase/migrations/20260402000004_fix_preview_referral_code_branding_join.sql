-- Fix preview_referral_code: gyms no longer has logo_url / primary_color.
-- Branding was migrated to owner_branding in 20240101000034.
-- Join gyms → owner_branding to get logo_url and primary_color.

CREATE OR REPLACE FUNCTION public.preview_referral_code(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(p_invite_code));
  v_ref  RECORD;
  v_gym  RECORD;
  v_brand RECORD;
  v_referrer RECORD;
BEGIN
  IF v_code IS NULL OR length(v_code) < 4 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT r.id, r.gym_id, r.referrer_user_id, r.status,
         r.invitee_user_id, r.expires_at
  INTO v_ref
  FROM public.referrals r
  WHERE r.invite_code = v_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_ref.status = 'blocked' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_ref.status = 'expired'
     OR (v_ref.expires_at IS NOT NULL AND v_ref.expires_at < NOW()) THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF v_ref.invitee_user_id IS NOT NULL OR v_ref.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'used');
  END IF;

  SELECT g.id, g.name, g.city, g.owner_id
  INTO v_gym
  FROM public.gyms g
  WHERE g.id = v_ref.gym_id;

  -- Branding lives in owner_branding (unified since migration 20240101000034)
  SELECT ob.logo_url, ob.primary_color
  INTO v_brand
  FROM public.owner_branding ob
  WHERE ob.owner_id = v_gym.owner_id;

  SELECT p.username, p.full_name
  INTO v_referrer
  FROM public.profiles p
  WHERE p.id = v_ref.referrer_user_id;

  RETURN jsonb_build_object(
    'status',            'valid',
    'gym_id',            v_ref.gym_id,
    'gym_name',          COALESCE(v_gym.name, ''),
    'gym_city',          v_gym.city,
    'gym_logo_url',      v_brand.logo_url,
    'gym_primary_color', v_brand.primary_color,
    'referrer_name',     COALESCE(v_referrer.full_name, v_referrer.username)
  );
END;
$$;
