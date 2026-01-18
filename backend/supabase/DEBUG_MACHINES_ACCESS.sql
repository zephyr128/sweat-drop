-- Debug Machines Access for Gym Owner
-- Run this to check why gym owner can't see machines

-- 1. Check all machines and their gyms
SELECT 
  m.id as machine_id,
  m.name as machine_name,
  m.gym_id,
  g.name as gym_name,
  g.owner_id,
  p.email as owner_email,
  p.role as owner_role,
  m.is_active
FROM public.machines m
LEFT JOIN public.gyms g ON m.gym_id = g.id
LEFT JOIN public.profiles p ON g.owner_id = p.id
ORDER BY m.created_at DESC;

-- 2. Check RLS policies on machines table
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'machines'
ORDER BY policyname;

-- 3. Test if gym owner can see machines (replace USER_ID with actual gym owner ID)
-- SELECT 
--   m.id,
--   m.name,
--   m.gym_id
-- FROM public.machines m
-- WHERE EXISTS (
--   SELECT 1 FROM public.gyms
--   WHERE id = m.gym_id
--   AND owner_id = 'USER_ID'
-- );

-- 4. Check if is_gym_owner function works
-- SELECT 
--   public.is_gym_owner('USER_ID') as is_owner;

-- 5. Count machines per gym
SELECT 
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  COUNT(m.id) as machine_count
FROM public.gyms g
LEFT JOIN public.machines m ON m.gym_id = g.id
GROUP BY g.id, g.name, g.owner_id
ORDER BY machine_count DESC;
