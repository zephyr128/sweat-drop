-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000007_fix_leaderboard_rewards_rls.sql
-- Description: Restore RLS policies on leaderboard_rewards (dropped in 20240101000017)
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/leaderboard_prizes_plan.md — Phase 1
--
-- ROOT CAUSE:
--   Migration 20240101000017_hierarchical_multitenant_saas.sql dropped
--   "superadmin_all_leaderboard_rewards" and "gym_admin_own_leaderboard_rewards"
--   policies but never recreated them. RLS is enabled with 0 policies = deny all.
--   Mobile app gets 0 rows → prizes never display on leaderboard screen.
--   Admin panel bypasses RLS via service_role key, so it works fine.
--
-- FIX:
--   - SELECT for all authenticated users (prizes are public info)
--   - ALL for gym owners, gym admins, and superadmins
--
-- IMPACT ON FRONTEND:
--   - Mobile: Leaderboard prizes will now appear (badge row, podium labels,
--     "Prizes reset weekly" text)
--   - Admin: No change (already bypasses RLS)
--
-- BREAKING CHANGES: None
-- ═══════════════════════════════════════════════════════════

-- 1. Authenticated users can READ rewards for any gym (prizes are public info)
DROP POLICY IF EXISTS "Anyone can view leaderboard rewards" ON public.leaderboard_rewards;
CREATE POLICY "Anyone can view leaderboard rewards"
  ON public.leaderboard_rewards
  FOR SELECT
  USING (true);

-- 2. Gym owner can manage their gym's rewards
DROP POLICY IF EXISTS "Gym owner can manage own rewards" ON public.leaderboard_rewards;
CREATE POLICY "Gym owner can manage own rewards"
  ON public.leaderboard_rewards
  FOR ALL
  USING (
    gym_id IN (
      SELECT id FROM public.gyms WHERE owner_id = auth.uid()
    )
  );

-- 3. Gym admin/staff can manage their gym's rewards
DROP POLICY IF EXISTS "Gym admin can manage own rewards" ON public.leaderboard_rewards;
CREATE POLICY "Gym admin can manage own rewards"
  ON public.leaderboard_rewards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('gym_owner', 'gym_admin')
        AND admin_gym_id = leaderboard_rewards.gym_id
    )
  );

-- 4. Superadmin full access
DROP POLICY IF EXISTS "Superadmin manages all leaderboard rewards" ON public.leaderboard_rewards;
CREATE POLICY "Superadmin manages all leaderboard rewards"
  ON public.leaderboard_rewards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );
