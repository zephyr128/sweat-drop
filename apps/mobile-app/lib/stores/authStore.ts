/**
 * SWEATDROP — Centralized Auth Store
 *
 * Single source of truth for authentication state.
 * Contains the ONLY onAuthStateChange listener in the entire app.
 *
 * Other files read from this store via:
 *   - useAuthStore()       (direct, preferred for new code)
 *   - useSession()         (thin wrapper, backward-compat for existing screens)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { PUSH_NOTIFICATIONS_ENABLED, clearPushToken } from '@/lib/notifications';
import { setUser as setSentryUser } from '@/lib/sentry';

// ── Types ──────────────────────────────────────────────────

/** Onboarding steps — MUST match the screen flow exactly */
export type OnboardingStep =
  | 'auth'
  | 'stepper'
  | 'display_name'
  | 'avatar'
  | 'notifications'
  | 'profile_setup'
  | 'done';

/** Profile row returned by get_my_profile() RPC */
export interface ProfileData {
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
  updated_at: string;
  email: string | null;
  last_visit_date: string | null;
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null;
  fitness_goal: string | null;
  onboarding_completed: boolean;
}

interface AuthState {
  // ── State ──
  session: Session | null;
  user: User | null;
  profile: ProfileData | null;
  onboardingStep: OnboardingStep;
  isInitialized: boolean;
  isLoading: boolean;
  /** Set to true when Supabase fires PASSWORD_RECOVERY — _layout.tsx navigates to reset-password */
  pendingPasswordRecovery: boolean;
  /**
   * Temporary in-memory credentials stored after signUp when Supabase returns
   * session: null (email confirmation required).  verify-email uses these to
   * poll via signInWithPassword.  NEVER persisted to disk.
   */
  pendingVerificationEmail: string | null;
  pendingVerificationPassword: string | null;

