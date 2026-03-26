-- Verify gym owner sync - Run this in Supabase SQL Editor
-- This checks if admin_gym_id is synced for gym owners

-- 1. Check all gym owners and their admin_gym_id
SELECT 
  p.id as user_id,
  p.email,
  p.role,
  p.admin_gym_id as profile_admin_gym_id,
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id as gym_owner_id,
  CASE 
    WHEN g.owner_id = p.id AND p.admin_gym_id = g.id THEN '✓ Synced correctly'
    WHEN g.owner_id = p.id AND p.admin_gym_id IS NULL THEN '✗ admin_gym_id is NULL (should be ' || g.id::text || ')'
    WHEN g.owner_id = p.id AND p.admin_gym_id != g.id THEN '✗ admin_gym_id mismatch (is ' || p.admin_gym_id::text || ', should be ' || g.id::text || ')'
    ELSE '✗ Not owner of this gym'
  END as sync_status
FROM public.profiles p
LEFT JOIN public.gyms g ON g.owner_id = p.id
WHERE p.role = 'gym_owner'
ORDER BY p.email;

-- 2. Check your specific case
SELECT 
  'Your Profile' as check_type,
  p.id as user_id,
  p.role,
  p.admin_gym_id,
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  CASE 
    WHEN g.owner_id = p.id THEN '✓ You ARE owner'
    ELSE '✗ You are NOT owner'
  END as ownership_status,
  CASE 
    WHEN p.admin_gym_id = g.id THEN '✓ admin_gym_id is synced'
    WHEN p.admin_gym_id IS NULL THEN '✗ admin_gym_id is NULL'
    ELSE '✗ admin_gym_id mismatch'
  END as sync_status
FROM public.profiles p
LEFT JOIN public.gyms g ON g.id = '4074dffe-6df8-4070-b560-5be794977bff'
WHERE p.id = auth.uid();

-- 3. Manual fix if needed (replace YOUR_USER_ID with your actual user ID)
-- UPDATE public.profiles
-- SET admin_gym_id = '4074dffe-6df8-4070-b560-5be794977bff'::uuid
-- WHERE id = 'YOUR_USER_ID'::uuid
--   AND role = 'gym_owner';
