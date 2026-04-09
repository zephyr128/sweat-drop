-- Migration: 20260409100001_add_missing_fk_indexes_hot_tables.sql
-- Description: Add indexes on frequently queried FK columns flagged by v_diag_missing_fk_indexes
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- Only the 5 FK columns that appear in mobile-app queries or RLS policies.
-- The remaining 28 are audit/admin columns (resolved_by, created_by, etc.)
-- that don't justify the write overhead of an index.
--
-- CHANGES:
--   - idx_gym_member_identities_user: gym_member_identities(user_id)
--   - idx_redemptions_reward: redemptions(reward_id)
--   - idx_drop_limit_counters_gym: drop_limit_counters(gym_id)
--   - idx_profiles_admin_gym: profiles(admin_gym_id)
--   - idx_engagement_campaign_targets_user: engagement_campaign_targets(user_id)
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Faster reward-detail, profile verification badge, drop limit checks
--   - Admin Panel: Faster RLS evaluation for gym_admin/receptionist roles
--
-- BREAKING CHANGES: None (additive)

-- reward-detail.tsx, profile.tsx: .eq('user_id', uid).eq('gym_id', gid)
CREATE INDEX IF NOT EXISTS idx_gym_member_identities_user
  ON public.gym_member_identities (user_id);

-- reward-detail.tsx, store.tsx: JOIN on reward_id for redemption lookups
CREATE INDEX IF NOT EXISTS idx_redemptions_reward
  ON public.redemptions (reward_id);

-- get_user_drop_limits RPC, useDropLimitStatus: .eq('gym_id', gid)
CREATE INDEX IF NOT EXISTS idx_drop_limit_counters_gym
  ON public.drop_limit_counters (gym_id);

-- Every admin/receptionist RLS policy: profiles.admin_gym_id = table.gym_id
CREATE INDEX IF NOT EXISTS idx_profiles_admin_gym
  ON public.profiles (admin_gym_id) WHERE admin_gym_id IS NOT NULL;

-- Campaign delivery target lookups
CREATE INDEX IF NOT EXISTS idx_engagement_campaign_targets_user
  ON public.engagement_campaign_targets (user_id);

-- Refresh planner stats on affected tables
ANALYZE public.gym_member_identities;
ANALYZE public.redemptions;
ANALYZE public.drop_limit_counters;
ANALYZE public.profiles;
ANALYZE public.engagement_campaign_targets;
