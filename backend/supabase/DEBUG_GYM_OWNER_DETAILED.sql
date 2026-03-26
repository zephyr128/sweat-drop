-- Detailed debug query for gym_owner bucket access issue
-- Run this in Supabase SQL Editor while logged in as gym_owner

-- 1. Check your profile and role
SELECT 
  'Profile Check' as check_type,
  p.id as user_id,
  p.email,
  p.role,
  p.admin_gym_id,
  CASE 
    WHEN p.role = 'gym_owner' THEN '✓ Role is gym_owner'
    ELSE '✗ Role is NOT gym_owner: ' || p.role
  END as role_check
FROM public.profiles p
WHERE p.id = auth.uid();

-- 2. Check gym ownership for the specific gym_id
SELECT 
  'Gym Ownership Check' as check_type,
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  auth.uid() as current_user_id,
  CASE 
    WHEN g.owner_id = auth.uid() THEN '✓ You ARE the owner'
    WHEN g.owner_id IS NULL THEN '✗ Gym has no owner_id set'
    ELSE '✗ Gym owner_id (' || g.owner_id::text || ') does NOT match your user_id'
  END as ownership_check
FROM public.gyms g
WHERE g.id = '4074dffe-6df8-4070-b560-5be794977bff';

-- 3. Test the exact RLS policy logic step by step
SELECT 
  'RLS Policy Logic Test' as check_type,
  -- Step 1: Check if user is gym_owner
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'gym_owner'
  ) as is_gym_owner_role,
  -- Step 2: Check if gym exists and user is owner
  EXISTS (
    SELECT 1 FROM public.gyms g
    WHERE g.owner_id = auth.uid()
    AND g.id = '4074dffe-6df8-4070-b560-5be794977bff'
  ) as is_gym_owner,
  -- Step 3: Combined check (what RLS policy uses)
  EXISTS (
    SELECT 1 FROM public.gyms g
    WHERE g.owner_id = auth.uid()
    AND g.id::text = '4074dffe-6df8-4070-b560-5be794977bff'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'gym_owner'
    )
  ) as combined_check_result;

-- 4. List ALL gyms you own (to see what gym_ids you can use)
SELECT 
  'Your Owned Gyms' as check_type,
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  'Use this ID in path: ' || g.id::text || '/filename.png' as upload_path_example
FROM public.gyms g
WHERE g.owner_id = auth.uid();

-- 5. Check if there's a mismatch in UUID format
SELECT 
  'UUID Format Check' as check_type,
  '4074dffe-6df8-4070-b560-5be794977bff'::uuid as test_gym_id,
  g.id as actual_gym_id,
  g.owner_id as actual_owner_id,
  auth.uid() as your_user_id,
  CASE 
    WHEN g.id = '4074dffe-6df8-4070-b560-5be794977bff'::uuid THEN '✓ Gym ID matches'
    ELSE '✗ Gym ID does NOT match'
  END as id_match,
  CASE 
    WHEN g.owner_id = auth.uid() THEN '✓ Owner ID matches'
    WHEN g.owner_id IS NULL THEN '✗ Owner ID is NULL'
    ELSE '✗ Owner ID does NOT match'
  END as owner_match
FROM public.gyms g
WHERE g.id = '4074dffe-6df8-4070-b560-5be794977bff'::uuid;
