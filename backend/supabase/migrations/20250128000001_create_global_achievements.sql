-- Migration: 20250128000001_create_global_achievements.sql
-- Description: Creates global_achievements table for fixed global badges defined by SweatDrop team
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Added table: public.global_achievements
-- - Added indexes: idx_global_achievements_code, idx_global_achievements_is_active, idx_global_achievements_display_order
-- - Added RLS policies: "Anyone can view active global achievements", "Superadmin can manage global achievements"
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Will need to fetch global achievements for Trophy Room
-- - Admin Panel: Superadmin will need UI to manage global achievements
-- 
-- BREAKING CHANGES:
-- - None (new table)
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Proceed to Korak 1.2: Rename challenges to gym_challenges

-- Create global_achievements table
CREATE TABLE IF NOT EXISTS public.global_achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g., 'first_workout', 'thousand_drops', 'ten_day_streak'
  name TEXT NOT NULL,
  description TEXT,
  badge_image_url TEXT NOT NULL, -- CDN URL to badge image
  criteria JSONB NOT NULL, -- Flexible criteria structure (see Criteria System section)
  reward_drops INTEGER DEFAULT 0 NOT NULL, -- Optional drops reward
  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0, -- For sorting in Trophy Room
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_global_achievements_code ON public.global_achievements(code);
CREATE INDEX IF NOT EXISTS idx_global_achievements_is_active ON public.global_achievements(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_global_achievements_display_order ON public.global_achievements(display_order);

-- Enable RLS
ALTER TABLE public.global_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Everyone can view active global achievements
CREATE POLICY "Anyone can view active global achievements"
  ON public.global_achievements FOR SELECT
  USING (is_active = true);

-- Only superadmin can manage global achievements
CREATE POLICY "Superadmin can manage global achievements"
  ON public.global_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Comments
COMMENT ON TABLE public.global_achievements IS 'Fixed global achievements defined by SweatDrop team. These are available to all users across all gyms.';
COMMENT ON COLUMN public.global_achievements.code IS 'Unique identifier for the achievement (e.g., first_workout, thousand_drops). Used for programmatic checks.';
COMMENT ON COLUMN public.global_achievements.criteria IS 'JSONB structure defining achievement conditions (see Criteria System documentation).';
COMMENT ON COLUMN public.global_achievements.badge_image_url IS 'CDN URL to badge image. Should be hosted on public CDN (e.g., Cloudflare, AWS CloudFront).';
COMMENT ON COLUMN public.global_achievements.reward_drops IS 'Optional drops reward awarded when achievement is completed.';
COMMENT ON COLUMN public.global_achievements.display_order IS 'Order for displaying achievements in Trophy Room (lower numbers appear first).';
