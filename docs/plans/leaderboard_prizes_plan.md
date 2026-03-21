# Leaderboard Prizes — Fix & Complete Mobile Experience

**Created:** 2026-03-11
**Status:** Ready for execution

---

## Critical Finding

### RLS on `leaderboard_rewards` is BROKEN — Mobile Can't Read Prizes

Migration `20240101000004` created RLS policies for `leaderboard_rewards`.
Migration `20240101000017` **dropped** those policies and never recreated them.

RLS is **enabled** on the table with **zero policies** = all access denied for authenticated users.

**Result:** The mobile app's query in `leaderboard.tsx` (line 172) returns **0 rows**. The prize badges row, podium prize labels, and "Prizes reset weekly" text **never appear** because `rewards` is always empty.

Admin panel works because it uses `service_role` key via server actions — bypasses RLS.

**This is the #1 reason prizes aren't showing in mobile.**

---

## Full Gap Analysis

| # | Issue | Severity | Agent |
|---|-------|----------|-------|
| 1 | `leaderboard_rewards` RLS broken — mobile gets 0 rows | 🔴 CRITICAL | DBA |
| 2 | `leaderboard_prize` notification not handled — tap goes to `/home` | 🔴 HIGH | Mobile |
| 3 | Redemptions show "Unknown Reward" for leaderboard prizes | 🟡 MEDIUM | Mobile |
| 4 | No past winners / history in mobile app | 🟡 MEDIUM | Mobile |
| 5 | No winner banner when user was in top 3 | 🟡 MEDIUM | Mobile |
| 6 | English locale missing `prizesResetWeekly` / `prizesResetMonthly` | 🟢 LOW | Mobile |
| 7 | `LeaderboardPreview` (home) doesn't show prize info | 🟢 LOW | Mobile |

---

## Execution Order

```
PHASE 1 — DBA Agent (must go first — unblocks mobile)
  └── Fix leaderboard_rewards RLS

PHASE 2 — Mobile Agent (after Phase 1)
  ├── Fix notification deep link
  ├── Fix redemptions display for leaderboard prizes
  ├── Add past winners / history tab
  ├── Add winner banner
  ├── Fix i18n gaps
  └── LeaderboardPreview prize hint (optional)
```

---

## PHASE 1 — DBA Agent

> **Task: Fix `leaderboard_rewards` RLS policies**
>
> ### Problem
>
> Migration `20240101000017_hierarchical_multitenant_saas.sql` (lines 36-37) drops policies:
> ```sql
> DROP POLICY IF EXISTS "superadmin_all_leaderboard_rewards" ON public.leaderboard_rewards;
> DROP POLICY IF EXISTS "gym_admin_own_leaderboard_rewards" ON public.leaderboard_rewards;
> ```
>
> No migration recreates them. RLS is enabled with 0 policies = deny all.
>
> ### Migration: `20260312000005_fix_leaderboard_rewards_rls.sql`
>
> ```sql
> -- Fix: leaderboard_rewards policies were dropped in 20240101000017 and never recreated.
> -- Mobile app needs to read prizes for the gym leaderboard display.
>
> -- 1. Authenticated users can READ rewards for any gym (prizes are public info)
> DROP POLICY IF EXISTS "Anyone can view leaderboard rewards" ON public.leaderboard_rewards;
> CREATE POLICY "Anyone can view leaderboard rewards"
>   ON public.leaderboard_rewards
>   FOR SELECT
>   USING (true);
>
> -- 2. Gym owner can manage their gym's rewards
> DROP POLICY IF EXISTS "Gym owner can manage own rewards" ON public.leaderboard_rewards;
> CREATE POLICY "Gym owner can manage own rewards"
>   ON public.leaderboard_rewards
>   FOR ALL
>   USING (
>     gym_id IN (
>       SELECT id FROM public.gyms WHERE owner_id = auth.uid()
>     )
>   );
>
> -- 3. Gym admin/staff can manage their gym's rewards
> DROP POLICY IF EXISTS "Gym admin can manage own rewards" ON public.leaderboard_rewards;
> CREATE POLICY "Gym admin can manage own rewards"
>   ON public.leaderboard_rewards
>   FOR ALL
>   USING (
>     EXISTS (
>       SELECT 1 FROM public.profiles
>       WHERE id = auth.uid()
>         AND role IN ('gym_owner', 'gym_admin')
>         AND admin_gym_id = leaderboard_rewards.gym_id
>     )
>   );
>
> -- 4. Superadmin full access
> DROP POLICY IF EXISTS "Superadmin manages all leaderboard rewards" ON public.leaderboard_rewards;
> CREATE POLICY "Superadmin manages all leaderboard rewards"
>   ON public.leaderboard_rewards
>   FOR ALL
>   USING (
>     EXISTS (
>       SELECT 1 FROM public.profiles
>       WHERE id = auth.uid() AND role = 'superadmin'
>     )
>   );
> ```
>
> **Why SELECT for all authenticated:** Leaderboard prizes are public information — users need to see what they're competing for. The `is_active` filter is done client-side.
>
> ### Validation
> ```
> □ Migration applies without error
> □ Authenticated user can SELECT leaderboard_rewards for any gym
> □ Gym owner can INSERT/UPDATE/DELETE own gym's rewards
> □ Regular user CANNOT insert/update/delete
> □ Superadmin can manage all
> □ Mobile app query returns rewards (test: prizes appear on leaderboard screen)
> □ Types regenerated
> ```

