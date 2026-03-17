# SWEATDROP — Master Execution Plan (Architect-Reviewed)

**Created:** 2026-03-12
**Updated:** 2026-03-12
**Status:** Ready for execution

---

## Architect Review — Critical Issues Found in Original Prompt

### Issues identified and corrected:

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | 🔴 CRITICAL | Migration timestamps `20260306*` are BEFORE latest `20260311000003` | Changed to `20260312*` |
| 2 | 🔴 CRITICAL | `profiles.total_drops_earned` doesn't exist | Correct: `total_drops` |
| 3 | 🔴 CRITICAL | `profiles.last_active_date` doesn't exist | Correct: `last_visit_date` |
| 4 | 🔴 CRITICAL | `challenge_type` is an **ENUM**, not CHECK constraint — can't DROP/ADD constraint | Use `ALTER TYPE challenge_type ADD VALUE` |
| 5 | 🔴 CRITICAL | `award_challenge_completion()` function doesn't exist | Replace with inline badge logic or call existing `evaluate_badges()` |
| 6 | 🔴 CRITICAL | **PAKET 2 FIX 2 (BLE reconnect) is ALREADY IMPLEMENTED** — `isPausedRef`, `reconnectTrigger`, Haptics all exist | Remove from plan — re-implementing would break working code |
| 7 | 🔴 CRITICAL | **PAKET 2 FIX 3 (target drops) is ALREADY IMPLEMENTED** — lines 337-371 | Remove from plan |
| 8 | 🔴 CRITICAL | **PAKET 2 FIX 4 (next challenge) is ALREADY IMPLEMENTED** — lines 1892-1910 | Remove from plan |
| 9 | 🔴 CRITICAL | **PAKET 3 Onboarding Wizard is ALREADY FULLY IMPLEMENTED** | Removed Phase 2B entirely — see details below |
| 10 | 🟡 HIGH | `perform_checkin()` doesn't update `weekly_drops`, `monthly_drops` | Added to corrected SQL |
| 11 | 🟡 HIGH | `perform_checkin()` streak logic may conflict with `award_drops()` streak — double-count on same day | Added guard: only update streak if `last_visit_date != CURRENT_DATE` |
| 12 | 🟡 HIGH | `app/(tabs)/` directory doesn't exist — all routes are flat | Corrected all references: `/(tabs)/home` → `/home`, `/(tabs)/scan` → `/scan` |
| 13 | 🟡 HIGH | PAKET 2 and PAKET 4 both modify `ScannerScreen.tsx` | Cannot run in parallel — must be sequential |
| 14 | 🟡 HIGH | `award_drops()` takes `p_session_id`, not `p_user_id, p_gym_id` | Implicit check-in must use `v_session.user_id/gym_id` |
| 15 | 🟢 MEDIUM | `targetDrops` initial value is `300`, not `500` | Already correct in code |
| 16 | 🟢 MEDIUM | `checkin` i18n namespace doesn't exist | Must create files AND register in `lib/i18n.ts` |
| 17 | 🟢 MEDIUM | Missing `checkin-result` screen registration in `_layout.tsx` | Must add `<Stack.Screen name="checkin-result">` |
| 18 | 🟢 MEDIUM | GPS addendum references `app.json` but project uses `app.config.js` | expo-location plugin goes in `app.config.js` |
| 19 | 🟢 MEDIUM | Nominatim geocoding requires full network access from admin panel | Client-side fetch to `nominatim.openstreetmap.org` — needs User-Agent header |
| 20 | 🟢 MEDIUM | `perform_checkin()` signature changes from `(UUID)` to `(UUID, NUMERIC, NUMERIC)` — existing GRANT must be updated | Drop old function first or use `CREATE OR REPLACE` with new signature |

### REMOVED — Onboarding Wizard (PAKET 3) — ALREADY FULLY IMPLEMENTED

The entire onboarding profile setup wizard is already in the codebase. **Do NOT re-implement any of it.**

| Component | Status | Evidence |
|-----------|--------|----------|
| `step-gender.tsx` | ✅ Implemented | Gender selection with cards, skip, edit mode |
| `step-weight.tsx` | ✅ Implemented | Weight input 30-200kg with quick values |
| `step-height.tsx` | ✅ Implemented | Height input 100-250cm with quick values |
| `step-birthday.tsx` | ✅ Implemented | Day/month/year with age validation (min 13) |
| `step-goal.tsx` | ✅ Implemented | Fitness goal selection, submits to Supabase |
| `OnboardingStepLayout` | ✅ Implemented | Progress dots, back/skip, LinearGradient |
| `useOnboardingWizard` hook | ✅ Implemented | Zustand store with all fields, submit, skip |
| `authStore.ts` `profile_setup` step | ✅ Implemented | OnboardingStep type includes `'profile_setup'` |
| `index.tsx` routing | ✅ Implemented | `profile_setup` → `step-gender` |
| `notifications.tsx` chain | ✅ Implemented | Sets `profile_setup`, replaces to `step-gender` |
| `_layout.tsx` screen registration | ✅ Implemented | All 5 step screens registered |
| i18n `sr/onboarding.json` | ✅ Implemented | Full `profileSetup` keys |
| i18n `en/onboarding.json` | ✅ Implemented | Full `profileSetup` keys |
| `profile.tsx` "Moji podaci" section | ✅ Implemented | Shows data + edit button |
| Migration `20260312000001` | ✅ EXISTS | Adds 6 columns + `get_user_age()` + indexes |

**Note:** The migration file exists but `database.types.ts` has NOT been regenerated. The DBA agent must regenerate types after applying check-in migrations.

---

## Corrected Execution Order

```
PHASE 1 — DBA Agent (one session, check-in + GPS migrations)
  ├── Verify Migration A already applied (onboarding profile fields)
  ├── Migration B: Check-in system + GPS validation
  │   ├── gyms: checkin_drops, lat, lng, gps_radius_m columns
  │   ├── gym_checkins table with GPS columns (gps_verified, gps_distance_m, gps_lat, gps_lng)
  │   ├── haversine_distance_m() helper function
  │   ├── perform_checkin(gym_id, lat, lng) with GPS validation
  │   ├── update_checkin_challenge_progress()
  │   └── get_checkin_status()
  ├── Migration C: Implicit check-in in award_drops()
  └── Regenerate database types

PHASE 2A — Mobile Agent: ScannerScreen + Check-in + GPS
  ├── Install expo-location + app.config.js plugin
  ├── ScannerScreen overlay fix
  ├── Check-in branch in ScannerScreen (with GPS coordinates)
  ├── checkin-result.tsx screen (with too_far status)
  ├── Home check-in card
  └── checkin i18n (including GPS/too_far strings)

PHASE 2B — Admin Agent: Check-in Admin + GPS (parallel with 2A)
  ├── Gym settings: checkin_drops + GPS radius + geocoding
  ├── Print QR page
  ├── Check-in stats dashboard (with GPS status column)
  ├── Checkin challenge types
  └── Unverified check-in filter

PHASE 3 — Session Summary Compactness (optional, low priority)
  └── Layout optimization if needed
```

**IMPORTANT: PAKET 2 FIX 2/3/4 (BLE reconnect, target drops, next challenge) are REMOVED — they are already implemented in `workout.tsx`.**
**IMPORTANT: PAKET 3 (Onboarding Wizard) is REMOVED — it is already fully implemented.**

---

## PHASE 1 — DBA Agent Prompt

> **Task: Check-in Database Migrations + Type Regeneration**
>
> Read `docs/plans/master_execution_plan.md` Phase 1 section.
> Read `MIGRATION_NOTES.md` for context.
>
> Latest migration is `20260312000001`. All new migrations must use `20260312000002+` timestamps.
>
> ### Migration A: `20260312000001_profiles_onboarding_fields.sql` — ALREADY EXISTS
>
> **DO NOT recreate this migration.** It already exists and contains:
> - 6 new profile columns (gender, weight_kg, height_cm, date_of_birth, fitness_goal, onboarding_completed)
> - Indexes on fitness_goal and onboarding_completed
> - `get_user_age()` function
> - UPDATE to mark existing users as onboarding_completed = true
>
> **Action:** Verify it has been applied to the database. If not, run `supabase db push`.
> Also check `get_my_profile()` RPC — if it lists specific columns (not `SELECT *`), ensure the 6 new columns are included.
>
> ---
>
> ### Migration B: `20260312000002_checkin_system_with_gps.sql`
>
> **CRITICAL corrections from original prompt:**
> - `challenge_type` is an ENUM, not a CHECK constraint. Use `ALTER TYPE`.
> - Profile column is `total_drops`, NOT `total_drops_earned`.
> - Profile column is `last_visit_date`, NOT `last_active_date`.
> - `award_challenge_completion()` doesn't exist — use `evaluate_badges()` or inline badge insertion.
> - `perform_checkin()` must also update `weekly_drops` and `monthly_drops`.
> - `perform_checkin()` streak must guard against same-day double-count with `award_drops()`.
> - `perform_checkin()` includes GPS validation (lat/lng params, haversine distance check).
> - `gyms` table gets GPS columns (lat, lng, gps_radius_m) alongside checkin_drops.
> - `gym_checkins` table includes GPS audit columns (gps_verified, gps_distance_m, gps_lat, gps_lng).
>
> ```sql
> -- 1. Add checkin_drops + GPS columns to gyms
> ALTER TABLE public.gyms
>   ADD COLUMN IF NOT EXISTS checkin_drops INTEGER NOT NULL DEFAULT 20
>     CHECK (checkin_drops >= 0 AND checkin_drops <= 500),
>   ADD COLUMN IF NOT EXISTS lat NUMERIC(10, 7),
>   ADD COLUMN IF NOT EXISTS lng NUMERIC(10, 7),
>   ADD COLUMN IF NOT EXISTS gps_radius_m INTEGER NOT NULL DEFAULT 200
>     CHECK (gps_radius_m BETWEEN 50 AND 1000);
>
> COMMENT ON COLUMN public.gyms.lat IS 'Latitude. Populated via geocoding when gym address is saved.';
> COMMENT ON COLUMN public.gyms.lng IS 'Longitude.';
> COMMENT ON COLUMN public.gyms.gps_radius_m IS 'Check-in allowed radius in meters. Default 200m.';
>
> -- 2. Extend challenge_type ENUM with check-in types
> ALTER TYPE public.challenge_type ADD VALUE IF NOT EXISTS 'checkin_streak';
> ALTER TYPE public.challenge_type ADD VALUE IF NOT EXISTS 'checkin_count';
>
> -- 3. Create gym_checkins table (with GPS audit columns)
> CREATE TABLE IF NOT EXISTS public.gym_checkins (
>   id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
>   gym_id         UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
>   checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
>   drops_earned   INTEGER NOT NULL DEFAULT 0,
>   gps_verified   BOOLEAN NOT NULL DEFAULT false,
>   gps_distance_m INTEGER,
>   gps_lat        NUMERIC(10, 7),
>   gps_lng        NUMERIC(10, 7),
>   created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
> );
>
> CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_checkins_daily
>   ON public.gym_checkins (user_id, gym_id,
>     DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade'));
> CREATE INDEX IF NOT EXISTS idx_gym_checkins_user
>   ON public.gym_checkins (user_id, checked_in_at DESC);
> CREATE INDEX IF NOT EXISTS idx_gym_checkins_gym
>   ON public.gym_checkins (gym_id, checked_in_at DESC);
>
> ALTER TABLE public.gym_checkins ENABLE ROW LEVEL SECURITY;
>
> CREATE POLICY "Users can view own checkins"
>   ON public.gym_checkins FOR SELECT USING (user_id = auth.uid());
> CREATE POLICY "Gym staff can view gym checkins"
>   ON public.gym_checkins FOR SELECT USING (
>     gym_id IN (SELECT g.id FROM public.gyms g
>                WHERE g.owner_id = auth.uid())
>     OR EXISTS (SELECT 1 FROM public.gym_staff gs
>                WHERE gs.user_id = auth.uid() AND gs.gym_id = gym_checkins.gym_id)
>   );
> CREATE POLICY "No direct insert"
>   ON public.gym_checkins FOR INSERT WITH CHECK (false);
>
> -- 4. Helper: Haversine distance in meters
> CREATE OR REPLACE FUNCTION public.haversine_distance_m(
>   lat1 NUMERIC, lng1 NUMERIC,
>   lat2 NUMERIC, lng2 NUMERIC
> )
> RETURNS INTEGER
> LANGUAGE sql
> IMMUTABLE
> AS $$
>   SELECT (
>     6371000 * 2 * ASIN(
>       SQRT(
>         POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
>         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
>         POWER(SIN(RADIANS(lng2 - lng1) / 2), 2)
>       )
>     )
>   )::INTEGER;
> $$;
>
> -- 5. RPC: perform_checkin (with GPS validation)
> CREATE OR REPLACE FUNCTION public.perform_checkin(
>   p_gym_id UUID,
>   p_lat    NUMERIC DEFAULT NULL,
>   p_lng    NUMERIC DEFAULT NULL
> )
> RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
> DECLARE
>   v_user_id      UUID;
>   v_drops        INTEGER;
>   v_gym_name     TEXT;
>   v_suspended    BOOLEAN;
>   v_already      BOOLEAN;
>   v_checkin_id   UUID;
>   v_streak       INTEGER;
>   v_last_visit   DATE;
>   v_gym_lat      NUMERIC;
>   v_gym_lng      NUMERIC;
>   v_radius_m     INTEGER;
>   v_distance_m   INTEGER := NULL;
>   v_gps_verified BOOLEAN := false;
> BEGIN
>   v_user_id := auth.uid();
>   IF v_user_id IS NULL THEN
>     RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
>   END IF;
>
>   SELECT name, is_suspended, checkin_drops, lat, lng, gps_radius_m
>   INTO v_gym_name, v_suspended, v_drops, v_gym_lat, v_gym_lng, v_radius_m
>   FROM gyms WHERE id = p_gym_id;
>
>   IF NOT FOUND THEN
>     RETURN jsonb_build_object('success', false, 'error', 'gym_not_found');
>   END IF;
>   IF v_suspended THEN
>     RETURN jsonb_build_object('success', false, 'error', 'gym_suspended');
>   END IF;
>   IF v_drops = 0 THEN
>     RETURN jsonb_build_object('success', false, 'error', 'checkin_disabled');
>   END IF;
>
>   -- GPS validation
>   IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
>     IF v_gym_lat IS NOT NULL AND v_gym_lng IS NOT NULL THEN
>       v_distance_m := haversine_distance_m(p_lat, p_lng, v_gym_lat, v_gym_lng);
>       IF v_distance_m <= v_radius_m THEN
>         v_gps_verified := true;
>       ELSE
>         RETURN jsonb_build_object(
>           'success', false, 'error', 'too_far',
>           'distance_m', v_distance_m, 'radius_m', v_radius_m
>         );
>       END IF;
>     END IF;
>     -- If gym has no coordinates, pass through without GPS check
>   END IF;
>   -- If user sent no GPS (NULL), pass through with gps_verified=false
>
>   -- Check if already checked in today
>   SELECT EXISTS (
>     SELECT 1 FROM gym_checkins
>     WHERE user_id = v_user_id AND gym_id = p_gym_id
>       AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = CURRENT_DATE
>   ) INTO v_already;
>
>   IF v_already THEN
>     RETURN jsonb_build_object('success', false, 'error', 'already_checked_in',
>       'gym_name', v_gym_name, 'checkin_drops', v_drops);
>   END IF;
>
>   -- Insert check-in with GPS audit data
>   INSERT INTO gym_checkins (user_id, gym_id, drops_earned,
>                              gps_verified, gps_distance_m, gps_lat, gps_lng)
>   VALUES (v_user_id, p_gym_id, v_drops,
>           v_gps_verified, v_distance_m, p_lat, p_lng)
>   RETURNING id INTO v_checkin_id;
>
>   -- Get current profile state for streak calculation
>   SELECT streak_days, last_visit_date
>   INTO v_streak, v_last_visit
>   FROM profiles WHERE id = v_user_id FOR UPDATE;
>
>   -- Update drops (total_drops, available_drops, weekly, monthly)
>   UPDATE profiles
>   SET total_drops     = total_drops + v_drops,
>       available_drops = available_drops + v_drops,
>       weekly_drops    = weekly_drops + v_drops,
>       monthly_drops   = monthly_drops + v_drops,
>       updated_at      = NOW()
>   WHERE id = v_user_id;
>
>   -- Update streak ONLY if not already visited today
>   -- (award_drops may also update streak — avoid double-count)
>   IF v_last_visit IS NULL OR v_last_visit != CURRENT_DATE THEN
>     IF v_last_visit = CURRENT_DATE - 1
>        OR EXISTS (
>          SELECT 1 FROM sessions
>          WHERE user_id = v_user_id AND is_active = false
>            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') = CURRENT_DATE - 1
>        )
>     THEN
>       v_streak := v_streak + 1;
>     ELSE
>       v_streak := 1;
>     END IF;
>
>     UPDATE profiles
>     SET streak_days = v_streak,
>         last_visit_date = CURRENT_DATE
>     WHERE id = v_user_id;
>   END IF;
>
>   -- Update gym membership local balance
>   UPDATE public.gym_memberships
>   SET local_drops_balance = local_drops_balance + v_drops,
>       updated_at = NOW()
>   WHERE user_id = v_user_id AND gym_id = p_gym_id;
>
>   -- Insert drops transaction
>   INSERT INTO public.drops_transactions (
>     user_id, gym_id, amount, transaction_type, description
>   ) VALUES (
>     v_user_id, p_gym_id, v_drops, 'checkin', 'Reception check-in'
>   );
>
>   -- Update check-in challenge progress
>   PERFORM update_checkin_challenge_progress(v_user_id, p_gym_id);
>
>   RETURN jsonb_build_object(
>     'success', true,
>     'drops_earned', v_drops,
>     'gym_name', v_gym_name,
>     'checkin_id', v_checkin_id,
>     'streak_days', v_streak,
>     'gps_verified', v_gps_verified,
>     'distance_m', v_distance_m
>   );
>
> EXCEPTION WHEN unique_violation THEN
>   RETURN jsonb_build_object('success', false, 'error', 'already_checked_in',
>     'gym_name', v_gym_name);
> END;
> $$;
> GRANT EXECUTE ON FUNCTION public.perform_checkin(UUID, NUMERIC, NUMERIC) TO authenticated;
>
> -- 6. RPC: update_checkin_challenge_progress
> -- NOTE: Uses challenge_progress.challenge_id (not gym_challenge_id)
> -- NOTE: Unique constraint is challenge_progress_user_id_challenge_id_key
> CREATE OR REPLACE FUNCTION public.update_checkin_challenge_progress(
>   p_user_id UUID, p_gym_id UUID)
> RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
> DECLARE
>   v_challenge RECORD;
>   v_streak    INTEGER;
>   v_count     INTEGER;
>   v_today     DATE := CURRENT_DATE;
> BEGIN
>   SELECT streak_days INTO v_streak FROM profiles WHERE id = p_user_id;
>
>   FOR v_challenge IN
>     SELECT * FROM gym_challenges
>     WHERE gym_id = p_gym_id AND is_active = true
>       AND challenge_type IN ('checkin_streak', 'checkin_count')
>       AND start_date <= v_today AND end_date >= v_today
>   LOOP
>     IF v_challenge.challenge_type = 'checkin_streak' THEN
>       INSERT INTO challenge_progress (user_id, challenge_id, gym_id, current_streak_days, updated_at)
>       VALUES (p_user_id, v_challenge.id, p_gym_id, v_streak, NOW())
>       ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
>         SET current_streak_days = v_streak,
>             is_completed = (v_streak >= v_challenge.streak_days),
>             updated_at = NOW();
>
>     ELSIF v_challenge.challenge_type = 'checkin_count' THEN
>       SELECT COUNT(*) INTO v_count FROM gym_checkins
>       WHERE user_id = p_user_id AND gym_id = p_gym_id
>         AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade')
>             BETWEEN v_challenge.start_date AND v_today;
>
>       INSERT INTO challenge_progress (user_id, challenge_id, gym_id, current_drops, updated_at)
>       VALUES (p_user_id, v_challenge.id, p_gym_id, v_count, NOW())
>       ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
>         SET current_drops = v_count,
>             is_completed = (v_count >= v_challenge.target_drops),
>             updated_at = NOW();
>     END IF;
>   END LOOP;
> END;
> $$;
> GRANT EXECUTE ON FUNCTION public.update_checkin_challenge_progress(UUID, UUID) TO authenticated;
>
> -- 7. RPC: get_checkin_status
> CREATE OR REPLACE FUNCTION public.get_checkin_status(p_gym_id UUID)
> RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
>   SELECT jsonb_build_object(
>     'already_checked_in', EXISTS (
>       SELECT 1 FROM gym_checkins
>       WHERE user_id = auth.uid() AND gym_id = p_gym_id
>         AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = CURRENT_DATE
>     ),
>     'checkin_drops', g.checkin_drops,
>     'gym_name', g.name,
>     'total_checkins', (SELECT COUNT(*) FROM gym_checkins
>                        WHERE user_id = auth.uid() AND gym_id = p_gym_id)
>   ) FROM gyms g WHERE g.id = p_gym_id;
> $$;
> GRANT EXECUTE ON FUNCTION public.get_checkin_status(UUID) TO authenticated;
> ```
>
> ---
>
> ### Migration C: `20260312000003_implicit_checkin_in_award_drops.sql`
>
> Modify `award_drops()` to insert implicit check-in when a cardio session ends.
> The function takes `p_session_id` — use `v_session.user_id` and `v_session.gym_id` which are already loaded.
>
> Find the latest `award_drops()` definition (in `20260305000005_fix_award_drops_arena_scores.sql`).
> Copy it and add BEFORE the RETURN statement:
>
> ```sql
> -- 15b. IMPLICIT CHECK-IN — cardio session counts as gym visit
> -- gps_verified=false, no GPS data (implicit, not scanned)
> INSERT INTO public.gym_checkins (user_id, gym_id, drops_earned,
>                                   gps_verified, gps_distance_m, gps_lat, gps_lng)
> VALUES (v_session.user_id, v_session.gym_id, 0,
>         false, NULL, NULL, NULL)
> ON CONFLICT DO NOTHING;
>
> PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);
> ```
>
> ---
>
> ### DBA Validation Checklist
> ```
> □ Migration A (onboarding) already applied — profiles has 6 new columns
> □ Migration B applies without error (checkin + GPS system)
> □ Migration C applies without error (implicit checkin in award_drops)
> □ gyms has checkin_drops, lat, lng, gps_radius_m columns
> □ gym_checkins table exists with GPS columns (gps_verified, gps_distance_m, gps_lat, gps_lng)
> □ haversine_distance_m() returns correct values:
>     SELECT haversine_distance_m(44.8125, 20.4612, 44.8125, 20.4612); -- = 0
>     SELECT haversine_distance_m(44.8125, 20.4612, 44.8200, 20.4700); -- ≈ 1100m
> □ challenge_type ENUM has 'checkin_streak' and 'checkin_count' values
> □ perform_checkin(gym_id, NULL, NULL) → success (GPS unavailable, passes through)
> □ perform_checkin(gym_id, gym_lat, gym_lng) → success, gps_verified=true
> □ perform_checkin(gym_id, 0.0, 0.0) → 'too_far' error with distance_m and radius_m
> □ perform_checkin() returns already_checked_in on second call same day
> □ get_checkin_status() returns correct JSON
> □ award_drops() inserts implicit check-in (drops_earned=0, gps_verified=false)
> □ RLS: user sees only own checkins
> □ RLS: gym staff sees gym checkins
> □ RLS: direct INSERT blocked
> □ Types regenerated: supabase gen types typescript --local
> ```

