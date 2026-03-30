# SWEATDROP — Onboarding & Auth Full Redesign Plan

> **Created:** 2026-03-04 by System Architect  
> **Target Agent:** Mobile Coder  
> **Backend Dependency:** `20260304000020_auth_foundation.sql` (already applied)  
> **Status:** READY FOR EXECUTION

---

## ⚠️ BEFORE STARTING — Install Dependencies First

```bash
cd apps/mobile-app
npx expo install expo-apple-authentication
pnpm add @react-native-google-signin/google-signin
```

Then verify both are in `package.json` before proceeding with any code changes.

---

## 0. PRE-FLIGHT: Codebase State Summary

### Files That Exist (Read ALL Before Coding)

| File | Status | Notes |
|------|--------|-------|
| `app/(onboarding)/auth.tsx` | 🔴 REWRITE | Web OAuth, no Apple, 3 listeners |
| `app/(onboarding)/welcome.tsx` | 🔴 REWRITE | English text, no stepper |
| `app/(onboarding)/username.tsx` | 🔴 REWRITE | Navigates to home-gym, English |
| `app/(onboarding)/home-gym.tsx` | 🔴 DELETE | Gym join removed from onboarding |
| `app/(onboarding)/_layout.tsx` | 🟡 MODIFY | Remove home-gym route |
| `app/index.tsx` | 🔴 REWRITE | Race condition, no authStore |
| `app/_layout.tsx` | 🟡 MODIFY | Duplicate auth listener |
| `app/home.tsx` | 🟡 MODIFY | No empty state for gym-less users |
| `app/profile.tsx` | ✅ DESIGN REFERENCE | Gold standard — match this style |
| `lib/theme.ts` | ✅ READ ONLY | Use these tokens everywhere |
| `lib/supabase.ts` | ✅ READ ONLY | Supabase client singleton |
| `lib/notifications.ts` | ✅ READ ONLY | PUSH_NOTIFICATIONS_ENABLED flag |
| `lib/stores/useGymStore.ts` | ✅ READ ONLY | Gym state — don't modify |
| `hooks/useSession.ts` | 🟡 REWRITE | Thin wrapper around authStore (backward compat) |
| `app.config.js` | 🟡 MODIFY | Add Google Sign-In plugin |

### Files That Don't Exist Yet (Create)

| File | Purpose |
|------|---------|
| `lib/stores/authStore.ts` | Zustand auth state (session, profile, onboarding) |
| `app/(onboarding)/stepper.tsx` | "How it works" — 3-step intro screen |
| `app/(onboarding)/avatar.tsx` | Avatar emoji selection screen |
| `app/(onboarding)/notifications.tsx` | Push notification permission screen |

### Backend RPCs Available (from migration `20260304000020`)

```
get_my_profile()          → Returns full profile row for current user
update_profile(           → Updates username, avatar_url, expo_push_token
  p_username TEXT,
  p_avatar_url TEXT,
  p_expo_push_token TEXT
)
```

### Current Dependencies (from package.json)

```
✅ Installed:
  expo-auth-session, expo-web-browser, expo-crypto,
  expo-blur, expo-linear-gradient, expo-haptics,
  react-native-reanimated, zustand, @supabase/supabase-js

❌ NOT Installed (need to add):
  @react-native-google-signin/google-signin
  expo-apple-authentication
```

---

## 1. DESIGN SYSTEM — MANDATORY RULES

### Reference: `app/profile.tsx` IS THE GOLD STANDARD

Every screen you build must be visually consistent with `profile.tsx`. If in doubt, look at `profile.tsx`.

### Background (All Screens)

```typescript
// ALWAYS use this background combo
<LinearGradient
  colors={['#000000', '#0A0E1A', '#000000']}
  start={{ x: 0.5, y: 0 }}
  end={{ x: 0.5, y: 1 }}
  style={StyleSheet.absoluteFillObject}
/>
```

### Cards (Glass Effect)

```typescript
// Glass card pattern from profile.tsx
<View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
  <BlurView intensity={50} tint="dark" style={[styles.cardBlur, {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  }]}>
    {/* Card content */}
  </BlurView>
</View>
```

**Card styles:**
```typescript
card: {
  borderRadius: theme.borderRadius.xl,  // 20
  borderWidth: 1,
  overflow: 'hidden',
  marginBottom: theme.spacing.lg,
},
cardBlur: {
  borderRadius: theme.borderRadius.xl,
  overflow: 'hidden',
},
```

### Buttons

**Primary (CTA) — Solid Teal, NO gradient:**
```typescript
<TouchableOpacity style={styles.primaryButton} activeOpacity={0.8}>
  <View style={styles.primaryButtonInner}>
    <Text style={styles.buttonText}>Nastavi</Text>
    <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
  </View>
</TouchableOpacity>

// Styles
primaryButton: {
  borderRadius: theme.borderRadius.full,
  overflow: 'hidden',
  backgroundColor: theme.colors.primary,  // #00E5FF — solid, no gradient
  ...theme.shadows.glow,
},
primaryButtonInner: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing.sm,
  paddingVertical: theme.spacing.lg,
  paddingHorizontal: theme.spacing.xl,
},
buttonText: {
  color: theme.colors.background,         // #000000 — black text on teal
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.bold,
  letterSpacing: 1,
  textTransform: 'uppercase',
},
```

**⚠️ DO NOT use LinearGradient for primary buttons. Solid `#00E5FF` only.**

**Secondary (Ghost):**
```typescript
secondaryButton: {
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: theme.glass.border,
  borderRadius: theme.borderRadius.full,
  paddingVertical: theme.spacing.lg,
  alignItems: 'center',
},
```

