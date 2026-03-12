# Onboarding Profile Setup Wizard — Execution Plan

## Context

After registration, users go through a 5-step profile setup wizard (gender, weight, height, birthday, fitness goal). Users can skip the entire flow and fill data later from the Profile screen. Data is stored in `profiles` table.

---

## Architect Review — Corrections to Original Proposal

### Critical Issues Found & Fixed

| # | Issue | Fix |
|---|-------|-----|
| 1 | **Migration timestamp `20260306200001` is OUT OF ORDER** — latest migration is `20260311000003` | Changed to `20260312000001` |
| 2 | **`app/(auth)/` doesn't exist** — original prompt references it | Auth lives at `app/(onboarding)/auth.tsx`. All new screens go in existing `(onboarding)/` directory |
| 3 | **`app/(tabs)/profile.tsx` doesn't exist** — no tabs group | Profile screen is at `app/profile.tsx` (flat route). Edit data section goes there |
| 4 | **Routing logic is NOT in `_layout.tsx`** — it's in `index.tsx` + `authStore.computeOnboardingStep()` | Must add `profile_setup` to `OnboardingStep` type, update `computeOnboardingStep()`, and update `index.tsx` routing |
| 5 | **`(onboarding)/` already has 6 screens** (welcome, auth, stepper, username, avatar, notifications) | New screens are ADDED to the existing layout, not a new directory |
| 6 | **i18n `onboarding` namespace already exists** with auth-related keys | New profile keys must be ADDED to existing `locales/{lang}/onboarding.json`, not create new files |
| 7 | **`ProfileData` in `authStore.ts` doesn't include new fields** | Must extend `ProfileData` interface + `get_my_profile` RPC (if it's not a `SELECT *`) |
| 8 | **Existing users migration** — `DEFAULT false` would force ALL existing users into wizard | Migration must `UPDATE profiles SET onboarding_completed = true` for existing users |
| 9 | **`notifications.tsx` currently sets step to `done` and routes to `/home`** | Must change to set `profile_setup` step instead, to chain into the new wizard |
| 10 | **`useOnboarding` proposed as Zustand store** — should NOT persist | Zustand store without `persist` middleware (temporary wizard data, reset on mount) |

### Design Adjustments

- **Birthday picker**: 3 separate `ScrollView`-based wheels are complex to build correctly. Recommend simpler approach: 3 inline `TextInput` fields (DD/MM/YYYY) with quick-select year buttons, plus age display below.
- **Profile screen "Moji podaci"**: Goes in `app/profile.tsx` as a new section between Stats Grid and Activity Links.
- **Edit mode routing**: Use route param `?edit=true` rather than a separate store flag. When `edit=true`, skip is hidden and navigation on finish goes `router.back()` instead of `router.replace('/home')`.

---

## Dependencies & Execution Order

```
Phase 1: DBA Agent   ← RUN FIRST (adds columns, no frontend impact)
Phase 2: Mobile Agent ← RUN AFTER DBA (uses new columns)
```

No admin panel changes needed for this feature.

---

## PHASE 1 — DBA Agent

### Task 1.1: Migration `20260312000001_profiles_onboarding_fields.sql`

