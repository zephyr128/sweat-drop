-- Seed Admin User for SweatDrop Admin Panel
-- This script creates a superadmin user that can access the admin dashboard

-- Step 1: Create a test user in auth.users (if using Supabase Auth)
-- Note: In production, users should sign up through the app
-- For development, you can create a user manually in Supabase Auth dashboard
-- or use the Supabase CLI: supabase auth users create

-- Step 2: After creating the user in auth.users, update their profile
-- Replace 'YOUR_USER_ID_HERE' with the actual user ID from auth.users

-- Example: Get your user ID from Supabase Auth dashboard or run:
-- SELECT id, email FROM auth.users;

-- Step 3: Update the profile to be superadmin
-- Replace the UUID below with your actual user ID

-- Option A: If you already have a user, just update their role
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL  -- Superadmin doesn't need admin_gym_id
WHERE email = 'admin@sweatdrop.com';  -- Replace with your email

-- Option B: If you need to create a profile for an existing auth user
-- First, get your user ID from auth.users, then run:
/*
INSERT INTO public.profiles (id, email, username, role, admin_gym_id)
VALUES (
  'YOUR_USER_ID_FROM_AUTH_USERS',  -- Replace with actual user ID
  'admin@sweatdrop.com',           -- Your email
  'admin',                         -- Username
  'superadmin',                     -- Role
  NULL                              -- No admin_gym_id for superadmin
)
ON CONFLICT (id) DO UPDATE
SET 
  role = 'superadmin',
  admin_gym_id = NULL;
*/

-- Option C: Create a complete test setup with gym and gym admin
-- This creates a test gym and assigns a user as gym_admin

-- 1. Create a test gym
INSERT INTO public.gyms (id, name, city, country, address)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Gym',
  'Belgrade',
  'Serbia',
  '123 Test Street'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create gym branding
INSERT INTO public.gym_branding (gym_id, primary_color, logo_url, background_url)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '#00E5FF',
  NULL,
  NULL
)
ON CONFLICT (gym_id) DO NOTHING;

-- 3. Update a user to be gym_admin for the test gym
-- Replace 'YOUR_USER_ID_HERE' with actual user ID
/*
UPDATE public.profiles
SET 
  role = 'gym_admin',
  admin_gym_id = '00000000-0000-0000-0000-000000000001'
WHERE email = 'gymadmin@sweatdrop.com';  -- Replace with your email
*/

-- Verification queries:
-- Check if user is superadmin:
-- SELECT id, email, username, role, admin_gym_id FROM public.profiles WHERE role = 'superadmin';

-- Check all admin users:
-- SELECT id, email, username, role, admin_gym_id FROM public.profiles WHERE role IN ('superadmin', 'gym_admin', 'receptionist');

-- Check gyms:
-- SELECT id, name, city, country FROM public.gyms;