---

## PHASE 2A — Mobile Agent: ScannerScreen + Check-in

> **Task: Check-in Feature + GPS Validation — Mobile App**
>
> Read `docs/plans/master_execution_plan.md` Phase 2A section.
>
> **IMPORTANT CONTEXT:**
> - There is NO `app/(tabs)/` directory — all routes are flat under `app/`
> - Home is at `app/home.tsx`
> - Scan is at `app/scan.tsx` (modal presentation)
> - `checkin-result.tsx` does not exist yet — create it
> - ScannerScreen is at `components/ScannerScreen.tsx`
> - `checkin` i18n namespace doesn't exist — create files AND register in `lib/i18n.ts`
> - Config is in `app.config.js` (NOT `app.json`)
> - `expo-location` is NOT installed yet
>
> ### Task 0: Install expo-location
>
> ```bash
> cd apps/mobile-app && npx expo install expo-location
> ```
>
> Add to `app.config.js` plugins array:
> ```javascript
> [
>   "expo-location",
>   {
>     locationWhenInUsePermission:
>       "SweatDrop koristi lokaciju da potvrdi da si u teretani pri čekiranju.",
>   },
> ],
> ```
>
> ### Task 1: ScannerScreen overlay fix + checkin branch
>
> **File:** `apps/mobile-app/components/ScannerScreen.tsx`
>
> **1a. Fix camera overlay** (if black overlay issue exists):
> - CameraView must be `StyleSheet.absoluteFillObject`
> - Overlay goes AFTER CameraView in JSX stack
> - Add `useBranding()` for viewfinder corner bracket colors
>
> **1b. Add check-in branch BEFORE machine QR parsing** (around line 256):
> ```typescript
> // Check-in QR: sweatdrop://checkin/{gymId}
> if (qrCode.startsWith('sweatdrop://checkin/')) {
>   const gymId = qrCode.replace('sweatdrop://checkin/', '').trim();
>   await handleCheckin(gymId);
>   return;
> }
> ```
>
> **1c. handleCheckin function (with GPS):**
> ```typescript
> import * as Location from 'expo-location';
>
> const handleCheckin = async (gymId: string) => {
>   if (!session?.user || isProcessing) return;
>   setIsProcessing(true);
>
>   let lat: number | null = null;
>   let lng: number | null = null;
>
>   try {
>     const { status } = await Location.getForegroundPermissionsAsync();
>
>     if (status === 'granted') {
>       const location = await Promise.race([
>         Location.getCurrentPositionAsync({
>           accuracy: Location.Accuracy.Balanced,
>         }),
>         new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
>       ]);
>       if (location && typeof location === 'object' && 'coords' in location) {
>         lat = location.coords.latitude;
>         lng = location.coords.longitude;
>       }
>     } else if (status === 'undetermined') {
>       const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
>       if (newStatus === 'granted') {
>         const location = await Promise.race([
>           Location.getCurrentPositionAsync({
>             accuracy: Location.Accuracy.Balanced,
>           }),
>           new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
>         ]);
>         if (location && typeof location === 'object' && 'coords' in location) {
>           lat = location.coords.latitude;
>           lng = location.coords.longitude;
>         }
>       }
>     }
>     // If 'denied' — proceed without GPS (gps_verified=false in DB)
>   } catch (locationError) {
>     console.warn('[CheckIn] GPS error, proceeding without location:', locationError);
>   }
>
>   try {
>     const { data, error } = await supabase.rpc('perform_checkin', {
>       p_gym_id: gymId,
>       p_lat: lat,
>       p_lng: lng,
>     });
>     if (error) throw error;
>     router.replace({
>       pathname: '/checkin-result',
>       params: {
>         status: data.success ? 'success' : data.error,
>         dropsEarned: String(data.drops_earned || 0),
>         gymName: data.gym_name || '',
>         streakDays: String(data.streak_days || 0),
>         checkinDrops: String(data.checkin_drops || 0),
>         distanceM: String(data.distance_m || 0),
>         radiusM: String(data.radius_m || 0),
>       }
>     });
>   } catch (err: any) {
>     router.replace({
>       pathname: '/checkin-result',
>       params: { status: 'error', errorMessage: err.message || 'Unknown error' }
>     });
>   } finally {
>     setIsProcessing(false);
>   }
> };
> ```
>
> ### Task 2: Create `app/checkin-result.tsx`
>
> Register in `app/_layout.tsx`:
> ```typescript
> <Stack.Screen name="checkin-result" options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }} />
> ```
>
> **Params:** status, dropsEarned, gymName, streakDays, checkinDrops, errorMessage, distanceM, radiusM
>
> **SUCCESS state:**
> - LinearGradient background with green tint
> - Animated checkmark (ZoomIn, 80px)
> - "ČEKIRAN!" — Bebas Neue 42px
> - "+{drops} DROPS" — Bebas Neue 56px, branding.primary, animated counter 0→N (800ms)
> - "🔥 {streak} DANA ZAREDOM" (if streak > 1)
> - "{gymName}" — Inter, textSecondary
> - Auto-close progress bar (3 seconds), then `router.back()`
>
> **ALREADY_CHECKED_IN state:**
> - Blue info icon
> - "Već si čekiran danas"
> - "Vrati se sutra za još +{checkinDrops} drops"
> - Auto-close after 2.5s
>
> **TOO_FAR state:**
> - Orange/amber location pin icon (📍)
> - "Nisi u teretani"
> - "Nalaziš se {formatDistance(distanceM)} od teretane (dozvoljeno {radiusM}m)"
> - Hint: "Uđi u teretanu i pokušaj ponovo"
> - Manual close button (no auto-close)
> - Distance formatting helper:
>   ```typescript
>   const formatDistance = (m: number) => m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
>   ```
>
> **ERROR states** (gym_not_found, gym_suspended, checkin_disabled, error):
> - Red icon
> - Appropriate error message
> - Manual close button (no auto-close)
>
> Design: Follow existing glassmorphism design system (BlurView, FadeInDown, branding colors).
>
> ### Task 3: Home screen check-in card
>
> **File:** `apps/mobile-app/app/home.tsx`
>
> Fetch `get_checkin_status` on load (only if user has a home gym):
> ```typescript
> const [checkinStatus, setCheckinStatus] = useState<{
>   already_checked_in: boolean;
>   checkin_drops: number;
>   gym_name: string;
>   total_checkins: number;
> } | null>(null);
> ```
>
> Card display (add AFTER QuickStatsRow, BEFORE challenges):
> - If `checkin_drops === 0`: don't show card
> - If not checked in: "Čekiraš se danas?" + "+{drops} drops" → navigate to `/scan`
> - If already checked in: "✅ Čekiran danas · {gymName}" — green accent, compact
>
> ### Task 4: i18n
>
> Create `locales/sr/checkin.json` and `locales/en/checkin.json` with all strings.
> Register `checkin` namespace in `lib/i18n.ts` (import files + add to resources + add to ns array).
>
> **Must include GPS-related strings:**
> ```json
> // sr/checkin.json (add alongside other strings):
> {
>   "success": "ČEKIRAN!",
>   "dropsEarned": "+{{drops}} DROPS",
>   "streakDays": "🔥 {{streak}} DANA ZAREDOM",
>   "alreadyCheckedIn": "Već si čekiran danas",
>   "comeBackTomorrow": "Vrati se sutra za još +{{drops}} drops",
>   "tooFar": "Nisi u teretani",
>   "tooFarSub": "Nalaziš se {{distance}} od teretane (dozvoljeno {{radius}})",
>   "tooFarHint": "Uđi u teretanu i pokušaj ponovo",
>   "gymNotFound": "Teretana nije pronađena",
>   "gymSuspended": "Teretana je suspendovana",
>   "checkinDisabled": "Check-in je onemogućen za ovu teretanu",
>   "error": "Greška pri čekiranju",
>   "close": "Zatvori",
>   "homeCardTitle": "Čekiraš se danas?",
>   "homeCardDone": "Čekiran danas",
>   "homeCardDrops": "+{{drops}} drops"
> }
> ```
>
> ```json
> // en/checkin.json:
> {
>   "success": "CHECKED IN!",
>   "dropsEarned": "+{{drops}} DROPS",
>   "streakDays": "🔥 {{streak}} DAYS IN A ROW",
>   "alreadyCheckedIn": "Already checked in today",
>   "comeBackTomorrow": "Come back tomorrow for +{{drops}} drops",
>   "tooFar": "Not at the gym",
>   "tooFarSub": "You are {{distance}} from the gym (allowed {{radius}})",
>   "tooFarHint": "Enter the gym and try again",
>   "gymNotFound": "Gym not found",
>   "gymSuspended": "Gym is suspended",
>   "checkinDisabled": "Check-in is disabled for this gym",
>   "error": "Check-in error",
>   "close": "Close",
>   "homeCardTitle": "Check in today?",
>   "homeCardDone": "Checked in today",
>   "homeCardDrops": "+{{drops}} drops"
> }
> ```
>
> ### Validation
> ```
> □ expo-location installed and plugin in app.config.js
> □ Scan reception QR (sweatdrop://checkin/{gymId}) → checkin-result success
> □ GPS timeout (5s) does not block check-in
> □ Denied GPS permission → check-in passes (gps_verified=false)
> □ too_far status shows distance and radius
> □ Second scan same day → already_checked_in screen
> □ Home card shows when not checked in
> □ Home card shows "done" state after check-in
> □ Machine QR still works as before
> □ TypeScript: 0 errors
> ```