```sql
-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000001_profiles_onboarding_fields.sql
-- Description: Add profile setup fields for onboarding wizard
--
-- CHANGES:
--   - Added columns: gender, weight_kg, height_cm, date_of_birth,
--     fitness_goal, onboarding_completed
--   - CHECK constraints on all columns
--   - Indexes for fitness_goal and onboarding_completed
--   - get_user_age() helper function
--   - Existing users marked as onboarding_completed = true
--
-- IMPACT ON FRONTEND:
--   - Mobile: New onboarding wizard screens + profile edit
--   - Admin: No changes needed
--
-- BREAKING CHANGES: None (additive)
-- ═══════════════════════════════════════════════════════════

-- 1. Add columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender             TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS weight_kg          NUMERIC(5,1) CHECK (weight_kg > 0 AND weight_kg < 500),
  ADD COLUMN IF NOT EXISTS height_cm          INTEGER CHECK (height_cm > 0 AND height_cm < 300),
  ADD COLUMN IF NOT EXISTS date_of_birth      DATE CHECK (date_of_birth < CURRENT_DATE),
  ADD COLUMN IF NOT EXISTS fitness_goal       TEXT CHECK (fitness_goal IN (
    'weight_loss', 'strength', 'cardio', 'health'
  )),
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. Comments
COMMENT ON COLUMN public.profiles.gender IS
  'User gender: male or female';
COMMENT ON COLUMN public.profiles.weight_kg IS
  'User weight in kilograms. Used for calorie calculation.';
COMMENT ON COLUMN public.profiles.height_cm IS
  'User height in centimeters. Used for calorie calculation.';
COMMENT ON COLUMN public.profiles.date_of_birth IS
  'User date of birth. Age calculated dynamically via get_user_age().';
COMMENT ON COLUMN public.profiles.fitness_goal IS
  'Primary fitness goal: weight_loss, strength, cardio, health';
COMMENT ON COLUMN public.profiles.onboarding_completed IS
  'True when user has completed or explicitly skipped the profile setup wizard.';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_fitness_goal
  ON public.profiles(fitness_goal)
  WHERE fitness_goal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding
  ON public.profiles(onboarding_completed)
  WHERE onboarding_completed = false;

-- 4. Mark ALL existing users as completed (they already use the app)
UPDATE public.profiles SET onboarding_completed = true WHERE onboarding_completed = false;

-- 5. Helper function: get_user_age()
CREATE OR REPLACE FUNCTION public.get_user_age(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth))::INTEGER
  FROM public.profiles
  WHERE id = p_user_id AND date_of_birth IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_age(UUID) TO authenticated;
```

### Task 1.2: Verify RLS

The existing `profiles_update_own` policy covers the new columns automatically:

```sql
-- Already exists (from 20240101000026):
-- CREATE POLICY "profiles_update_own"
--   ON public.profiles FOR UPDATE
--   USING (auth.uid() = id)
--   WITH CHECK (auth.uid() = id);
```

**No new RLS policy needed.** Verify it exists with:

```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'UPDATE';
```

### Task 1.3: Update `get_my_profile` RPC (if needed)

Check if `get_my_profile()` uses `SELECT *` or lists specific columns. If it lists columns, add:
- `gender`
- `weight_kg`
- `height_cm`
- `date_of_birth`
- `fitness_goal`
- `onboarding_completed`

### Post-DBA Checklist

```
✅ Migration applied (supabase db push)
✅ 6 new columns on profiles
✅ CHECK constraints valid
✅ Existing users: onboarding_completed = true
✅ New users: onboarding_completed = false (DEFAULT)
✅ get_user_age() function
✅ RLS verified
✅ get_my_profile() includes new fields (if applicable)
✅ Run: supabase gen types typescript --local > backend/types/database.types.ts
```

---

## PHASE 2 — Mobile Agent

### Overview

Add 5 profile setup screens to the existing `(onboarding)/` group. Integrate with `authStore` onboarding flow. Add profile data display/edit in `profile.tsx`.

### Files to CREATE

```
apps/mobile-app/app/(onboarding)/step-gender.tsx
apps/mobile-app/app/(onboarding)/step-weight.tsx
apps/mobile-app/app/(onboarding)/step-height.tsx
apps/mobile-app/app/(onboarding)/step-birthday.tsx
apps/mobile-app/app/(onboarding)/step-goal.tsx
apps/mobile-app/components/OnboardingStep.tsx
apps/mobile-app/hooks/useOnboardingWizard.ts
```

### Files to MODIFY

```
apps/mobile-app/lib/stores/authStore.ts          ← Add 'profile_setup' step
apps/mobile-app/app/index.tsx                      ← Route profile_setup step
apps/mobile-app/app/(onboarding)/_layout.tsx       ← Register 5 new screens
apps/mobile-app/app/(onboarding)/notifications.tsx ← Chain to profile wizard
apps/mobile-app/app/profile.tsx                    ← Add "Moji podaci" section
apps/mobile-app/locales/sr/onboarding.json         ← Add profile setup keys
apps/mobile-app/locales/en/onboarding.json         ← Add profile setup keys
```

---

### Task 2.1: Update `authStore.ts`

**Add `'profile_setup'` to `OnboardingStep` type:**

```typescript
export type OnboardingStep =
  | 'auth'
  | 'stepper'
  | 'display_name'
  | 'avatar'
  | 'notifications'
  | 'profile_setup'   // ← NEW
  | 'done';
```

**Extend `ProfileData` interface:**

```typescript
export interface ProfileData {
  // ...existing fields...
  gender: string | null;            // ← NEW
  weight_kg: number | null;         // ← NEW
  height_cm: number | null;         // ← NEW
  date_of_birth: string | null;     // ← NEW
  fitness_goal: string | null;      // ← NEW
  onboarding_completed: boolean;    // ← NEW
}
```

**Update `computeOnboardingStep()`:**

After the push notifications check, before `return 'done'`, add:

```typescript
// Profile setup wizard (gender, weight, height, birthday, goal)
if (!profile.onboarding_completed) {
  return 'profile_setup';
}

return 'done';
```

Also handle returning users at the `currentStep === 'auth'` block — when username + avatar are valid but `onboarding_completed` is false, return `'profile_setup'` instead of `'done'`.

---

### Task 2.2: Update `index.tsx` Routing

Add case for `profile_setup` in the switch:

```typescript
case 'profile_setup':
  router.replace('/(onboarding)/step-gender');
  break;
```

---

### Task 2.3: Update `(onboarding)/_layout.tsx`

Register the 5 new screens:

```typescript
<Stack.Screen name="step-gender" />
<Stack.Screen name="step-weight" />
<Stack.Screen name="step-height" />
<Stack.Screen name="step-birthday" />
<Stack.Screen name="step-goal" />
```

---

### Task 2.4: Update `notifications.tsx`

Change `completeOnboarding()` to chain into profile wizard instead of going to home:

```typescript
const completeOnboarding = async () => {
  await AsyncStorage.setItem('pushNotificationsAsked', 'true');
  setOnboardingStep('profile_setup');  // ← Changed from 'done'
  router.replace('/(onboarding)/step-gender');  // ← Changed from '/home'
};
```

**Edge case:** If `PUSH_NOTIFICATIONS_ENABLED` is false, the existing `computeOnboardingStep()` might skip straight from avatar to `profile_setup`. This is correct behavior — the wizard appears after avatar if push is disabled.

---

### Task 2.5: Create `hooks/useOnboardingWizard.ts`

Zustand store (NOT persisted) for temporary wizard data:

```typescript
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';

interface OnboardingWizardData {
  gender: 'male' | 'female' | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null; // YYYY-MM-DD
  fitness_goal: 'weight_loss' | 'strength' | 'cardio' | 'health' | null;
}

interface OnboardingWizardStore {
  data: OnboardingWizardData;
  isEdit: boolean;
  setField: <K extends keyof OnboardingWizardData>(field: K, value: OnboardingWizardData[K]) => void;
  initializeFromProfile: (profile: Partial<OnboardingWizardData>) => void;
  setEditMode: (isEdit: boolean) => void;
  submit: () => Promise<{ success: boolean; error?: string }>;
  skip: () => Promise<{ success: boolean; error?: string }>;
  reset: () => void;
}
```

**`submit()`** updates profiles with all fields + `onboarding_completed: true`, then calls `authStore.fetchProfile()` to sync.

**`skip()`** only sets `onboarding_completed: true` (no profile data saved).

**`initializeFromProfile()`** pre-fills data when editing from profile screen.

---

### Task 2.6: Create `components/OnboardingStep.tsx`

Shared wrapper for all 5 steps:

```typescript
interface OnboardingStepProps {
  step: number;          // 1-5
  totalSteps: number;    // 5
  title: string;         // Bebas Neue, 36px
  subtitle?: string;     // Inter, secondary
  onNext: () => void;
  onBack?: () => void;   // undefined on step 1
  onSkip?: () => void;   // hidden in edit mode
  nextDisabled?: boolean;
  nextLabel?: string;    // default "DALJE →", last step "ZAVRŠI ✓"
  isEdit?: boolean;      // hide skip in edit mode
  children: React.ReactNode;
}
```

**Layout:**
```
┌─────────────────────────────┐
│  ← Back        Preskoči →  │  (Preskoči hidden in edit mode)
│                             │
│  ●●○○○  Korak 1 od 5       │  (animated dots, active = wider)
│                             │
│  NASLOV KORAKA              │  (Bebas Neue 36px)
│  Podnaslov opcionalan       │  (Inter 14px, textSecondary)
│                             │
│  [   CONTENT AREA   ]       │  (children)
│                             │
│  [    DALJE →    ]          │  (primary button, Bebas Neue)
└─────────────────────────────┘
```

**Design system compliance:**
- Background: `LinearGradient ['#000000', '#0A0E1A', '#000000']`
- Primary button: `backgroundColor: theme.colors.primary`, `color: '#000000'`, Bebas Neue
- Progress dots: filled = `theme.colors.primary`, empty = `rgba(255,255,255,0.2)`, active dot width 24px, others 8px
- Animations: `FadeInDown` from reanimated
- Haptics: `Medium` on selection, `Success` on finish

---

### Task 2.7: Step Screens

**step-gender.tsx** — Two large cards (♂ Muški / ♀ Ženski):
- Cards: 47% width, aspect ~1:1.2
- Selected: `borderColor: branding.primary`, `backgroundColor: hexToRgba(branding.primary, 0.15)`
- Unselected: `borderColor: rgba(255,255,255,0.1)`, dark bg
- Haptics: Medium on tap
- Next requires selection

**step-weight.tsx** — TextInput + quick select:
- Numeric input with "kg" label
- Quick buttons: [50, 60, 70, 80, 90, 100]
- Validation: 30–200 kg
- Next disabled when empty/invalid

**step-height.tsx** — TextInput + quick select:
- Numeric input with "cm" label
- Quick buttons: [160, 165, 170, 175, 180, 185, 190]
- Validation: 100–250 cm
- Next disabled when empty/invalid

**step-birthday.tsx** — 3 TextInputs (DD / MM / YYYY) + age display:
- Three inline numeric inputs with placeholders
- Year quick select buttons for common ages: e.g. [2000, 1998, 1995, 1990, 1985, 1980]
- Auto-validate date (invalid combos like Feb 31 → show error)
- Age display: "Imaš 28 godina" (primary color, bold)
- Minimum 13 years enforced (next disabled + error text)
- Maximum 80 years

**step-goal.tsx** — 2x2 grid of cards:
- 🔥 MRŠAVLJENJE (weight_loss) — "Sagoreti kalorije i smanjiti telesnu masu"
- 💪 SNAGA (strength) — "Izgraditi mišićnu masu i snagu"
- 🏃 KONDICIJA (cardio) — "Poboljšati izdržljivost i kardio"
- ❤️ ZDRAVLJE (health) — "Opšte zdravlje i aktivni životni stil"
- Same selection style as gender cards
- **Button text: "ZAVRŠI ✓"** (instead of "DALJE")
- On finish: call `submit()`, haptics Success, `setOnboardingStep('done')`, `router.replace('/home')`
- In edit mode: call `submit()`, `router.back()`

---

### Task 2.8: Profile Screen — "Moji podaci" Section

**File:** `apps/mobile-app/app/profile.tsx`

Add a new section between the Stats Grid and Activity Links sections.

**If `onboarding_completed = false` (or all fields null):**
- Show CTA banner: "Popuni profil za personalizovano iskustvo" + "Popuni sada" button
- Button navigates to `/(onboarding)/step-gender?edit=false`

**If data exists (at least some fields filled):**
- Show compact data card:
```
♂/♀  |  70 kg  |  178 cm  |  28 god
Cilj: 🏃 KONDICIJA
```
- "Uredi" button navigates to `/(onboarding)/step-gender?edit=true`

**Edit mode behavior** (when `edit=true` route param):
- `useOnboardingWizard.initializeFromProfile()` called with existing data
- "Preskoči" hidden on all steps
- "ZAVRŠI" button does submit → `router.back()` (not `router.replace('/home')`)