**Social Button (Google/Apple):**
```typescript
socialButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.glass.background,  // 'rgba(255, 255, 255, 0.05)'
  borderRadius: theme.borderRadius.full,
  borderWidth: 1,
  borderColor: theme.glass.border,          // 'rgba(255, 255, 255, 0.1)'
  paddingVertical: theme.spacing.lg,
  gap: theme.spacing.md,
},
```

### Typography

```typescript
// Title (screen headers)
title: {
  fontSize: theme.typography.fontSize['2xl'],  // 24
  fontWeight: theme.typography.fontWeight.bold, // '700'
  color: theme.colors.text,                    // '#FFFFFF'
  letterSpacing: 1,
  textTransform: 'uppercase',
},

// Subtitle
subtitle: {
  fontSize: theme.typography.fontSize.base,    // 16
  color: theme.colors.textSecondary,           // '#B0B0B0'
  letterSpacing: 0.5,
  textAlign: 'center',
},

// Body
body: {
  fontSize: theme.typography.fontSize.base,
  color: theme.colors.textSecondary,
  lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
},
```

### Input Fields

```typescript
inputContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: theme.glass.background,
  borderRadius: theme.borderRadius.lg,
  borderWidth: 1,
  borderColor: theme.glass.border,
  paddingHorizontal: theme.spacing.md,
},
input: {
  flex: 1,
  paddingVertical: theme.spacing.md,
  fontSize: theme.typography.fontSize.base,
  color: theme.colors.text,
  letterSpacing: 0.3,
},
```

### Animations

```typescript
import Animated, { FadeInDown } from 'react-native-reanimated';

// Page entrance
<Animated.View entering={FadeInDown.delay(100).duration(500)}>
  {/* Content */}
</Animated.View>

// Stagger children (increment delay by 100ms)
// delay(100), delay(200), delay(300), ...
```

### Color Palette Quick Reference

```
Background:        #000000 (pure black)
Gradient mid:      #0A0E1A (background gradient only, NOT buttons)
Primary (Teal):    #00E5FF (solid — used for buttons, accents, glow)
Text:              #FFFFFF
Text Secondary:    #B0B0B0
Text Tertiary:     #808080
Glass BG:          rgba(255, 255, 255, 0.05)
Glass Border:      rgba(255, 255, 255, 0.1)
Card BG:           rgba(20, 20, 30, 0.75)
Error:             #FF5252
Success:           #00E5FF (same as primary)
Orange Accent:     #FF9100
```

**⚠️ NO GRADIENT ON BUTTONS. Primary buttons = solid `#00E5FF`.
Background gradient is fine (`['#000000', '#0A0E1A', '#000000']`).**

### hexToRgba Helper (Copy from profile.tsx)

```typescript
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

---

## 2. CRITICAL PROBLEMS IN CURRENT CODE

### Problem 1: Three Concurrent `onAuthStateChange` Listeners

**Where:**
1. `app/_layout.tsx` line 118 — sets local `session` state
2. `hooks/useSession.ts` line 17 — sets its own `session` state
3. `app/(onboarding)/auth.tsx` line 40 — handles OAuth redirects

**Impact:** Race conditions, double navigations, stale state.

**Fix:** One listener in `authStore`. All screens read from store. Zero local listeners.

### Problem 2: Google Sign-In Uses Web OAuth (Browser)

**Where:** `auth.tsx` line 244 — `supabase.auth.signInWithOAuth({ provider: 'google' })`

**Impact:** Opens browser, janky UX, nonce errors on return.

**Fix:** Use `@react-native-google-signin/google-signin` for native flow, pass `idToken` to `supabase.auth.signInWithIdToken()`.

### Problem 3: No Apple Sign-In

**Where:** Nowhere — doesn't exist.

**Impact:** App Store rejection. Apple requires Apple Sign-In when other social logins exist.

**Fix:** Add `expo-apple-authentication` with native flow.

### Problem 4: `home-gym.tsx` Still Exists

**Where:** `app/(onboarding)/home-gym.tsx`

**Impact:** Contradicts architecture decision — gym join happens on QR scan.

**Fix:** Delete the file. Remove from `_layout.tsx`. Update `username.tsx` to navigate to avatar screen instead.

### Problem 5: No Onboarding State Machine

**Where:** Nowhere — doesn't exist.

**Impact:** If user closes app mid-onboarding, they restart from the beginning or skip steps.

**Fix:** Create `authStore` with onboarding step tracking, persisted to AsyncStorage.

### Problem 6: Empty Home State Missing

**Where:** `home.tsx` — assumes gym data exists.

**Impact:** New users with no gym see broken UI.

**Fix:** Add empty state with QR scan CTA when `homeGymId === null`.

---

## 3. EXECUTION PLAN — STEP BY STEP

### EXECUTION ORDER (STRICT — DO NOT REORDER)

```
STEP 1:  Install dependencies
STEP 2:  Create authStore (Zustand)                  ← EVERYTHING depends on this
STEP 3:  Update app.config.js (Google Sign-In plugin)
STEP 4:  Rewrite _layout.tsx (single auth listener)
STEP 5:  Rewrite hooks/useSession.ts (thin wrapper)  ← NE BRIŠI, prepiši kao wrapper
STEP 6:  Delete app/(onboarding)/home-gym.tsx
STEP 7:  Update (onboarding)/_layout.tsx
STEP 8:  Rewrite auth.tsx (native Google + Apple)
STEP 9:  Create stepper.tsx (how it works, 3 steps)  ← NOVO
STEP 10: Rewrite username.tsx (display name)
STEP 11: Create avatar.tsx (new screen)
STEP 12: Create notifications.tsx (new screen)
STEP 13: Rewrite index.tsx (entry point)
STEP 14: Rewrite welcome.tsx
STEP 15: Update home.tsx (empty state + available gyms)
STEP 16: Replace useSession imports across all screens
```

---

### STEP 1: Install Dependencies

**Action:** Run in terminal (from monorepo root)

```bash
pnpm add @react-native-google-signin/google-signin --filter sweatdrop-mobile-app
pnpm add expo-apple-authentication --filter sweatdrop-mobile-app
```

**Verification:** Check `apps/mobile-app/package.json` has both packages.

**NOTE:** After install, native rebuild required:
```bash
cd apps/mobile-app && npx expo prebuild --clean
```

---

### STEP 2: Create `lib/stores/authStore.ts`

**File:** `apps/mobile-app/lib/stores/authStore.ts`

**This is THE critical file.** Everything else depends on it.

**Requirements:**
- Zustand store with `persist` middleware (AsyncStorage)
- Single `onAuthStateChange` subscription
- Profile data from `get_my_profile()` RPC
- Onboarding step tracking
- NO direct Supabase queries in screens — all through store actions

**Interface Contract:**

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Onboarding steps — MUST match the screen flow exactly
type OnboardingStep = 'auth' | 'stepper' | 'display_name' | 'avatar' | 'notifications' | 'done';

interface ProfileData {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  total_drops: number;
  available_drops: number;
  weekly_drops: number;
  monthly_drops: number;
  streak_days: number;
  is_newcomer: boolean;
  role: string;
  home_gym_id: string | null;
  expo_push_token: string | null;
  created_at: string;
}

interface AuthState {
  // State
  session: Session | null;
  profile: ProfileData | null;
  onboardingStep: OnboardingStep;
  isInitialized: boolean;  // true after first getSession() call
  isLoading: boolean;

  // Actions
  initialize: () => () => void;     // Returns cleanup function
  fetchProfile: () => Promise<void>;
  updateProfile: (params: {
    username?: string;
    avatar_url?: string;
    expo_push_token?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  setOnboardingStep: (step: OnboardingStep) => void;
  signOut: () => Promise<void>;
  reset: () => void;
}
```

