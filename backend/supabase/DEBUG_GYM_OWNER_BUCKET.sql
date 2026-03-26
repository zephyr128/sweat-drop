-- Debug query to check gym_owner bucket access
-- Run this in Supabase SQL Editor to diagnose the issue
-- IMPORTANT: Run this while logged in as the gym_owner user

-- 1. Check current user's role and gym ownership
SELECT 
  p.id as user_id,
  p.email,
  p.role,
  p.admin_gym_id,
  g.id as owned_gym_id,
  g.name as owned_gym_name,
  g.owner_id
FROM public.profiles p
LEFT JOIN public.gyms g ON g.owner_id = p.id
WHERE p.id = auth.uid();

-- 2. Check all gyms owned by current user
SELECT 
  g.id,
  g.name,
  g.owner_id,
  CASE 
    WHEN g.owner_id = auth.uid() THEN 'YES - You own this gym'
    ELSE 'NO'
  END as is_owner
FROM public.gyms g
WHERE g.owner_id = auth.uid();

-- 3. Check existing storage policies for gym-challenge-badges
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
  AND policyname LIKE '%gym%challenge%badge%'
ORDER BY policyname;

-- 4. Test if current user can see the bucket
SELECT 
  name,
  id,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE name = 'gym-challenge-badges';

-- 5. Check if there are any existing files in the bucket (if you can see them)
SELECT 
  name,
  bucket_id,
  created_at,
  updated_at
FROM storage.objects
WHERE bucket_id = 'gym-challenge-badges'
LIMIT 10;

-- 6. Test the RLS policy logic manually
-- Replace 'YOUR_GYM_ID' with the actual gym ID you're trying to upload to
-- This simulates what the RLS policy checks
SELECT 
  'Testing gym_owner access for path: YOUR_GYM_ID/filename.png' as test_description,
  EXISTS (
    SELECT 1 FROM public.gyms g
    WHERE g.owner_id = auth.uid()
    AND g.id::text = 'YOUR_GYM_ID'  -- Replace with actual gym_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'gym_owner'
    )
  ) as can_upload;

-- 7. List all your owned gyms (use these IDs in the upload path)
SELECT 
  g.id as gym_id,
  g.name as gym_name,
  'Use this ID in path: ' || g.id::text || '/filename.png' as upload_path_example
FROM public.gyms g
WHERE g.owner_id = auth.uid();