Add `gender`, `weight_kg`, `height_cm`, `date_of_birth`, `fitness_goal` to the profile query's `select()` call.

---

### Task 2.9: i18n Updates

**ADD to existing** `locales/sr/onboarding.json`:

```json
{
  "profileSetup": {
    "skip": "Preskoči",
    "next": "DALJE",
    "finish": "ZAVRŠI",
    "stepOf": "Korak {{step}} od {{total}}",
    "gender": {
      "title": "KOJI SI POL?",
      "male": "MUŠKI",
      "female": "ŽENSKI"
    },
    "weight": {
      "title": "KOLIKO IMAŠ KILOGRAMA?",
      "subtitle": "Koristimo ovo za precizno računanje kalorija",
      "unit": "kg",
      "placeholder": "70"
    },
    "height": {
      "title": "KOLIKO SI VISOK/A?",
      "subtitle": "Za precizne fitness izveštaje",
      "unit": "cm",
      "placeholder": "175"
    },
    "birthday": {
      "title": "KADA SI ROĐEN/A?",
      "subtitle": "Minimum 13 godina",
      "ageDisplay": "Imaš {{age}} godina",
      "tooYoung": "Moraš imati najmanje 13 godina",
      "invalidDate": "Nevažeći datum",
      "day": "Dan",
      "month": "Mesec",
      "year": "Godina"
    },
    "goal": {
      "title": "KOJI JE TVOJ CILJ?",
      "weight_loss": "MRŠAVLJENJE",
      "strength": "SNAGA",
      "cardio": "KONDICIJA",
      "health": "ZDRAVLJE",
      "weight_loss_desc": "Sagoreti kalorije i smanjiti telesnu masu",
      "strength_desc": "Izgraditi mišićnu masu i snagu",
      "cardio_desc": "Poboljšati izdržljivost i kardio",
      "health_desc": "Opšte zdravlje i aktivni životni stil"
    },
    "profile": {
      "sectionTitle": "MOJI PODACI",
      "editButton": "Uredi",
      "completeBanner": "Popuni profil za personalizovano iskustvo",
      "completeButton": "Popuni sada",
      "goalLabel": "Cilj"
    },
    "skipConfirmTitle": "Preskoči postavljanje profila?",
    "skipConfirmMessage": "Možeš popuniti podatke kasnije iz svog profila.",
    "skipConfirmYes": "Preskoči",
    "skipConfirmNo": "Nastavi",
    "saveError": "Greška pri čuvanju"
  }
}
```

**ADD to existing** `locales/en/onboarding.json`:

```json
{
  "profileSetup": {
    "skip": "Skip",
    "next": "NEXT",
    "finish": "FINISH",
    "stepOf": "Step {{step}} of {{total}}",
    "gender": {
      "title": "WHAT'S YOUR GENDER?",
      "male": "MALE",
      "female": "FEMALE"
    },
    "weight": {
      "title": "HOW MUCH DO YOU WEIGH?",
      "subtitle": "We use this for accurate calorie calculations",
      "unit": "kg",
      "placeholder": "70"
    },
    "height": {
      "title": "HOW TALL ARE YOU?",
      "subtitle": "For accurate fitness reports",
      "unit": "cm",
      "placeholder": "175"
    },
    "birthday": {
      "title": "WHEN WERE YOU BORN?",
      "subtitle": "Minimum 13 years old",
      "ageDisplay": "You are {{age}} years old",
      "tooYoung": "You must be at least 13 years old",
      "invalidDate": "Invalid date",
      "day": "Day",
      "month": "Month",
      "year": "Year"
    },
    "goal": {
      "title": "WHAT'S YOUR GOAL?",
      "weight_loss": "WEIGHT LOSS",
      "strength": "STRENGTH",
      "cardio": "CARDIO",
      "health": "HEALTH",
      "weight_loss_desc": "Burn calories and reduce body weight",
      "strength_desc": "Build muscle mass and strength",
      "cardio_desc": "Improve endurance and cardio",
      "health_desc": "Overall health and active lifestyle"
    },
    "profile": {
      "sectionTitle": "MY DATA",
      "editButton": "Edit",
      "completeBanner": "Complete your profile for a personalized experience",
      "completeButton": "Complete now",
      "goalLabel": "Goal"
    },
    "skipConfirmTitle": "Skip profile setup?",
    "skipConfirmMessage": "You can fill in your data later from your profile.",
    "skipConfirmYes": "Skip",
    "skipConfirmNo": "Continue",
    "saveError": "Error saving data"
  }
}
```