**Implementation Details:**

1. **`initialize()`** — Called ONCE in `_layout.tsx`:
   - Calls `supabase.auth.getSession()` to get initial session
   - Sets up single `onAuthStateChange` listener
   - If session exists, calls `fetchProfile()`
   - Sets `isInitialized = true`
   - Returns unsubscribe function for cleanup

2. **`fetchProfile()`** — Loads profile from Supabase:
   - Calls `supabase.rpc('get_my_profile')`
   - Updates `profile` state
   - Determines `onboardingStep` based on profile data:
     ```
     IF no session           → 'auth'
     IF first login (just signed up, no stepper seen)  → 'stepper'
     IF username starts with 'user_' OR username length < 2  → 'display_name'
     IF avatar_url is null   → 'avatar'
     IF expo_push_token is null AND PUSH_NOTIFICATIONS_ENABLED → 'notifications'
     ELSE                    → 'done'
     ```
   - **Stepper detection:** The stepper is shown once after first auth.
     Use the persisted `onboardingStep` value — if it's still `'auth'` after
     session exists, advance to `'stepper'`. Once user passes stepper,
     it sets step to `'display_name'` and is never shown again.
   - **CRITICAL:** The step detection logic must run every time profile changes

3. **`updateProfile()`** — Wraps `supabase.rpc('update_profile')`:
   - Calls RPC with provided params
   - On success, re-fetches profile (to keep store in sync)
   - Returns `{ success: true }` or `{ success: false, error: 'message' }`

4. **`signOut()`** — Clean logout:
   - Calls `supabase.auth.signOut()`
   - Calls `reset()` to clear all state

5. **Persistence:**
   - Persist `onboardingStep` ONLY (not session — Supabase handles that)
   - Use `partialize` to select only what needs to persist:
     ```typescript
     partialize: (state) => ({
       onboardingStep: state.onboardingStep,
     }),
     ```

**IMPORTANT — DO NOT:**
- ❌ Don't persist `session` (Supabase AsyncStorage handles this)
- ❌ Don't persist `profile` (always fetch fresh on app start)
- ❌ Don't create multiple auth subscriptions anywhere else

---

### STEP 3: Update `app.config.js`

**File:** `apps/mobile-app/app.config.js`

**Changes:**
1. Add `@react-native-google-signin/google-signin` to plugins
2. Add `GoogleService-Info.plist` reference for iOS

```javascript
plugins: [
  'expo-router',
  [
    'react-native-vision-camera',
    {
      cameraPermissionText: 'SweatDrop koristi kameru za skeniranje QR kodova na fitnes spravama.',
    },
  ],
  [
    '@react-native-google-signin/google-signin',
    {
      iosUrlScheme: 'com.googleusercontent.apps.YOUR_IOS_CLIENT_ID',
    },
  ],
  // expo-apple-authentication does NOT need a config plugin
  // It works automatically when bundleIdentifier is set
  // ... existing plugins
],
```

**NOTE:** The `iosUrlScheme` value must match the reversed client ID from `GoogleService-Info.plist`. The user will need to update this with their actual value. Use a placeholder and add a comment:
```javascript
// TODO: Replace with actual iOS client ID from Google Cloud Console
// Format: com.googleusercontent.apps.{CLIENT_ID}
```

