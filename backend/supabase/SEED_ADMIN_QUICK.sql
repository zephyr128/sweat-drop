-- QUICK ADMIN SETUP
-- Run this after creating a user in Supabase Auth Dashboard

-- STEP 1: Create user in Supabase Auth Dashboard first:
-- 1. Go to Authentication → Users → Add user
-- 2. Enter email and password
-- 3. Check "Auto Confirm User"
-- 4. Copy the User ID

-- STEP 2: Replace 'YOUR_USER_ID_HERE' below with the actual User ID from Step 1
-- Then run this entire script

-- Option A: If profile already exists, just update role
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL
WHERE id = 'YOUR_USER_ID_HERE';

-- Option B: If profile doesn't exist, create it
-- (Replace YOUR_USER_ID_HERE and your-email@example.com)
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
  admin_gym_id = NULL;

-- Verify it worked:
SELECT id, email, username, role, admin_gym_id 
FROM public.profiles 
WHERE role = 'superadmin';