---

### Edge Cases (Mobile Agent must handle)

| Case | Behavior |
|------|----------|
| Back on step 1 (gender) | `Alert.alert("Preskoči?")` → Yes: `skip()` → home / No: stay |
| Empty weight/height | `nextDisabled = true` |
| Invalid birthday (Feb 31) | Auto-correct or show error, nextDisabled |
| Age < 13 | `nextDisabled = true` + "Moraš imati najmanje 13 godina" |
| Network error on submit | Toast error + retry, data preserved in store |
| User already has `onboarding_completed = true` | Skip wizard, go to home (handled by `computeOnboardingStep`) |
| Edit mode: no changes made | `router.back()` without API call |
| App killed mid-wizard | On next launch, `authStore.onboardingStep = 'profile_setup'` → resumes at step-gender (data lost, but that's acceptable) |

---

### What NOT to Change

```
❌ Auth logic (login, register, password reset)
❌ Home screen
❌ Workout screen
❌ BLE service
❌ Existing profile fields (avatar, username, gym)
❌ UserSettingsSheet.tsx (leave as-is, profile.tsx gets the new section)
```

---

## Testing Requirements

### DBA
- [ ] Migration applies cleanly (`supabase db push`)
- [ ] Existing users have `onboarding_completed = true`
- [ ] New user gets `onboarding_completed = false`
- [ ] CHECK constraints work (invalid gender, negative weight, etc.)
- [ ] `get_user_age()` returns correct age
- [ ] RLS: user can update own profile fields
- [ ] RLS: user cannot update another user's profile

### Mobile
- [ ] New user flow: auth → stepper → username → avatar → notifications → gender → weight → height → birthday → goal → home
- [ ] Returning user (existing, completed): goes directly to home
- [ ] Skip on any step → sets `onboarding_completed = true`, goes to home
- [ ] Back on step 1 → skip confirmation alert
- [ ] Edit from profile.tsx → pre-fills values, no skip button, finish → back
- [ ] Profile screen shows compact data when filled
- [ ] Profile screen shows CTA banner when empty
- [ ] All 5 steps follow design system (LinearGradient, Bebas Neue, haptics, FadeInDown)
- [ ] Localization: both SR and EN work
- [ ] TypeScript: 0 errors

---

## Completion Report Format

```
ONBOARDING PROFILE SETUP COMPLETE

DBA:
  ✅ Migration 20260312000001 — 6 new columns on profiles
  ✅ CHECK constraints + indexes
  ✅ Existing users migrated (onboarding_completed = true)
  ✅ get_user_age() function
  ✅ get_my_profile() updated (if needed)
  ✅ Types regenerated

Mobile:
  ✅ authStore — profile_setup step + ProfileData extended
  ✅ index.tsx — profile_setup routing
  ✅ (onboarding)/_layout.tsx — 5 new screens registered
  ✅ notifications.tsx — chains to profile wizard
  ✅ hooks/useOnboardingWizard.ts — Zustand store
  ✅ components/OnboardingStep.tsx — shared wrapper
  ✅ step-gender.tsx — 2 cards + haptics
  ✅ step-weight.tsx — TextInput + quick select
  ✅ step-height.tsx — TextInput + quick select
  ✅ step-birthday.tsx — DD/MM/YYYY inputs + age display
  ✅ step-goal.tsx — 2x2 grid + ZAVRŠI
  ✅ profile.tsx — "Moji podaci" section + edit flow
  ✅ i18n — SR + EN onboarding keys added
  ✅ TypeScript: 0 errors
  ✅ No hardcoded strings
```