---

## ~~PHASE 2B — Mobile Agent: Onboarding Wizard~~ — REMOVED (ALREADY IMPLEMENTED)

**This entire phase has been removed.** All onboarding wizard components, screens, hooks, routing, i18n, and profile integration are already fully implemented in the codebase. See the "REMOVED — Onboarding Wizard" table above for evidence.

---

## PHASE 2B — Admin Agent: Check-in Admin

> **Task: Check-in Feature + GPS Admin — Admin Panel**
>
> Read `docs/plans/master_execution_plan.md` Phase 2B section.
>
> ### Task 1: Gym Settings — checkin_drops + GPS
>
> In the gym edit form, add a "Check-in na recepciji" section:
> - NumberInput: "Drops po čekiranju" (0-500, default 20)
> - Hint text: "Postavite na 0 da onemogućite check-in"
> - QR preview: inline image using `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=sweatdrop://checkin/{gymId}`
> - Print button → opens `/print-qr?gymId={gymId}&type=checkin&gymName={name}` in new tab
>
> **GPS coordinates subsection (within the same "Check-in" section):**
>
> GPS status indicator:
> ```tsx
> {gym.lat && gym.lng ? (
>   <span className="text-green-600 text-sm">
>     ✅ GPS koordinate postavljene · {Number(gym.lat).toFixed(4)}, {Number(gym.lng).toFixed(4)}
>   </span>
> ) : (
>   <span className="text-yellow-600 text-sm">
>     ⚠️ GPS koordinate nisu postavljene — check-in radi bez lokacijske validacije
>   </span>
> )}
> ```
>
> Geocoding button (client-side, Nominatim — free, no API key):
> ```typescript
> const handleGeocode = async () => {
>   if (!gym.address || !gym.city) return;
>   setGeocoding(true);
>   try {
>     const query = encodeURIComponent(`${gym.address}, ${gym.city}, Serbia`);
>     const res = await fetch(
>       `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
>       { headers: { 'User-Agent': 'SweatDrop/1.0' } }
>     );
>     const data = await res.json();
>     if (data.length > 0) {
>       const { lat, lon } = data[0];
>       // Update gym with lat/lng via existing update mechanism
>       await updateGym({ lat: parseFloat(lat), lng: parseFloat(lon) });
>       toast.success('Koordinate postavljene');
>     } else {
>       toast.error('Adresa nije pronađena. Pokušajte ručno.');
>     }
>   } catch {
>     toast.error('Greška pri geocodingu');
>   } finally {
>     setGeocoding(false);
>   }
> };
> ```
>
> Button: "Postavi koordinate iz adrese" (secondary, MapPin icon, disabled if no address)
>
> GPS radius input (only visible when gym has coordinates):
> ```tsx
> {gym.lat && gym.lng && (
>   <div>
>     <label>Dozvoljeni radius za check-in</label>
>     <input type="number" min={50} max={1000} value={form.gps_radius_m}
>            onChange={(e) => setForm({ ...form, gps_radius_m: parseInt(e.target.value) || 200 })} />
>     <span className="text-xs text-gray-500">
>       Povećajte ako teretana ima loš GPS signal (podrum, tržni centar)
>     </span>
>     {/* Quick presets */}
>     <div className="flex gap-2 mt-1">
>       {[
>         { label: '100m (strogo)', value: 100 },
>         { label: '200m (default)', value: 200 },
>         { label: '500m (zgrada/TC)', value: 500 },
>       ].map(p => (
>         <button key={p.value} onClick={() => setForm({ ...form, gps_radius_m: p.value })}
>                 className={`text-xs px-2 py-1 rounded ${form.gps_radius_m === p.value ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
>           {p.label}
>         </button>
>       ))}
>     </div>
>   </div>
> )}
> ```
>
> Manual coordinate override (collapsible):
> ```tsx
> <details>
>   <summary className="text-sm text-gray-500 cursor-pointer">Ručno unesi koordinate</summary>
>   <div className="flex gap-2 mt-2">
>     <input type="number" step="0.0000001" placeholder="Latitude" value={form.lat} onChange={...} />
>     <input type="number" step="0.0000001" placeholder="Longitude" value={form.lng} onChange={...} />
>   </div>
>   <p className="text-xs text-gray-400 mt-1">
>     Koordinate možete kopirati iz Google Maps (desni klik → "Šta je ovde?")
>   </p>
> </details>
> ```
>
> **IMPORTANT:** `gyms` already has `address` and `city` columns — use them for geocoding.
>
> ### Task 2: Printable QR page — `app/print-qr/page.tsx`
>
> Server component, params from searchParams: gymId, gymName, type (checkin|machine)
> QR data: `sweatdrop://checkin/{gymId}` or `sweatdrop://machine/{machineId}`
>
> Layout:
> - SWEATDROP logo/title
> - QR code image 280x280
> - Heading: "ČEKIRAŠ SE OVDE" (checkin) or "SKENIRAJ ZA TRENING" (machine)
> - Gym name subtitle
> - Print button with `@media print { .no-print { display: none } }` CSS
>
> ### Task 3: Gym Overview — check-in stats (with GPS column)
>
> New section with KPI cards: Danas | Ova nedelja | Ukupno
>
> Table of last 50 check-ins:
> - Avatar | Username | Time | Drops earned | **GPS Status**
> - Query: `gym_checkins` JOIN `profiles` WHERE gym_id ORDER BY checked_in_at DESC LIMIT 50
>
> GPS Status column:
> ```tsx
> const GPSBadge = ({ verified, distance }: { verified: boolean; distance: number | null }) => {
>   if (distance === null) return <span className="text-gray-400 text-xs">GPS N/A</span>;
>   if (verified) return <span className="text-green-600 text-xs">✅ {distance}m</span>;
>   return <span className="text-red-500 text-xs">⚠️ {distance}m</span>;
> };
> ```
>
> Filter toggle for suspicious check-ins:
> ```tsx
> const [showUnverified, setShowUnverified] = useState(false);
> // Toggle: "Prikaži samo bez GPS verifikacije"
> const filteredCheckins = showUnverified
>   ? checkins.filter(c => !c.gps_verified)
>   : checkins;
> ```
>
> ### Task 4: Challenges Manager — checkin types
>
> Extend challenge_type options:
> - `'checkin_streak'` → "Streak poseta (recepcija)" → icon "📍"
> - `'checkin_count'` → "Broj poseta (recepcija)" → icon "🗓️"
>
> Conditional fields:
> - `checkin_streak` → show `streak_days` input
> - `checkin_count` → show `target_drops` input with label "Broj poseta"
>
> ### Validation
> ```
> □ Gym settings saves checkin_drops
> □ Gym settings shows GPS status (green/yellow)
> □ Geocoding works with Nominatim for Serbian addresses
> □ Manual lat/lng override works
> □ Radius presets (100/200/500m) work
> □ QR code displays and is scannable
> □ Print page opens, prints correctly
> □ Check-in stats table shows GPS status badge
> □ "Bez GPS" filter works
> □ Checkin challenge types can be created
> □ TypeScript: 0 errors
> ```

---

## REMOVED — Workout Screen Fixes (ALREADY IMPLEMENTED)

**The following from PAKET 2 are ALREADY in the codebase and must NOT be re-implemented:**

| Fix | Evidence |
|-----|----------|
| BLE reconnect via `reconnectTrigger` | `workout.tsx` line 525-527: comment "isPaused removed from guard & dep array". Line 602-612: `setReconnectTrigger(prev => prev + 1)` |
| `isPausedRef` for BLE callbacks | `workout.tsx` line 112: `const isPausedRef = useRef(false)`. Lines 234-237: sync effect |
| Haptics in `togglePause()` | `workout.tsx` line 2363: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` |
| Dynamic target drops from challenges | `workout.tsx` lines 337-371: full implementation with fallbacks |
| Next challenge on gauge fill | `workout.tsx` lines 1892-1910: `useAnimatedReaction` calling `handleTargetReached()` |

**If you run these "fixes" again, you will break working code.**

---

## Phase 3 — Session Summary (Optional, Low Priority)

Session summary already uses 3 quick stat pills, horizontal badge scroll, and challenge progress list. It scrolls on smaller devices. Consider optimizing only if testing shows layout issues on iPhone 12.

---

## GPS Edge Cases

| Scenario | Behavior |
|----------|----------|
| Gym has no coordinates (lat/lng NULL) | `perform_checkin()` passes through, `gps_verified=false`. Admin sees yellow warning. |
| GPS timeout (>5 seconds) | Mobile sends `NULL` coords. Check-in passes with `gps_verified=false`. |
| User denied GPS permission | Mobile sends `NULL` coords. Check-in passes with `gps_verified=false`. Don't re-ask every time. |
| Basement / mall (bad GPS signal) | Gym owner increases radius to 500m in settings. Or leaves without coordinates. |
| User in parking lot (near gym) | 200m radius covers this — physical proximity is sufficient. |
| Cloned/shared QR code | GPS blocks remote check-ins. Only way to cheat: physically be near the gym — acceptable. |

---

## Execution Commands

```
# PHASE 1: DBA
Run DBA agent with Phase 1 prompt above.
Wait for "DBA COMPLETE" report. Validate all checkboxes.

# PHASE 2A: Mobile Check-in (after Phase 1)
Run Mobile agent with Phase 2A prompt.
Wait for completion. Validate checkboxes.

# PHASE 2B: Admin Check-in (can run parallel with 2A)
Run Admin agent with Phase 2B prompt.
Wait for completion. Validate checkboxes.

# FINAL: Type check
cd apps/mobile-app && npx tsc --noEmit
cd apps/admin-panel && npx tsc --noEmit
```
