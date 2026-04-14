# Bugfix: Gym-Scoped Data & Leaderboard Polish

**Created:** 2026-04-14  
**Priority:** P1 (data correctness bugs visible to users)  
**Workspaces:** `apps/mobile-app/` (all 4 bugs are mobile-only)

---

## Context

When a user switches gyms (home gym → preview gym, or changes home gym entirely), several UI elements continue showing **cross-gym data** instead of scoping to the currently active gym. Additionally, the main leaderboard has cosmetic/i18n issues.

---

## Bug Summary

| # | Bug | Root Cause | Workspace |
|---|-----|-----------|-----------|
| 1 | Daily goal + drops earned persist across gym switches | `useHomeStats` calls `get_my_drops` with `p_gym_id: null` (all gyms) while daily cap comes from active gym | mobile-app |
| 2 | Badges from other gyms shown on home challenges sheet + profile | `useUserBadges()` returns all gyms' badges; no `gym_id` filtering in home/profile (unlike Trophy Room which filters correctly) | mobile-app |
| 3 | Leaderboard: too much padding + hardcoded "Ti" (Serbian) instead of "YOU" | Double `paddingHorizontal: 24` (container + row) = 48px total; 5 occurrences of hardcoded `' Ti'` / `'(Ti)'` bypassing i18n | mobile-app |
| 4 | Arena leaderboard shows no drops | `score_label` from `get_leaderboard` RPC may return `"0"` or empty for arena type; need to verify backend `get_leaderboard` scoring for arenas | mobile-app + possibly backend |

---

## Dependencies

- None — all bugs can be fixed independently and in parallel
- No database migrations required for bugs 1–3
- Bug 4 may require backend investigation (RPC `get_leaderboard` with `p_type: 'arena'`)

---

## Execution Plan

---

### Agent 1: mobile-coder — Bug 1: Gym-Scope Daily Goal & Drops Earned

**Files to modify:**
- `apps/mobile-app/hooks/useHomeStats.ts`
- `apps/mobile-app/hooks/useDropLimitStatus.ts` (verify)

**Steps:**

1. **`useHomeStats.ts` (~line 93):** Change `p_gym_id: null` → `p_gym_id: gymId` in the `get_my_drops` RPC call so that today's drops and weekly drops are filtered to the active gym only.

   Current (buggy):
   ```typescript
   supabase.rpc('get_my_drops', {
     p_gym_id: null,           // ← fetches ALL gyms
     p_types: EARNED_TYPES,
     p_since: monday.toISOString(),
     p_limit: 5000,
   }),
   ```

   Fix:
   ```typescript
   supabase.rpc('get_my_drops', {
     p_gym_id: gymId ?? null,  // ← scope to active gym
     p_types: EARNED_TYPES,
     p_since: monday.toISOString(),
     p_limit: 5000,
   }),
   ```

2. **`useDropLimitStatus.ts` (~line 80):** Same pattern — verify `get_my_drops` and `get_my_sessions` RPCs are called with `p_gym_id: gymId` (not `null`) for the minted-today calculation. The cap already uses `gymId` via `get_user_drop_limits`, but the numerator (earned amounts) may also pass `null`. Fix if so.

3. **Verify:** `useHomeStats` `gymId` parameter is `activeGymId` from the caller in `home.tsx` (~line 300+). Confirm it changes when user switches gyms.

