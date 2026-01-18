-- Debug Owners and Gyms Relationship
-- Run this to check why owners page shows 0 gyms

-- 1. Check all gym owners
SELECT 
  p.id as owner_id,
  p.email,
  p.username,
  p.role,
  COUNT(g.id) as gym_count
FROM public.profiles p
LEFT JOIN public.gyms g ON g.owner_id = p.id
WHERE p.role = 'gym_owner'
GROUP BY p.id, p.email, p.username, p.role
ORDER BY gym_count DESC;

-- 2. Check all gyms and their owners
SELECT 
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  p.email as owner_email,
  p.username as owner_username,
  p.role as owner_role,
  g.status
FROM public.gyms g
LEFT JOIN public.profiles p ON g.owner_id = p.id
ORDER BY g.created_at DESC;

-- 3. Test the join query used in Owners page
SELECT 
  p.id,
  p.email,
  p.username,
  p.full_name,
  p.created_at,
  json_agg(
    json_build_object(
      'id', g.id,
      'name', g.name,
      'city', g.city,
      'country', g.country,
      'status', g.status,
      'subscription_type', g.subscription_type,
      'created_at', g.created_at
    )
  ) as gyms
FROM public.profiles p
LEFT JOIN public.gyms g ON g.owner_id = p.id
WHERE p.role = 'gym_owner'
GROUP BY p.id, p.email, p.username, p.full_name, p.created_at
ORDER BY p.created_at DESC;

-- 4. Check if status column exists and what values it has
SELECT 
  status,
  COUNT(*) as count
FROM public.gyms
GROUP BY status;
