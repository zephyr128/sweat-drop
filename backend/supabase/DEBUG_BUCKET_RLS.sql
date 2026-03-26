-- Debug RLS policies for gym-challenge-badges bucket
-- Run this in Supabase SQL Editor

-- 1. Check if bucket exists
SELECT 
  name,
  id,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE name = 'gym-challenge-badges';

-- 2. List ALL storage policies (not just gym-challenge-badges)
SELECT 
  policyname,
  cmd as operation,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%gym%challenge%badge%'
ORDER BY policyname, cmd;

-- 3. Test the exact RLS policy logic for your case
-- Replace '4074dffe-6df8-4070-b560-5be794977bff' with the gym_id you're trying to upload to
SELECT 
  'RLS Policy Test' as test_type,
  -- Check if you're gym_owner
  (SELECT role FROM public.profiles WHERE id = auth.uid()) as your_role,
  -- Check if gym exists and you're owner
  EXISTS (
    SELECT 1 FROM public.gyms
    WHERE owner_id = auth.uid()
    AND id::text = '4074dffe-6df8-4070-b560-5be794977bff'
  ) as is_owner_of_gym,
  -- Test the full policy logic
  (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gym_owner'
    AND EXISTS (
      SELECT 1 FROM public.gyms
      WHERE owner_id = auth.uid()
      AND id::text = '4074dffe-6df8-4070-b560-5be794977bff'
    )
  ) as should_have_access;

-- 4. Check all gyms you own
SELECT 
  g.id as gym_id,
  g.name as gym_name,
  g.owner_id,
  CASE 
    WHEN g.owner_id = auth.uid() THEN '✓ You own this'
    ELSE '✗ Not yours'
  END as ownership
FROM public.gyms g
WHERE g.owner_id = auth.uid();

-- 5. Test with actual path format
-- This simulates what happens when you upload to: {gym_id}/filename.png
SELECT 
  'Path Test' as test_type,
  '4074dffe-6df8-4070-b560-5be794977bff/filename.png' as test_path,
  split_part('4074dffe-6df8-4070-b560-5be794977bff/filename.png', '/', 1) as extracted_gym_id,
  EXISTS (
    SELECT 1 FROM public.gyms
    WHERE owner_id = auth.uid()
    AND id::text = split_part('4074dffe-6df8-4070-b560-5be794977bff/filename.png', '/', 1)
  ) as path_check_passes;

-- 6. Test the new SECURITY DEFINER function
SELECT 
  'SECURITY DEFINER Function Test' as test_type,
  auth.uid() as your_user_id,
  '4074dffe-6df8-4070-b560-5be794977bff' as test_gym_id,
  public.can_upload_to_gym_challenge_bucket(
    auth.uid(),
    '4074dffe-6df8-4070-b560-5be794977bff'
  ) as function_returns_true;