4. **Test:**
   - Earn drops in Gym A → switch to Gym B → daily goal should show 0/cap (not Gym A's drops)
   - Weekly activity chart should only reflect active gym's data
   - Switch back to Gym A → drops reappear

---

### Agent 2: mobile-coder — Bug 2: Gym-Scope Badges on Home & Profile

**Files to modify:**
- `apps/mobile-app/app/home.tsx`
- `apps/mobile-app/app/profile.tsx`
- `apps/mobile-app/components/home/ChallengesStatsCards.tsx` (if needed)

**Steps:**

1. **Understand the working pattern (Trophy Room):** In `apps/mobile-app/components/TrophyRoom.tsx` (~lines 91–125), badges are filtered:
   - `badge_type === 'global'` → always shown
   - `badge_type === 'gym'` → only if `badge.gym_id === activeGymId`

2. **`home.tsx` (~line 309):** After `useUserBadges()`, filter the badges before passing downstream:
   ```typescript
   const { badges: allEarnedBadges } = useUserBadges();

   const earnedBadges = useMemo(() => {
     if (!activeGymId) return allEarnedBadges;
     return allEarnedBadges.filter(
       (b) => b.badge_type === 'global' || b.gym_id === activeGymId
     );
   }, [allEarnedBadges, activeGymId]);
   ```

3. **`home.tsx` (~line 472):** The `challengeRingData` memo uses `earnedBadges.length` — this will now automatically be scoped after step 2.

4. **`home.tsx` (~line 1260):** `SheetBadgesContent` receives `earnedBadges` — already scoped after step 2.

5. **`profile.tsx` (~line 76):** Same filtering pattern:
   ```typescript
   const { badges: allBadges } = useUserBadges();
   const { homeGymId } = useGymStore();

   const badges = useMemo(() => {
     if (!homeGymId) return allBadges;
     return allBadges.filter(
       (b) => b.badge_type === 'global' || b.gym_id === homeGymId
     );
   }, [allBadges, homeGymId]);
   ```
   Note: Profile uses `homeGymId` (not `activeGymId`) since it's the user's own profile.

6. **Test:**
   - Earn badges in Gym A → switch to Gym B → home challenges sheet should NOT show Gym A's gym-specific badges
   - Global badges should always appear regardless of gym
   - Trophy Room should continue working correctly (already gym-filtered)
   - Profile should show badges for home gym + globals

---

### Agent 3: mobile-coder — Bug 3: Leaderboard Padding + Hardcoded "Ti"

**Files to modify:**
- `apps/mobile-app/app/leaderboard.tsx`
- `apps/mobile-app/locales/en/leaderboard.json` (if key missing)
- `apps/mobile-app/locales/sr/leaderboard.json` (if key missing)

**Steps:**

#### 3a. Fix excessive padding

The problem is **double horizontal padding**: container (`periodPageContent`) adds `paddingHorizontal: 24` AND each row (`listItem`) adds another `paddingHorizontal: 24` = **48px total** per side.

1. **`leaderboard.tsx` styles (~line 1488):** Reduce `periodPageContent.paddingHorizontal` from `theme.spacing.lg` (24) to `theme.spacing.md` (16) or `theme.spacing.sm` (8):
   ```typescript
   periodPageContent: {
     paddingHorizontal: theme.spacing.md,  // was theme.spacing.lg (24)
     paddingTop: theme.spacing.sm,
   },
   ```

2. **`leaderboard.tsx` styles (~line 1677):** Reduce `listItem.paddingHorizontal` from `theme.spacing.lg` (24) to `theme.spacing.md` (16):
   ```typescript
   listItem: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: 14,
     paddingHorizontal: theme.spacing.md,  // was theme.spacing.lg (24)
     overflow: 'hidden',
   },
   ```

3. Visually compare with arena leaderboard (`app/arena/[id]/leaderboard.tsx` uses `paddingHorizontal: 14` per row) for consistency.

#### 3b. Replace hardcoded "Ti" with i18n

There are **5 occurrences** of hardcoded Serbian `Ti` in `leaderboard.tsx`:

1. **Line ~997** (reward cards): `#{reward.rank_position}{isUsersRank ? ' · Ti' : ''}`
2. **Line ~1094** (podium name): `{entry.username}{isCurrent ? ' · Ti' : ''}`
3. **Line ~1372** (past winners row): `{isMe ? \`${entry.username} (Ti)\` : entry.username}`
4. **Line ~1388** (past winners pill): `#{myRank} Ti`

**Fix:** Use the existing i18n system. Check if `leaderboard.json` already has a `"you"` key (it does: `"you": "(You)"`). Add a `"youTag"` key if needed for the ` · YOU` variant:

- `locales/en/leaderboard.json`: ensure `"you": "(You)"` and add `"youTag": "YOU"` 
- `locales/sr/leaderboard.json`: ensure `"you": "(Ti)"` and add `"youTag": "Ti"`

Then replace all 5 occurrences:
```typescript
// Before:  ' · Ti'
// After:   ` · ${t('youTag')}`

// Before:  '(Ti)'  
// After:   t('you')
```

5. **Test:**
   - Switch app language to English → leaderboard should show "YOU" / "(You)"
   - Switch to Serbian → should show "Ti" / "(Ti)"
   - Padding should look balanced (compare with arena leaderboard)

---

### Agent 4: mobile-coder (+ possibly supabase-dba) — Bug 4: Arena Leaderboard Shows No Drops

**Files to investigate:**
- `apps/mobile-app/app/arena/[id]/leaderboard.tsx`
- `apps/mobile-app/app/arena/[id]/index.tsx` (mini leaderboard)
- `apps/mobile-app/components/home/ArenasStatsCards.tsx`
- Backend: the `get_leaderboard` function (search in `backend/supabase/migrations/`)

**INVESTIGATION COMPLETE (2026-04-14) — mobile-coder**

**Root cause identified — backend fix required:**

The frontend code (`arena/[id]/leaderboard.tsx`) is correct:
- Calls `get_leaderboard` RPC with `p_type: 'arena'`
- Displays `cleanScoreLabel(entry.score_label)` + water icon
- `cleanScoreLabel` strips emoji from e.g. `"729 💧"` → `"729"` (intentional, icon added inline)

The backend has a regression:
1. **Migration `20260305200001_fix_arena_leaderboard_score_filter.sql`** (March 5) explicitly removed `AND ap.current_score > 0` filter from the arena WHEN clause in `get_leaderboard` — correctly showing all opted-in participants.
2. **Migration `20260325000018_fix_leaderboard_earned_score_and_expiry_transparency.sql`** (March 25) recreated `get_leaderboard` and **re-introduced** `AND ap.current_score > 0` — undoing the March 5 fix. Participants with 0 score are invisible again.
3. **Migration `20260413000002_award_drops_inline_leaderboard_score_update.sql`** (April 13) moved arena score updates to async `pending_session_side_effects` (cron-based). If the cron is slow or backlogged, `arena_participants.current_score` stays at 0, causing users to be hidden by the filter.

**Fix needed (supabase-dba):**
Create a new migration that removes `AND ap.current_score > 0` from the arena WHEN clause in `get_leaderboard`. Target file pattern: `20260414XXXXXX_fix_arena_leaderboard_zero_score_filter.sql`

The arena case should be:
```sql
WHEN 'arena' THEN
  RETURN QUERY
  SELECT ...
  FROM public.arena_participants ap
  JOIN ...
  WHERE ap.arena_id = p_scope_id
  -- NO current_score > 0 filter — show all opted-in participants
  ORDER BY ap.current_score DESC, p.username ASC
  LIMIT p_limit;
```

**No frontend changes needed** — `cleanScoreLabel`, water icon display, and the RPC call are all correct.

6. **Test:**
   - Join an arena → earn drops via workout → check arena leaderboard → score should reflect earned drops
   - Check both mini leaderboard on arena detail and full arena leaderboard screen

---

## Agent Assignment Summary

| Agent | Bug(s) | Complexity | Est. Time |
|-------|--------|-----------|-----------|
| **mobile-coder A** | Bug 1 (daily goal gym scope) | Low — 2 RPC param changes | ~15 min |
| **mobile-coder B** | Bug 2 (badges gym scope) | Low — add `useMemo` filter in 2 files | ~15 min |
| **mobile-coder C** | Bug 3 (leaderboard padding + i18n) | Low — style tweaks + string replacements | ~20 min |
| **mobile-coder D** (+ supabase-dba if needed) | Bug 4 (arena drops) | Medium — requires backend investigation | ~30 min |

All 4 can run **in parallel** — no dependencies between them.

---

## Testing Requirements

- [ ] Bug 1: Earn drops in Gym A → switch to Gym B → daily goal resets to Gym B's data
- [ ] Bug 1: Weekly activity chart reflects only active gym
- [ ] Bug 2: Home challenges sheet shows only global + active gym badges
- [ ] Bug 2: Profile shows only global + home gym badges
- [ ] Bug 2: Trophy Room continues to work correctly (regression check)
- [ ] Bug 3: Leaderboard rows have reasonable padding (compare with arena leaderboard)
- [ ] Bug 3: "YOU" appears in English, "Ti" appears in Serbian
- [ ] Bug 4: Arena leaderboard shows actual drop scores for participants
- [ ] All: No TypeScript errors introduced
