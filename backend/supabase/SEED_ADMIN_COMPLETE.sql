-- COMPLETE ADMIN SETUP
-- This script helps you create a complete admin user with email and password
-- 
-- IMPORTANT: You cannot create auth users via SQL in Supabase
-- You MUST create the user in Supabase Dashboard first, then run this script
--
-- STEP-BY-STEP:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" → "Create new user"
-- 3. Enter:
--    - Email: admin@sweatdrop.com (or your email)
--    - Password: (choose a strong password)
--    - Auto Confirm User: ✅ (CHECK THIS!)
-- 4. Click "Create user"
-- 5. Copy the User ID that appears
-- 6. Run the SQL below, replacing 'YOUR_USER_ID_HERE' with the copied ID

-- After creating user in Dashboard, run this:
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL,
  email = (SELECT email FROM auth.users WHERE id = 'YOUR_USER_ID_HERE')
WHERE id = 'YOUR_USER_ID_HERE';

-- If profile doesn't exist yet, create it:
INSERT INTO public.profiles (id, email, username, role, admin_gym_id, total_drops)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1), 'admin'),
  'superadmin',
  NULL,
  0
FROM auth.users
WHERE id = 'YOUR_USER_ID_HERE'
ON CONFLICT (id) DO UPDATE
SET 
  role = 'superadmin',
  admin_gym_id = NULL,
  email = EXCLUDED.email;

-- Verify:
SELECT 
  p.id,
  p.email,
  p.username,
  p.role,
  u.email as auth_email,
  u.confirmed_at
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.role = 'superadmin';
