-- AUTO ADMIN SETUP - Creates admin for the first user in auth.users
-- WARNING: This will make the FIRST user in your auth.users table a superadmin
-- Use with caution! Better to use SEED_ADMIN_QUICK.sql with a specific user ID
--
-- IMPORTANT: This script only updates the profile. You MUST create the user in
-- Supabase Auth Dashboard first (Authentication → Users → Add user)
-- Otherwise you won't be able to login because there's no email/password!

-- This script finds the first user and makes them superadmin
DO $$
DECLARE
  first_user_id UUID;
  first_user_email TEXT;
BEGIN
  -- Get the first user (by created_at)
  SELECT id, email INTO first_user_id, first_user_email
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Please create a user first:
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user" → "Create new user"
3. Enter email and password
4. Check "Auto Confirm User"
5. Click "Create user"
6. Then run this script again.';
  END IF;

  -- Create or update profile
  INSERT INTO public.profiles (id, email, username, role, admin_gym_id, total_drops)
  VALUES (
    first_user_id,
    first_user_email,
    COALESCE(split_part(first_user_email, '@', 1), 'admin'),
    'superadmin',
    NULL,
    0
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    role = 'superadmin',
    admin_gym_id = NULL,
    email = EXCLUDED.email;

  RAISE NOTICE 'User % (%) has been set as superadmin. You can now login with email: %', 
    first_user_email, first_user_id, first_user_email;
END $$;

-- Verify - shows both auth user and profile
SELECT 
  p.id,
  p.email as profile_email,
  p.username,
  p.role,
  u.email as auth_email,
  u.confirmed_at,
  CASE 
    WHEN u.id IS NULL THEN '❌ No auth user - cannot login!'
    WHEN u.confirmed_at IS NULL THEN '⚠️ User not confirmed - check Auto Confirm'
    ELSE '✅ Ready to login'
  END as status
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE p.role = 'superadmin';