---

### STEP 4: Rewrite `app/_layout.tsx`

**File:** `apps/mobile-app/app/_layout.tsx`

**Current Problems:**
- Has its own `onAuthStateChange` listener (line 118)
- Local `session` state that competes with `useSession` hook
- Push notification registration tied to local session state

**Changes:**
1. Remove local `session` state
2. Remove `onAuthStateChange` listener
3. Import and call `authStore.initialize()` in `useEffect`
4. Read `session` from `authStore` instead of local state
5. Keep push notification registration but use `authStore.session`
6. Keep BLE initialization as-is
7. Keep ThemeProvider and GymDataInitializer as-is

**New Structure:**
```typescript
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { GymDataInitializer } from '@/components/GymDataInitializer';
import { useAuthStore } from '@/lib/stores/authStore';
import BleManager from 'react-native-ble-manager';
import * as SplashScreen from 'expo-splash-screen';
import {
  PUSH_NOTIFICATIONS_ENABLED,
  configureNotificationHandler,
  registerForPushNotifications,
  savePushToken,
  addNotificationListeners,
  getInitialNotification,
  getDeepLinkFromNotification,
} from '@/lib/notifications';

// ... keep existing notification handler setup ...

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const session = useAuthStore((s) => s.session);

  // Single auth initialization
  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, []);

  // ... keep BLE initialization ...
  // ... keep push notification logic (but use authStore session) ...

  return (
    <ThemeProvider>
      <GymDataInitializer />
      <StackNavigator />
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
```

**Keep `StackNavigator` as-is** — all existing screen routes stay the same.

**Add new screens to Stack:**
```typescript
<Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: 'fade' }} />
```

The `(onboarding)` group already exists in the layout. No new Stack.Screen entries needed for the onboarding sub-screens since they're in a nested layout.

---

### STEP 5: Rewrite `hooks/useSession.ts` as Thin Wrapper

**File:** `apps/mobile-app/hooks/useSession.ts`

**⚠️ DO NOT DELETE THIS FILE.** Many screens import `useSession`. Deleting it
breaks `home.tsx`, `profile.tsx`, and potentially other screens immediately.

**Action:** Rewrite as a thin wrapper that delegates to `authStore`.

**New Implementation:**
```typescript
import { useAuthStore } from '@/lib/stores/authStore';

/**
 * @deprecated Use useAuthStore directly instead.
 * This wrapper exists for backward compatibility.
 * New screens should import useAuthStore.
 */
export function useSession() {
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  return {
    session,
    loading: !isInitialized,
    // Legacy compat — some screens check user directly
    user: session?.user ?? null,
  };
}
```

**Why wrapper instead of delete:**
- `home.tsx`, `profile.tsx`, `workout.tsx`, and other screens import `useSession`
- Deleting the file causes immediate TypeScript errors across the app
- Wrapper delegates to authStore so there's only ONE source of truth
- New screens should import `useAuthStore` directly
- Over time, migrate existing screens and eventually remove the wrapper

---

### STEP 6: Delete `app/(onboarding)/home-gym.tsx`

**File:** `apps/mobile-app/app/(onboarding)/home-gym.tsx`

**Action:** DELETE this file entirely.

**Reason:** Gym join was removed from onboarding. Gym is auto-assigned on first QR scan.

---

### STEP 7: Update `app/(onboarding)/_layout.tsx`

**File:** `apps/mobile-app/app/(onboarding)/_layout.tsx`

**Current:**
```typescript
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="welcome" />
  <Stack.Screen name="auth" />
  <Stack.Screen name="username" />
  <Stack.Screen name="home-gym" />
</Stack>
```

**New:**
```typescript
<Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
  <Stack.Screen name="welcome" />
  <Stack.Screen name="auth" />
  <Stack.Screen name="stepper" />
  <Stack.Screen name="username" />
  <Stack.Screen name="avatar" />
  <Stack.Screen name="notifications" />
</Stack>
```

**Changes:**
- Remove `home-gym`
- Add `stepper` (how it works — after auth)
- Add `avatar`
- Add `notifications`
- Add `animation: 'slide_from_right'` for smooth transitions

---

### STEP 8: Rewrite `app/(onboarding)/auth.tsx`

**File:** `apps/mobile-app/app/(onboarding)/auth.tsx`

**This is a COMPLETE rewrite.** Delete all existing code and start fresh.

**Requirements:**

1. **Layout:** Match profile.tsx glass card style
2. **Social buttons at top** (Google, Apple), email below
3. **Native Google Sign-In** (NOT web OAuth)
4. **Native Apple Sign-In**
5. **Email/password toggle** (sign in / sign up)
6. **Role guard** (reject admin accounts)
7. **NO `onAuthStateChange` listener** — authStore handles this
8. **After successful auth:** call `authStore.fetchProfile()`, then navigate based on `onboardingStep` (first-time users → stepper)

**UI Layout (top to bottom):**
```
[Water Drop Icon with Glow]
"Prijavi se"   (title)
"Kreni da treniraš i osvajaj nagrade" (subtitle)

[─── Continue with Google ───]    ← Social button style
[─── Continue with Apple ───]     ← Apple only on iOS

────── ili ──────

[Email input]
[Password input]
[Sign In / Sign Up toggle]
[Primary CTA button]

"Nastavljanjem prihvataš uslove korišćenja" (footer)
```

**Google Sign-In Implementation:**
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure (once, at top of file)
GoogleSignin.configure({
  // webClientId comes from Google Cloud Console
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

const handleGoogleSignIn = async () => {
  try {
    setLoading(true);
    await GoogleSignin.hasPlayServices();
    const signInResult = await GoogleSignin.signIn();
    const idToken = signInResult?.data?.idToken;

    if (!idToken) {
      throw new Error('No ID token received from Google');
    }

    // Sign in with Supabase using the ID token
    // CRITICAL: Do NOT pass nonce for Google Sign-In
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) throw error;

    // Let authStore handle the session update
    // The onAuthStateChange in authStore will fire
    // Wait for profile fetch, then navigate
    await authStore.fetchProfile();
    navigateToNextStep();
  } catch (error: any) {
    if (error.code !== 'SIGN_IN_CANCELLED') {
      Alert.alert('Greška', error.message || 'Google prijava nije uspela');
    }
  } finally {
    setLoading(false);
  }
};
```

**Apple Sign-In Implementation:**
```typescript
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

const handleAppleSignIn = async () => {
  try {
    setLoading(true);
    const nonce = Math.random().toString(36).substring(2, 10);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      nonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: nonce,  // raw nonce, NOT hashed
    });

    if (error) throw error;

    await authStore.fetchProfile();
    navigateToNextStep();
  } catch (error: any) {
    if (error.code !== 'ERR_REQUEST_CANCELED') {
      Alert.alert('Greška', error.message || 'Apple prijava nije uspela');
    }
  } finally {
    setLoading(false);
  }
};
```

**Email/Password:**
- Keep existing sign in / sign up logic from current auth.tsx
- But remove the `onAuthStateChange` listener
- After successful sign in/up, manually call `authStore.fetchProfile()`

**Role Guard:**
- After sign in, check `authStore.profile.role`
- If role is NOT `'user'` or `'member'`, sign out and show error
- This replaces the inline role check in current auth.tsx

**Navigation Logic:**
```typescript
const navigateToNextStep = () => {
  const step = useAuthStore.getState().onboardingStep;
  switch (step) {
    case 'stepper':
      router.replace('/(onboarding)/stepper');
      break;
    case 'display_name':
      router.replace('/(onboarding)/username');
      break;
    case 'avatar':
      router.replace('/(onboarding)/avatar');
      break;
    case 'notifications':
      router.replace('/(onboarding)/notifications');
      break;
    case 'done':
      router.replace('/home');
      break;
    default:
      router.replace('/home');
  }
};
```

**Apple button visibility:**
```typescript
{Platform.OS === 'ios' && (
  <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignIn}>
    <Ionicons name="logo-apple" size={20} color={theme.colors.text} />
    <Text style={styles.socialButtonText}>Nastavi sa Apple</Text>
  </TouchableOpacity>
)}
```

---

### STEP 9: Create `app/(onboarding)/stepper.tsx`

**File:** `apps/mobile-app/app/(onboarding)/stepper.tsx` (NEW)

**Purpose:** "How it works" intro screen — explains the app concept in 3 steps.
Shown ONCE after first auth, never again.

**UI Layout:**
```
[Background: standard gradient]

"Kako funkcioniše"  (title — centered)

[Step Cards — vertical, staggered FadeInDown animation]

  ┌──────────────────────────────────────────┐
  │  💧  1. Treniraj i osvajaj kapi         │
  │      Svaki trening na spravi ti donosi   │
  │      Sweat Drops — što duže treniraš,    │
  │      više kapljica padne.                │
  └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │  🏆  2. Takmiči se                       │
  │      Ispunjavaj izazove, osvajaj bedževe │
  │      i penji se na leaderboard u svojoj  │
  │      teretani.                           │
  └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │  🎁  3. Menjaj kapi za nagrade          │
  │      Zameni svoje kapi za proteine,      │
  │      merch i popuste kod recepcije.      │
  └──────────────────────────────────────────┘

[Primary CTA: "Razumem, idemo!"]
```

**Implementation Details:**
- 3 glass cards with icon + text, staggered animation (delay 200, 400, 600ms)
- Each card uses the standard glass card style (BlurView + dark background)
- Icon on the left (fontSize: 32), step number + title bold, description below
- Primary CTA at bottom
- On press: `authStore.setOnboardingStep('display_name')`, navigate to username

**Card Component:**
```typescript
const steps = [
  {
    icon: '💧',
    title: 'Treniraj i osvajaj kapi',
    description: 'Svaki trening na spravi ti donosi Sweat Drops — što duže treniraš, više kapljica padne.',
  },
  {
    icon: '🏆',
    title: 'Takmiči se',
    description: 'Ispunjavaj izazove, osvajaj bedževe i penji se na leaderboard u svojoj teretani.',
  },
  {
    icon: '🎁',
    title: 'Menjaj kapi za nagrade',
    description: 'Zameni svoje kapi za proteine, merch i popuste kod recepcije.',
  },
];

// Render each step card with staggered animation
{steps.map((step, index) => (
  <Animated.View
    key={index}
    entering={FadeInDown.delay((index + 1) * 200).duration(500)}
  >
    <View style={styles.card}>
      <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
        <View style={styles.stepRow}>
          <Text style={styles.stepIcon}>{step.icon}</Text>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{`${index + 1}. ${step.title}`}</Text>
            <Text style={styles.stepDescription}>{step.description}</Text>
          </View>
        </View>
      </BlurView>
    </View>
  </Animated.View>
))}
```

**Navigation:**
```typescript
const handleContinue = () => {
  authStore.setOnboardingStep('display_name');
  router.replace('/(onboarding)/username');
};
```

---

### STEP 10: Rewrite `app/(onboarding)/username.tsx`

**File:** `apps/mobile-app/app/(onboarding)/username.tsx`

**Current Problems:**
- All English text
- Navigates to `home-gym` (deleted)
- Uses direct Supabase queries instead of `update_profile()` RPC
- No connection to authStore

**Changes:**

1. **Change title:** "Kako da te zovemo?" (How should we call you?)
2. **Change subtitle:** "Ovo ime će se prikazivati na leaderboardima"
3. **Pre-fill from OAuth:** If `authStore.profile.full_name` exists, pre-fill input
4. **Use `authStore.updateProfile()`** instead of direct Supabase update
5. **Navigate to avatar screen** on success (NOT home-gym)
6. **Update onboarding step:** `authStore.setOnboardingStep('avatar')` on success

**Implementation:**
```typescript
import { useAuthStore } from '@/lib/stores/authStore';

export default function DisplayNameScreen() {
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  // Pre-fill with OAuth name
  const [displayName, setDisplayName] = useState(
    profile?.full_name || profile?.username || ''
  );

  const handleContinue = async () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      Alert.alert('Greška', 'Ime mora imati najmanje 2 karaktera');
      return;
    }

    setLoading(true);
    const result = await updateProfile({ username: displayName.trim() });
    setLoading(false);

    if (result.success) {
      setOnboardingStep('avatar');
      router.replace('/(onboarding)/avatar');
    } else {
      if (result.error?.includes('already taken')) {
        Alert.alert('Greška', 'Ovo ime je već zauzeto. Probaj drugo.');
      } else {
        Alert.alert('Greška', result.error || 'Nešto je pošlo naopako');
      }
    }
  };
  // ... UI matching design system
}
```

---

### STEP 11: Create `app/(onboarding)/avatar.tsx`

**File:** `apps/mobile-app/app/(onboarding)/avatar.tsx` (NEW)

**Purpose:** User selects an avatar emoji. This is stored as `avatar_url` in the profile (emoji string, not actual URL).

**UI Layout:**
```
[Selected Emoji — large, centered, with glow ring]
"Izaberi svoj avatar"  (title)
"Ovo se prikazuje pored tvog imena" (subtitle)

[Emoji Grid — 3 columns, 4 rows]
  🔥 💧 ⚡ 
  🏋️ 🎯 💪 
  🌟 🏆 👟 
  🦾 🧊 🐉

[Primary CTA: "Nastavi"]
[Secondary: "Preskoči"]   ← Sets avatar to null, continues
```

**Implementation Details:**
- Grid of 12 emoji options (hardcoded array)
- Selected emoji shown large at top (fontSize: 64) with cyan glow border
- On select: call `authStore.updateProfile({ avatar_url: selectedEmoji })`
- On "Preskoči": set step to 'notifications', navigate
- On success: set step to 'notifications', navigate to notifications screen

**Styling:** Match profile.tsx hero card look. The selected emoji should be in a circle with a glowing border, similar to the avatar container in profile.tsx.

---

### STEP 12: Create `app/(onboarding)/notifications.tsx`

**File:** `apps/mobile-app/app/(onboarding)/notifications.tsx` (NEW)

**Purpose:** Ask for push notification permission with context.

**UI Layout:**
```
[Bell Icon — large, with glow]
"Ostani u toku"  (title)
"Obaveštavamo te o novim izazovima,
nagradi na leaderboardu i podsetnicima
za streak."  (subtitle)

[Primary CTA: "Uključi obaveštenja"]
[Secondary: "Ne sada"]
```

**Implementation:**
```typescript
import { PUSH_NOTIFICATIONS_ENABLED, registerForPushNotifications } from '@/lib/notifications';
import { useAuthStore } from '@/lib/stores/authStore';

const handleEnable = async () => {
  if (PUSH_NOTIFICATIONS_ENABLED) {
    const token = await registerForPushNotifications();
    if (token) {
      await authStore.updateProfile({ expo_push_token: token });
    }
  }
  completeOnboarding();
};

const handleSkip = () => {
  completeOnboarding();
};

const completeOnboarding = () => {
  authStore.setOnboardingStep('done');
  router.replace('/home');
};
```

**If `PUSH_NOTIFICATIONS_ENABLED` is false:** Skip this screen entirely (authStore's onboarding step detection should skip 'notifications' when flag is false).

---

### STEP 13: Rewrite `app/index.tsx`

**File:** `apps/mobile-app/app/index.tsx`

**Current Problems:**
- Uses `useSession` hook (deleted in Step 5)
- Has its own username checking logic (duplicates authStore)
- Race condition with splash screen hiding

**New Implementation:**
```typescript
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/lib/stores/authStore';

SplashScreen.preventAutoHideAsync();

export default function Index() {
  const router = useRouter();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);

  useEffect(() => {
    if (!isInitialized) return;  // Wait for auth to initialize

    const navigate = async () => {
      await SplashScreen.hideAsync();

      // Small delay for smooth transition
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!session) {
        router.replace('/(onboarding)/welcome');
      } else if (onboardingStep !== 'done') {
        // Resume onboarding at the correct step
        switch (onboardingStep) {
          case 'auth':
            router.replace('/(onboarding)/auth');
            break;
          case 'stepper':
            router.replace('/(onboarding)/stepper');
            break;
          case 'display_name':
            router.replace('/(onboarding)/username');
            break;
          case 'avatar':
            router.replace('/(onboarding)/avatar');
            break;
          case 'notifications':
            router.replace('/(onboarding)/notifications');
            break;
          default:
            router.replace('/home');
        }
      } else {
        router.replace('/home');
      }
    };

    navigate();
  }, [isInitialized, session, onboardingStep]);

  return null;  // Splash screen is still visible
}
```

**Key Difference:** No Supabase calls, no local state, no race conditions. Just reads from authStore.

---

### STEP 14: Rewrite `app/(onboarding)/welcome.tsx`

**File:** `apps/mobile-app/app/(onboarding)/welcome.tsx`

**Changes:**
- Translate all text to Serbian (informal)
- Update design to match system
- Add app description steps

**UI Layout:**
```
[Water Drop Icon with Glow — same as current]
"Dobrodošao u SweatDrop"  (title)

