-- Add Badge Image URL to Challenges Table Migration
-- Adds badge_image_url column to challenges table for storing badge images/icons

-- Add badge_image_url column to challenges table
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS badge_image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.challenges.badge_image_url IS 'URL to badge image/icon that users earn when completing this challenge. Optional field - can be NULL.';

-- Note: RLS policies for challenges table already allow SELECT for active challenges
-- and gym admins can manage challenges, so badge_image_url will be accessible
-- through existing policies. No additional RLS changes needed.