---

## PHASE 2 — Mobile Agent

> **Task: Complete leaderboard prize experience in mobile app**
>
> Read `docs/plans/leaderboard_prizes_plan.md` Phase 2 section.
>
> **IMPORTANT CONTEXT:**
> - Phase 1 (DBA) fixes RLS so `leaderboard_rewards` is readable. After that fix, the existing prize display in `leaderboard.tsx` (badge row, podium labels, reset text) will start working automatically.
> - `leaderboard_snapshots` is already readable by gym members (RLS works).
> - Snapshots contain: `rankings` JSONB array of `{ rank, user_id, username, drops }` (up to 10 entries), plus `period`, `period_start`, `period_end`, `prizes_distributed`.
>
> ---
>
> ### Task 1: Fix notification deep link
>
> **File:** `apps/mobile-app/lib/notifications.ts`
>
> Add `leaderboard_prize` to `NotificationTrigger` type:
> ```typescript
> type NotificationTrigger =
>   | 'session_ended'
>   // ... existing types ...
>   | 'arena_ended'
>   | 'leaderboard_prize';  // ← ADD
> ```
>
> Add case in `getDeepLinkFromNotification()` (before `default`):
> ```typescript
> case 'leaderboard_prize':
>   return '/leaderboard';
> ```
>
> ---
>
> ### Task 2: Fix redemptions display for leaderboard prizes
>
> **File:** `apps/mobile-app/app/redemptions.tsx`
>
> Currently leaderboard prize redemptions show "Unknown Reward" because `reward_id` is NULL.
> The prize info is in `redemption.description` (e.g., "Leaderboard Prize: #1 Weekly at GymName — Free Coffee").
>
> Fix the display logic (around line 139):
> ```typescript
> // Determine display name based on source_type
> const getRedemptionName = (redemption: any) => {
>   if (redemption.source_type === 'leaderboard_prize') {
>     return redemption.description || t('leaderboardPrize');
>   }
>   if (redemption.source_type === 'arena_prize') {
>     return redemption.description || t('arenaPrize');
>   }
>   return redemption.rewards?.name || t('unknownReward');
> };
> ```
>
> Also add a visual indicator for prize source:
> ```typescript
> // Badge next to name
> {redemption.source_type === 'leaderboard_prize' && (
>   <View style={styles.sourceBadge}>
>     <Text style={styles.sourceBadgeText}>🏆 {t('leaderboard')}</Text>
>   </View>
> )}
> {redemption.source_type === 'arena_prize' && (
>   <View style={styles.sourceBadge}>
>     <Text style={styles.sourceBadgeText}>⚔️ {t('arena')}</Text>
>   </View>
> )}
> ```
>
> **Ensure `source_type` and `description` are fetched** — update the select query:
> ```typescript
> .select(`
>   *,
>   rewards:reward_id (id, name, reward_type, price_drops, image_url),
>   gyms:gym_id (id, name)
> `)
> ```
> The `*` already includes `source_type` and `description`, so this should work.
> But verify that `source_type` and `description` are in the returned data.
>
> ---
>
> ### Task 3: Add Past Winners / History tab to leaderboard
>
> **File:** `apps/mobile-app/app/leaderboard.tsx`
>
> Add a "History" section to the gym leaderboard tab. This can be:
> - A small expandable section below the current leaderboard, OR
> - A "Past Winners" button that opens a modal/sheet
>
> **Recommended: collapsible section below the leaderboard list.**
>
> **Data fetch:**
> ```typescript
> const [snapshots, setSnapshots] = useState<any[]>([]);
>
> // Fetch past winners when on gym tab
> if (isGym && activeGymId) {
>   const { data: snapshotData } = await supabase
>     .from('leaderboard_snapshots')
>     .select('id, period, period_start, period_end, rankings, prizes_distributed')
>     .eq('gym_id', activeGymId)
>     .order('period_end', { ascending: false })
>     .limit(5);
>
>   setSnapshots(snapshotData || []);
> }
> ```
>
> **Display (below the leaderboard list, gym tab only):**
> ```
> ┌──────────────────────────────────────┐
> │ 📜 Past Winners                      │
> ├──────────────────────────────────────┤
> │ Weekly · Mar 3-9                     │
> │   🥇 @john_doe — 1,234 drops        │
> │   🥈 @jane — 1,100 drops            │
> │   🥉 @mike — 980 drops              │
> ├──────────────────────────────────────┤
> │ Monthly · February                   │
> │   🥇 @jane — 5,200 drops            │
> │   🥈 @john_doe — 4,800 drops        │
> │   🥉 @alex — 4,100 drops            │
> └──────────────────────────────────────┘
> ```
>
> **Rankings come from:** `snapshot.rankings` — JSONB array of `{ rank, user_id, username, drops }`.
>
> **Period label formatting:**
> ```typescript
> const formatPeriodLabel = (snapshot: any) => {
>   const start = new Date(snapshot.period_start);
>   const end = new Date(snapshot.period_end);
>   if (snapshot.period === 'weekly') {
>     return `${t('weekly')} · ${formatDate(start)} - ${formatDate(end)}`;
>   }
>   return `${t('monthly')} · ${formatMonthName(start)}`;
> };
> ```
>
> Show only top 3 from each snapshot's `rankings` array.
>
> Design: glassmorphic card, staggered FadeInDown, branding colors.
>
> ---
>
> ### Task 4: Winner banner (when user was in top 3)
>
> **File:** `apps/mobile-app/app/leaderboard.tsx`
>
> After fetching snapshots, check if current user was in the top 3 of any recent snapshot:
>
> ```typescript
> const [winnerBanner, setWinnerBanner] = useState<{
>   rank: number;
>   period: string;
>   periodLabel: string;
>   reward?: string;
> } | null>(null);
>
> // Check most recent snapshot for user's win
> useEffect(() => {
>   if (!session?.user?.id || snapshots.length === 0) return;
>
>   for (const snapshot of snapshots) {
>     const rankings = snapshot.rankings as Array<{ rank: number; user_id: string; username: string; drops: number }>;
>     const userEntry = rankings.find(r => r.user_id === session.user.id && r.rank <= 3);
>     if (userEntry) {
>       const matchingReward = rewards.find(r => r.rank_position === userEntry.rank);
>       setWinnerBanner({
>         rank: userEntry.rank,
>         period: snapshot.period,
>         periodLabel: formatPeriodLabel(snapshot),
>         reward: matchingReward?.reward_name,
>       });
>       break;
>     }
>   }
> }, [snapshots, session?.user?.id, rewards]);
> ```
>
> **Display (top of leaderboard, above tabs):**
> ```
> ┌──────────────────────────────────────┐
> │ 🎉 You finished #1 last week!       │
> │ Prize: Free Protein Shake            │
> │ Check redemptions →                  │
> └──────────────────────────────────────┘
> ```
>
> - Medal emoji based on rank (🥇/🥈/🥉)
> - Tap navigates to `/redemptions`
> - Only show for the most recent period where user won
> - Dismissible (use AsyncStorage flag: `lastDismissedWinBanner_{snapshotId}`)
>
> Design: gold/yellow gradient accent, glassmorphic card, animated entrance.
>
> ---
>
> ### Task 5: Fix i18n gaps
>
> **`locales/en/leaderboard.json` — add:**
> ```json
> {
>   "prizesResetWeekly": "Prizes reset every week",
>   "prizesResetMonthly": "Prizes reset every month",
>   "beFirstGym": "Be the first to earn drops at this gym!",
>   "beFirstGlobal": "Be the first to earn drops globally!",
>   "noArenasAvailable": "No arenas available right now. Check back soon!",
>   "loadingArenas": "Loading arenas...",
>   "pastWinners": "Past Winners",
>   "noPastWinners": "No past winners yet",
>   "youFinished": "You finished #{{rank}} {{period}}!",
>   "prize": "Prize: {{prize}}",
>   "checkRedemptions": "Check redemptions →",
>   "leaderboardPrize": "Leaderboard Prize",
>   "arenaPrize": "Arena Prize"
> }
> ```
>
> **`locales/sr/leaderboard.json` — add:**
> ```json
> {
>   "pastWinners": "Prethodni pobednici",
>   "noPastWinners": "Još nema pobednika",
>   "youFinished": "Završio si kao #{{rank}} {{period}}!",
>   "prize": "Nagrada: {{prize}}",
>   "checkRedemptions": "Pogledaj nagrade →",
>   "leaderboardPrize": "Nagrada sa leaderboarda",
>   "arenaPrize": "Nagrada iz arene"
> }
> ```
>
> **`locales/sr/redemptions.json` and `locales/en/redemptions.json`** — add if the source badge strings are in the redemptions namespace:
> ```json
> { "leaderboard": "Leaderboard", "arena": "Arena" }
> ```
>
> ---
>
> ### Task 6 (Optional): LeaderboardPreview prize hint on home
>
> **File:** `apps/mobile-app/components/LeaderboardPreview.tsx`
>
> Optionally add a small text below the top 3 list:
> ```
> 🏆 Weekly prizes available — compete now!
> ```
>
> This requires fetching `leaderboard_rewards` (just a COUNT or existence check):
> ```typescript
> const { count } = await supabase
>   .from('leaderboard_rewards')
>   .select('*', { count: 'exact', head: true })
>   .eq('gym_id', gymId)
>   .eq('is_active', true);
>
> if (count && count > 0) {
>   setHasPrizes(true);
> }
> ```
>
> Show a subtle hint: "🏆 Win prizes this week" with branding accent.
>
> This is low priority — skip if time is short.
>
> ---
>
> ### Validation
> ```
> □ RLS fix applied → leaderboard prizes appear (badge row + podium labels)
> □ "Prizes reset weekly" / "monthly" text shows correctly
> □ Tap leaderboard_prize notification → opens /leaderboard
> □ Redemptions page shows leaderboard prizes with name (not "Unknown Reward")
> □ Redemptions page shows source badge (🏆 Leaderboard / ⚔️ Arena)
> □ Past Winners section shows recent snapshots with top 3
> □ Winner banner appears when user was in top 3 of recent period
> □ Winner banner tap → /redemptions
> □ All new strings localized in SR and EN
> □ English locale has prizesResetWeekly/Monthly
> □ TypeScript: 0 errors
> ```

