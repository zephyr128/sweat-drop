-- Migration: 20260331000002_gym_waitlist_and_gallery.sql
-- Description: Creates gym_waitlist and gym_gallery tables with RLS policies,
--              and adds gym-gallery storage bucket with RLS.
--
-- AGENT NOTE: [2026-03-31] - supabase-dba
--
-- CHANGES:
-- - Added table: public.gym_waitlist (user gym suggestions / demand tracking)
-- - Added table: public.gym_gallery (gym promotional photos)
-- - Added storage bucket: gym-gallery (public, image uploads for gym owners)
-- - Added RLS policies for both tables and storage
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: GymGalleryManager.tsx, super/waitlist/page.tsx (Steps 2 & 3)
-- - Mobile App: waitlist bottom sheet, gym-detail gallery (Steps 4 & 5)
--
-- BREAKING CHANGES:
-- - None
--
-- NEXT STEPS:
-- 1. admin-coder: WorkingHoursForm, GymGalleryManager, waitlist page
-- 2. mobile-coder: waitlist bottom sheet, gym-detail redesign

-- ============================================================
-- 1. gym_waitlist TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gym_waitlist (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  gym_name    TEXT        NOT NULL,
  city        TEXT,
  country     TEXT,
  notes       TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'contacted', 'onboarded', 'dismissed')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gym_waitlist_status  ON public.gym_waitlist(status);
CREATE INDEX IF NOT EXISTS idx_gym_waitlist_user_id ON public.gym_waitlist(user_id);

ALTER TABLE public.gym_waitlist ENABLE ROW LEVEL SECURITY;

-- Authenticated users can submit their own waitlist requests
CREATE POLICY "Users can insert own waitlist requests"
  ON public.gym_waitlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can view their own submissions
CREATE POLICY "Users can view own waitlist requests"
  ON public.gym_waitlist FOR SELECT
  USING (auth.uid() = user_id);

-- Superadmins can view all waitlist requests
CREATE POLICY "Superadmins can view all waitlist requests"
  ON public.gym_waitlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Superadmins can update status on all waitlist requests
CREATE POLICY "Superadmins can update waitlist requests"
  ON public.gym_waitlist FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Auto-update updated_at on status changes
CREATE OR REPLACE FUNCTION public.handle_gym_waitlist_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gym_waitlist_updated_at
  BEFORE UPDATE ON public.gym_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_gym_waitlist_updated_at();

-- ============================================================
-- 2. gym_gallery TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gym_gallery (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id       UUID        NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  image_url    TEXT        NOT NULL,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  caption      TEXT,
  uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gym_gallery_gym_id     ON public.gym_gallery(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_gallery_sort_order ON public.gym_gallery(gym_id, sort_order);

ALTER TABLE public.gym_gallery ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view gallery images (promotional content)
CREATE POLICY "Authenticated users can view gym gallery"
  ON public.gym_gallery FOR SELECT
  USING (auth.role() = 'authenticated');

-- Gym owners / gym_admins can insert gallery images for their gym
CREATE POLICY "Gym owners and admins can insert gallery images"
  ON public.gym_gallery FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.gym_id = gym_gallery.gym_id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'gym_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Gym owners / gym_admins can update (reorder/caption) gallery images for their gym
CREATE POLICY "Gym owners and admins can update gallery images"
  ON public.gym_gallery FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.gym_id = gym_gallery.gym_id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'gym_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Gym owners / gym_admins can delete gallery images for their gym
CREATE POLICY "Gym owners and admins can delete gallery images"
  ON public.gym_gallery FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.gym_id = gym_gallery.gym_id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'gym_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- ============================================================
-- 3. Storage bucket: gym-gallery
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gym-gallery',
  'gym-gallery',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view gym gallery images (public bucket)
DROP POLICY IF EXISTS "Public can view gym gallery images" ON storage.objects;
CREATE POLICY "Public can view gym gallery images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-gallery');

-- Gym owners/admins can upload to their gym's folder: gym-gallery/{gym_id}/...
DROP POLICY IF EXISTS "Gym owners and admins can upload gallery images" ON storage.objects;
CREATE POLICY "Gym owners and admins can upload gallery images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-gallery'
    AND (
      -- Superadmin can upload anywhere
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      -- Gym owner/admin: path must start with their gym_id
      EXISTS (
        SELECT 1 FROM public.gym_staff gs
        WHERE gs.user_id = auth.uid()
          AND gs.role IN ('owner', 'gym_admin')
          AND (storage.foldername(name))[1] = gs.gym_id::text
      )
    )
  );

-- Gym owners/admins can update (overwrite) files in their gym's folder
DROP POLICY IF EXISTS "Gym owners and admins can update gallery images" ON storage.objects;
CREATE POLICY "Gym owners and admins can update gallery images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gym-gallery'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      EXISTS (
        SELECT 1 FROM public.gym_staff gs
        WHERE gs.user_id = auth.uid()
          AND gs.role IN ('owner', 'gym_admin')
          AND (storage.foldername(name))[1] = gs.gym_id::text
      )
    )
  );

-- Gym owners/admins can delete files from their gym's folder
DROP POLICY IF EXISTS "Gym owners and admins can delete gallery images" ON storage.objects;
CREATE POLICY "Gym owners and admins can delete gallery images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gym-gallery'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'superadmin'
      )
      OR
      EXISTS (
        SELECT 1 FROM public.gym_staff gs
        WHERE gs.user_id = auth.uid()
          AND gs.role IN ('owner', 'gym_admin')
          AND (storage.foldername(name))[1] = gs.gym_id::text
      )
    )
  );