"Treniraj. Osvajaj kapi 💧.
Menjaj ih za nagrade u teretani."  (subtitle)

[Feature Pills — horizontal]
  💧 "Osvajaj kapi"
  🏆 "Takmičenja"
  🎁 "Nagrade"

[Primary CTA: "Započni"]
```

**Keep:** The current icon glow animation and gradient background — they're already correct.

---

### STEP 15: Update `home.tsx` — Empty State + Available Gyms

**File:** `apps/mobile-app/app/home.tsx`

**Add empty state** when `homeGymId === null` AND user has no gym memberships.

**Where to add:** After the header, before the hero section. Wrap the main content in a conditional:

```typescript
const { homeGymId } = useGymStore();

// If no home gym, show empty state
if (!homeGymId && !loading) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#080808', '#0A0E1A', '#080808']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.emptyStateContainer}>
        {/* Header with avatar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => router.push('/profile')}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {profile?.avatar_url || profile?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.username}>{profile?.username || 'User'}</Text>
          </TouchableOpacity>
        </View>

        {/* Empty state content */}
        <View style={styles.emptyContent}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="qr-code" size={64} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Skeniraj QR kod</Text>
          <Text style={styles.emptySubtitle}>
            Skeniraj QR kod na bilo kojoj spravi{'\n'}
            u teretani da započneš trening
          </Text>
        </View>

        {/* ─── Available Gyms Section ─── */}
        <View style={styles.availableGymsSection}>
          <Text style={styles.sectionTitle}>Teretane sa SweatDrop-om</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gymScrollContent}
          >
            {availableGyms.map((gym) => (
              <View key={gym.id} style={styles.gymCard}>
                <BlurView intensity={50} tint="dark" style={styles.gymCardBlur}>
                  {gym.logo_url ? (
                    <Image source={{ uri: gym.logo_url }} style={styles.gymLogo} />
                  ) : (
                    <View style={styles.gymLogoPlaceholder}>
                      <Ionicons name="barbell" size={24} color={theme.colors.primary} />
                    </View>
                  )}
                  <Text style={styles.gymName} numberOfLines={1}>{gym.name}</Text>
                  <Text style={styles.gymAddress} numberOfLines={1}>{gym.address}</Text>
                </BlurView>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* QR FAB */}
        <View style={styles.fabContainer}>
          {/* ... same FAB button as main home screen ... */}
        </View>
      </View>
    </SafeAreaView>
  );
}
```

**Available Gyms Data:**
```typescript
// Fetch available gyms — simple query, no RPC needed
const [availableGyms, setAvailableGyms] = useState<any[]>([]);

useEffect(() => {
  const fetchGyms = async () => {
    const { data } = await supabase
      .from('gyms')
      .select('id, name, address, logo_url')
      .eq('is_active', true)
      .limit(10);
    if (data) setAvailableGyms(data);
  };
  fetchGyms();
}, []);
```

**Gym Card Styles:**
```typescript
availableGymsSection: {
  marginTop: theme.spacing.xl,
  paddingLeft: theme.spacing.lg,
},
sectionTitle: {
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.textSecondary,
  letterSpacing: 1,
  textTransform: 'uppercase',
  marginBottom: theme.spacing.md,
},
gymScrollContent: {
  paddingRight: theme.spacing.lg,
  gap: theme.spacing.md,
},
gymCard: {
  width: 140,
  borderRadius: theme.borderRadius.lg,
  borderWidth: 1,
  borderColor: theme.glass.border,
  overflow: 'hidden',
},
gymCardBlur: {
  padding: theme.spacing.md,
  alignItems: 'center',
  gap: theme.spacing.sm,
},
gymLogo: {
  width: 48,
  height: 48,
  borderRadius: 24,
},
gymLogoPlaceholder: {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: theme.glass.background,
  alignItems: 'center',
  justifyContent: 'center',
},
gymName: {
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text,
  textAlign: 'center',
},
gymAddress: {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.textTertiary,
  textAlign: 'center',
},
```

**Styling:** Use the same glass card aesthetic. Big QR icon with glow, clear CTA text.
Gym cards are compact (140px wide), horizontally scrollable, using glass style.

---

### STEP 16: Migrate Key Screens to `authStore` (Optional for MVP)

Since `useSession` is now a thin wrapper around `authStore` (Step 5),
existing screens continue to work without changes.

**However**, for new code consistency, update the most important screens
to use `authStore` directly:

**Priority screens to migrate:**
```typescript
// app/home.tsx — replace useSession with authStore
import { useAuthStore } from '@/lib/stores/authStore';
const session = useAuthStore((s) => s.session);
const profile = useAuthStore((s) => s.profile);