---

## End-to-End Flow After Fix

```
1. Admin → LeaderboardHistory → sets "Free Protein Shake" for rank 1 weekly
   → Saved in leaderboard_rewards (gym_id, rank_position=1, period='weekly')

2. Users compete all week, see prizes on leaderboard screen:
   ┌─ 🥇 Free Protein Shake │ 🥈 10% Discount │ 🥉 Free Coffee ─┐
   └──────────────────────────────────────────────────────────────┘

3. Sunday 22:55 UTC → cron → distribute-leaderboard-prizes Edge Function
   → distribute_leaderboard_prizes(gym_id, 'weekly')
   → Snapshot saved in leaderboard_snapshots
   → Top 3 matched with leaderboard_rewards
   → Redemptions created (source_type='leaderboard_prize')
   → Push notification sent: "Congratulations! You finished #1!"

4. User taps notification → /leaderboard (was: /home)

5. Leaderboard shows winner banner:
   🎉 "You finished #1 last week! Prize: Free Protein Shake"
   [Check redemptions →]

6. Past Winners section shows last 5 snapshots with top 3

7. Redemptions page shows: "Leaderboard Prize: #1 Weekly — Free Protein Shake"
   with 🏆 Leaderboard source badge

8. User shows redemption to staff → staff verifies via admin panel
```
