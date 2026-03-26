-- Fix gym_owner access - Run this in Supabase SQL Editor
-- Replace 'YOUR_USER_ID' with your actual user ID from auth.users

-- Option 1: If you want to be owner of the gym
-- Replace '4074dffe-6df8-4070-b560-5be794977bff' with the gym ID you want to own
UPDATE public.gyms
SET owner_id = auth.uid()  -- Or use: 'YOUR_USER_ID'::uuid
WHERE id = '4074dffe-6df8-4070-b560-5be794977bff';

-- Option 2: If you want to use admin_gym_id instead
-- This sets your admin_gym_id so you can use it in the path
UPDATE public.profiles
SET admin_gym_id = '4074dffe-6df8-4070-b560-5be794977bff'::uuid
WHERE id = auth.uid();  -- Or use: 'YOUR_USER_ID'::uuid

-- Verify the changes
SELECT 
  p.id as user_id,
  p.role,
  p.admin_gym_id,
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  CASE 
    WHEN g.owner_id = p.id THEN '✓ You are owner of this gym'
    WHEN p.admin_gym_id = g.id THEN '✓ You have admin_gym_id set for this gym'
    ELSE '✗ You are NOT owner and admin_gym_id is NOT set'
  END as access_status
FROM public.profiles p
CROSS JOIN public.gyms g
WHERE p.id = auth.uid()  -- Or use: 'YOUR_USER_ID'::uuid
  AND g.id = '4074dffe-6df8-4070-b560-5be794977bff';