  // ── Actions ──
  initialize: () => () => void; // Returns cleanup (unsubscribe) function
  fetchProfile: () => Promise<void>;
  refreshProfile: () => Promise<void>; // Alias for fetchProfile
  updateProfile: (params: {
    username?: string;
    avatar_url?: string;
    expo_push_token?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  setOnboardingStep: (step: OnboardingStep) => void;
  clearPendingPasswordRecovery: () => void;
  setPendingVerification: (email: string, password: string) => void;
  clearPendingVerification: () => void;
  signOut: () => Promise<void>;
  reset: () => void;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Determine the correct onboarding step from profile data.
 * Called after every profile fetch to keep step in sync.
 *
 * Key rules:
 *  - 'auth' → 'stepper' transition only for NEW users (incomplete profile).
 *    Returning users (valid username + avatar) skip straight to 'done'.
 *  - 'stepper' is a "gate" — never auto-advance past it. Only the
 *    stepper screen's CTA button should advance to 'display_name'.
 */
function computeOnboardingStep(
  profile: ProfileData | null,
  currentStep: OnboardingStep,
): OnboardingStep {
  if (!profile) return 'auth';

  const usernameValid =
    !!profile.username &&
    profile.username.length >= 2 &&
    !profile.username.startsWith('user_');
  const hasAvatar = !!profile.avatar_url;

  // ── First sign-in (currentStep is still 'auth') ──
  if (currentStep === 'auth') {
    if (usernameValid && hasAvatar) {
      // Returning user with complete profile but hasn't done profile setup wizard
      if (!profile.onboarding_completed) return 'profile_setup';
      return 'done';
    }
    // New user — show stepper intro
    return 'stepper';
  }

  // ── Stepper is a gate — don't auto-advance ──
  if (currentStep === 'stepper') return 'stepper';

  // ── Post-stepper steps — check profile completeness ──
  if (!usernameValid) return 'display_name';
  if (!hasAvatar) return 'avatar';

  // Profile setup wizard (gender, weight, height, birthday, goal)
  if (!profile.onboarding_completed) {
    return 'profile_setup';
  }

  // Show the notifications prompt only during the forward onboarding flow.
  // Specifically: only if we're progressing from avatar/display_name (i.e. the
  // currentStep shows we're actively moving through onboarding for the first time).
  // If currentStep is already 'notifications' or later (home, done, etc.) we must
  // NOT return 'notifications' again — that would cause an infinite loop where
  // fetchProfile() keeps overwriting the step back to 'notifications' even after
  // the user has already dismissed the screen.
  const notificationsSteps: OnboardingStep[] = ['avatar', 'display_name', 'notifications'];
  if (
    PUSH_NOTIFICATIONS_ENABLED &&
    !profile.expo_push_token &&
    notificationsSteps.includes(currentStep)
  ) {
    return 'notifications';
  }

  return 'done';
}

// ── Store ──────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      session: null,
      user: null,
      profile: null,
      onboardingStep: 'auth',
      isInitialized: false,
      isLoading: false,
      pendingPasswordRecovery: false,
      pendingVerificationEmail: null,
      pendingVerificationPassword: null,

      // ────────────────────────────────────────────────────
      // initialize() — called ONCE in _layout.tsx
      // ────────────────────────────────────────────────────
      initialize: () => {
        // Guard: only run once
        if (get().isInitialized) {
          return () => {}; // no-op cleanup
        }

        // Safety net: guarantee isInitialized is set even if getSession() hangs
        // or rejects (e.g. Supabase internal lock contention with setSession).
        const safetyTimer = setTimeout(() => {
          if (!get().isInitialized) {
            log.warn('[AuthStore] Initialization safety timeout — forcing isInitialized');
            set({ isInitialized: true });
          }
        }, 5000);

        // 1. Get initial session
        supabase.auth
          .getSession()
          .then(async ({ data: { session } }) => {
            set({ session, user: session?.user ?? null });

            // If logged in, fetch profile + compute step
            if (session?.user) {
              try {
                await get().fetchProfile();
              } catch {
                // Non-fatal — profile will be fetched on next SIGNED_IN
              }
            }

            clearTimeout(safetyTimer);
            if (!get().isInitialized) set({ isInitialized: true });
          })
          .catch((err) => {
            log.warn('[AuthStore] getSession() failed:', err);
            clearTimeout(safetyTimer);
            if (!get().isInitialized) set({ isInitialized: true });
          });

        // 2. Subscribe to auth changes (THE ONLY listener in the entire app)
        // IMPORTANT: callbacks are NOT awaited — fire-and-forget for fetchProfile
        // to avoid holding the Supabase internal auth lock, which would block
        // getSession() above and prevent isInitialized from being set.
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(
          (event: AuthChangeEvent, session: Session | null) => {
            log.debug('[AuthStore] onAuthStateChange:', event);
            set({ session, user: session?.user ?? null });

            if (event === 'SIGNED_IN' && session?.user) {
              setSentryUser(session.user.id, session.user.email);
              get().fetchProfile().catch(() => {});
            }

            if (event === 'PASSWORD_RECOVERY' && session) {
              set({ pendingPasswordRecovery: true });
            }

            if (event === 'SIGNED_OUT') {
              setSentryUser(null);
              get().reset();
            }
          },
        );

        // Return cleanup function
        return () => {
          clearTimeout(safetyTimer);
          subscription.unsubscribe();
        };
      },

      // ────────────────────────────────────────────────────
      // fetchProfile() — loads profile from Supabase
      // ────────────────────────────────────────────────────
      fetchProfile: async () => {
        const session = get().session;
        if (!session?.user) return;

        set({ isLoading: true });

        try {
          // Try RPC first, fall back to direct query
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            'get_my_profile',
          );

          if (!rpcError && rpcData) {
            const profile = rpcData as unknown as ProfileData;
            const step = computeOnboardingStep(profile, get().onboardingStep);
            set({ profile, onboardingStep: step, isLoading: false });
            return;
          }

          // Fallback: direct profiles query
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (error) {
            log.error('[AuthStore] Error fetching profile:', error.message);
            set({ isLoading: false });
            return;
          }

          const profile = data as ProfileData;
          const step = computeOnboardingStep(profile, get().onboardingStep);
          set({ profile, onboardingStep: step, isLoading: false });
        } catch (err) {
          log.error('[AuthStore] fetchProfile exception:', err);
          set({ isLoading: false });
        }
      },

      // Alias
      refreshProfile: async () => {
        await get().fetchProfile();
      },

      // ────────────────────────────────────────────────────
      // updateProfile() — wraps update_profile RPC
      // ────────────────────────────────────────────────────
      updateProfile: async (params) => {
        const session = get().session;
        if (!session?.user) {
          return { success: false, error: 'Not authenticated' };
        }

        try {
          // Try RPC first
          const { error: rpcError } = await supabase.rpc('update_profile', {
            p_username: params.username ?? null,
            p_avatar_url: params.avatar_url ?? null,
            p_expo_push_token: params.expo_push_token ?? null,
          });

          if (rpcError) {
            // Fallback: direct update
            const updateObj: Record<string, string> = {};
            if (params.username) updateObj.username = params.username;
            if (params.avatar_url) updateObj.avatar_url = params.avatar_url;
            if (params.expo_push_token)
              updateObj.expo_push_token = params.expo_push_token;

            const { error } = await supabase
              .from('profiles')
              .update(updateObj)
              .eq('id', session.user.id);

            if (error) {
              if (error.code === '23505') {
                return {
                  success: false,
                  error: 'already taken',
                };
              }
              return { success: false, error: error.message };
            }
          }

          // Re-fetch profile to keep store in sync
          await get().fetchProfile();
          return { success: true };
        } catch (err: any) {
          log.error('[AuthStore] updateProfile error:', err);
          return { success: false, error: err.message || 'Unknown error' };
        }
      },

      // ────────────────────────────────────────────────────
      // setOnboardingStep() — advances the onboarding flow
      // ────────────────────────────────────────────────────
      setOnboardingStep: (step: OnboardingStep) => {
        set({ onboardingStep: step });
      },

      clearPendingPasswordRecovery: () => {
        set({ pendingPasswordRecovery: false });
      },

      setPendingVerification: (email: string, password: string) => {
        set({ pendingVerificationEmail: email, pendingVerificationPassword: password });
      },

      clearPendingVerification: () => {
        set({ pendingVerificationEmail: null, pendingVerificationPassword: null });
      },

      // ────────────────────────────────────────────────────
      // signOut() — clean logout
      // ────────────────────────────────────────────────────
      signOut: async () => {
        try {
          // Clear push token BEFORE signing out (while we still have auth to update profiles)
          const userId = get().session?.user?.id;
          if (userId) {
            await clearPushToken(userId);
          }

          // Try to sign out of Google if applicable
          try {
            const { GoogleSignin } = await import(
              '@react-native-google-signin/google-signin'
            );
            const currentUser = GoogleSignin.getCurrentUser();
            if (currentUser) {
              await GoogleSignin.signOut();
            }
          } catch {
            // Google Sign-In not available or not signed in — ignore
          }

          await supabase.auth.signOut();
          get().reset();
        } catch (err) {
          log.error('[AuthStore] signOut error:', err);
          // Force reset even on error
          get().reset();
        }
      },

      // ────────────────────────────────────────────────────
      // reset() — clear all state (auth + gym)
      // ────────────────────────────────────────────────────
      reset: () => {
        // Clear gym store so next user starts fresh (no inherited gym)
        try {
          const { useGymStore } = require('@/lib/stores/useGymStore');
          useGymStore.getState().reset();
        } catch {
          // Gym store not available — ignore
        }

        set({
          session: null,
          user: null,
          profile: null,
          onboardingStep: 'auth',
          isLoading: false,
          pendingPasswordRecovery: false,
          pendingVerificationEmail: null,
          pendingVerificationPassword: null,
        });
      },
    }),
    {
      name: 'sweatdrop-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist onboardingStep — Supabase handles session persistence
      partialize: (state) => ({
        onboardingStep: state.onboardingStep,
      }),
    },
  ),
);
