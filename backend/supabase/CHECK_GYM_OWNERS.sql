-- Check Gym Owners in Database
-- Run this to see what gym owners exist and their status

-- 1. Check all profiles with gym_owner role
SELECT 
  id,
  email,
  username,
  full_name,
  role,
  owner_id,
  assigned_gym_id,
  created_at
FROM public.profiles
WHERE role = 'gym_owner'
ORDER BY created_at DESC;

-- 2. Check all gyms and their owners
SELECT 
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  p.email as owner_email,
  p.username as owner_username,
  p.role as owner_role,
  g.status as gym_status
FROM public.gyms g
LEFT JOIN public.profiles p ON g.owner_id = p.id
ORDER BY g.created_at DESC;

-- 3. Count gym owners vs gyms
SELECT 
  (SELECT COUNT(*) FROM public.profiles WHERE role = 'gym_owner') as total_gym_owners,
  (SELECT COUNT(*) FROM public.gyms) as total_gyms,
  (SELECT COUNT(*) FROM public.gyms WHERE owner_id IS NOT NULL) as gyms_with_owners;

-- 4. Check if there are any gyms without owners
SELECT 
  id,
  name,
  city,
  country,
  owner_id,
  status
FROM public.gyms
WHERE owner_id IS NULL;
