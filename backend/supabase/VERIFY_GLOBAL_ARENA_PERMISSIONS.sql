-- Verification queries for global arena edit permissions
-- Run these in Supabase SQL Editor after migration 20260306000003

-- 1. Check all RLS policies on sweat_arenas
SELECT 
  'RLS Policies' as check_type,
  policyname,
  cmd,
  permissive,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'sweat_arenas'
ORDER BY cmd, policyname;

-- 2. Test: Check if superadmin can see all arenas (including global)
SELECT 
  'Superadmin SELECT test' as test_name,
  COUNT(*) as visible_arenas
FROM public.sweat_arenas
WHERE public.is_superadmin(auth.uid());

-- 3. Test: Check if gym_owner/admin can see global arenas (read-only)
SELECT 
  'Gym staff SELECT global arenas' as test_name,
  COUNT(*) as visible_global_arenas
FROM public.sweat_arenas
WHERE arena_scope = 'network'
  AND is_active = true
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
  );

-- 4. Test: Check if gym_owner/admin can see local arenas for their gyms
SELECT 
  'Gym staff SELECT local arenas' as test_name,
  COUNT(*) as visible_local_arenas
FROM public.sweat_arenas sa
WHERE arena_scope = 'local'
  AND is_active = true
  AND EXISTS (
    SELECT 1 FROM public.arena_gyms ag
    WHERE ag.arena_id = sa.id
      AND (
        (EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'gym_admin' AND admin_gym_id = ag.gym_id
        )) OR
        (EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.gyms g ON g.id = ag.gym_id
          WHERE p.id = auth.uid() 
            AND p.role = 'gym_owner'
            AND (g.owner_id = auth.uid() OR p.admin_gym_id = ag.gym_id)
        ))
      )
  );

-- 5. Check your current role and gym access
SELECT 
  'Your role and gym access' as check_type,
  auth.uid() as your_user_id,
  (SELECT role FROM public.profiles WHERE id = auth.uid()) as your_role,
  (SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()) as your_admin_gym_id,
  (SELECT COUNT(*) FROM public.gyms WHERE owner_id = auth.uid()) as gyms_you_own;

-- 6. List all arenas with their scope
SELECT 
  'All arenas' as check_type,
  id,
  name,
  arena_scope,
  is_active,
  is_finalized,
  start_date,
  end_date
FROM public.sweat_arenas
ORDER BY arena_scope, created_at DESC;
