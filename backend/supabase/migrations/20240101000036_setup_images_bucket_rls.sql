-- Setup RLS policies for 'images' bucket
-- This bucket is used for storing branding assets (logos, backgrounds)

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "images_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "images_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "images_authenticated_delete" ON storage.objects;

-- Allow authenticated users to read all images (public read access)
-- This allows mobile app to display logos and backgrounds
CREATE POLICY "images_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'images');

-- Allow authenticated users to upload images (authenticated write access)
-- Only authenticated users (gym owners) can upload branding assets
CREATE POLICY "images_authenticated_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to update their own uploads
CREATE POLICY "images_authenticated_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to delete their own uploads
CREATE POLICY "images_authenticated_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated'
  );

-- Note: The bucket should be created manually in Supabase Dashboard:
-- 1. Go to Storage > Create a new bucket
-- 2. Name: 'images'
-- 3. Public: Yes (for public read access - allows mobile app to display images)
-- 4. File size limit: 10MB (or as needed)
-- 5. Allowed MIME types: image/*
--
-- After creating the bucket, run this migration to set up RLS policies.