// app/profile.tsx — replace useSession with authStore
import { useAuthStore } from '@/lib/stores/authStore';
const session = useAuthStore((s) => s.session);
const profile = useAuthStore((s) => s.profile);
```

**Low priority:** Other screens that import `useSession` will continue to
work through the wrapper. Migrate them gradually in future PRs.

**NOTE:** Do NOT delete the wrapper. Mark it with `@deprecated` comment only.

---

## 4. WHAT NOT TO TOUCH

These files/folders are **OFF LIMITS** for this task:

```
❌ backend/supabase/          (DBA agent territory)
❌ apps/admin-panel/          (Admin agent territory)
❌ lib/ble-*.ts               (BLE code — unrelated)
❌ lib/stores/useGymStore.ts  (works correctly)
❌ components/                (existing components work)
❌ hooks/useGymData.ts        (works correctly)
❌ hooks/useLocalDrops.ts     (works correctly)
❌ hooks/useChallengeProgress.ts (works correctly)
❌ hooks/useBadgeNotifications.ts (works correctly)
❌ hooks/useHomeStats.ts      (works correctly)
❌ hooks/useAvailableArenas.ts (works correctly)
❌ app/workout.tsx            (works correctly)
❌ app/scan.tsx               (works correctly)
```

---

## 5. MANUAL STEPS (HUMAN, NOT AGENT)

These require access to external services:

### Google Cloud Console
1. Create OAuth 2.0 credentials for iOS and Android
2. Get `webClientId` and `iosClientId`
3. Download `GoogleService-Info.plist` → put in `apps/mobile-app/`
4. Download `google-services.json` → put in `apps/mobile-app/`

### Apple Developer Console
1. Create App ID with "Sign In with Apple" capability
2. Create Service ID for web (if needed for Supabase)
3. Configure in Supabase Dashboard → Auth → Providers → Apple

### Supabase Dashboard
1. Enable Google provider with client IDs
2. Enable Apple provider with Service ID
3. **IMPORTANT:** Disable email confirmation for MVP testing:
   Auth → Settings → Email → Toggle OFF "Confirm email"

### Environment Variables
Create/update `apps/mobile-app/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id
```

### Native Rebuild
After all code changes:
```bash
cd apps/mobile-app
npx expo prebuild --clean
npx expo run:ios
```

---

## 6. VERIFICATION CHECKLIST

After all steps are complete, verify:

- [ ] App starts without crash
- [ ] Splash → Welcome (if no session)
- [ ] Splash → Home (if session + completed onboarding)
- [ ] Splash → Stepper (if session + first login, never seen stepper)
- [ ] Splash → Username (if session + stepper done + no username)
- [ ] Google Sign-In works natively (no browser)
- [ ] Apple Sign-In works on iOS
- [ ] Email sign up → email sign in works
- [ ] Stepper screen shows 3 cards with animations
- [ ] Username screen saves correctly
- [ ] Avatar screen saves emoji
- [ ] Notification screen asks for permission
- [ ] Home shows empty state when no gym
- [ ] Home empty state shows "Teretane sa SweatDrop-om" horizontal scroll
- [ ] Home shows full UI when gym exists
- [ ] Profile screen still works (useSession wrapper intact)
- [ ] Logout works and redirects to welcome
- [ ] No console errors about multiple auth listeners
- [ ] No TypeScript errors
- [ ] `home-gym.tsx` is deleted
- [ ] `hooks/useSession.ts` exists as thin wrapper (NOT deleted)
- [ ] Primary buttons are solid teal (#00E5FF), NO gradient

---

## 7. COMPLETION REPORT FORMAT

When done, add to `CHANGELOG.md`:

```markdown
## [Unreleased] - 2026-03-04

### Auth & Onboarding Redesign (Mobile Agent)

#### Added
- Native Google Sign-In (replaces web OAuth flow)
- Native Apple Sign-In (App Store requirement)
- `authStore` — centralized Zustand auth state management
- Stepper screen ("How it works" — 3-step intro)
- Avatar selection screen in onboarding
- Push notification permission screen in onboarding
- Empty home state with "Teretane sa SweatDrop-om" gym list
- Serbian language for all onboarding screens

#### Changed
- Onboarding flow: welcome → auth → stepper → display_name → avatar → notifications → home
- Single `onAuthStateChange` listener (was 3 competing listeners)
- New screens use `authStore` directly; `useSession` is thin wrapper
- Username screen uses `update_profile()` RPC
- Primary buttons: solid teal (#00E5FF), no gradient

#### Removed
- `home-gym.tsx` — gym join removed from onboarding
- Web-based Google OAuth flow
```

---

## APPENDIX: File Dependency Graph

```
authStore.ts ─────────────────────────────────────────────
  │                                                        │
  ├── _layout.tsx (initialize, push notifications)         │
  ├── index.tsx (routing based on onboardingStep)          │
  ├── auth.tsx (signIn, fetchProfile, navigateToNextStep)  │
  ├── stepper.tsx (setOnboardingStep → display_name)       │
  ├── username.tsx (updateProfile)                         │
  ├── avatar.tsx (updateProfile)                           │
  ├── notifications.tsx (updateProfile, completeOnboarding)│
  ├── home.tsx (session, profile, empty state + gym list)  │
  └── profile.tsx (session, profile)                       │
                                                           │
useSession.ts ──── thin wrapper → delegates to authStore   │
  ├── home.tsx (legacy, backward compat)                   │
  ├── profile.tsx (legacy, backward compat)                │
  └── (other existing screens)                             │
                                                           │
supabase.ts ──────────── (auth client)                     │
  ↑                                                        │
  └── authStore.ts calls supabase.auth.* and supabase.rpc()│
                                                           │
get_my_profile() ← RPC ── 20260304000020_auth_foundation.sql
update_profile() ← RPC ──────────────────────────────────┘
```
