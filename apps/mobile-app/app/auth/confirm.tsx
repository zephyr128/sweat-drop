/**
 * Deep link landing screen for email confirmation / password recovery.
 *
 * Handles three flows:
 *  1)  Universal Link: https://www.sweat-drop.com/auth/confirm?token_hash=...&type=email
 *      → calls verifyOtp(), establishes session, routes appropriately
 *  1b) Custom scheme with query-param tokens (Android-safe):
 *      sweatdrop://auth/confirm?access_token=...&refresh_token=...&type=signup
 *      → calls setSession() directly, routes to verify-email
 *  2)  Custom scheme with hash-fragment tokens (iOS / legacy):
 *      sweatdrop://auth/confirm#access_token=...&refresh_token=...
 *      → _layout.tsx calls setSession(); this screen polls auth state until it settles
 *
 * NOTE: Android strips hash fragments from custom-scheme intents, so the landing
 * page now sends tokens as query params (Flow 1b). Hash fragment support is kept
 * for iOS backward compatibility.
 *
 * A hard 6-second deadline ensures the screen never shows an infinite loader.
 */
import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useAuthStore } from '@/lib/stores/authStore';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { theme } from '@/lib/theme';

function navigateByStep(router: ReturnType<typeof useRouter>, step: string) {
  switch (step) {
    case 'done':
      router.replace('/home');
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
    case 'profile_setup':
      router.replace('/(onboarding)/step-gender');
      break;
    default:
      router.replace('/home');
  }
}

function normalizeOtpType(value: string | null | undefined): EmailOtpType | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (
    lower === 'email' ||
    lower === 'recovery' ||
    lower === 'invite' ||
    lower === 'email_change' ||
    lower === 'magiclink'
  ) {
    return lower;
  }
  return null;
}

/**
 * Parse the `type` value from a deep link URL.
 * Checks query params first (Android-safe), then hash fragment (iOS / legacy).
 * Also accepts a fallback URL for warm-launch scenarios where getInitialURL
 * returns the original launcher URL rather than the current deep link.
 */
async function getDeepLinkType(fallbackUrl?: string | null): Promise<string | null> {
  const extractType = (url: string): string | null => {
    // Query params first (Android-safe)
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) {
      const qStr = url.slice(qIndex + 1).split('#')[0];
      const qParams = new URLSearchParams(qStr);
      const type = qParams.get('type');
      if (type) return type;
    }
    // Hash fragment fallback (iOS)
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      const hParams = new URLSearchParams(url.slice(hashIndex + 1));
      const type = hParams.get('type');
      if (type) return type;
    }
    return null;
  };

  // Try getInitialURL (cold start)
  try {
    const url = await Linking.getInitialURL();
    if (url) {
      const type = extractType(url);
      if (type) return type;
    }
  } catch { /* ignore */ }

  // Warm launch fallback
  if (fallbackUrl) {
    const type = extractType(fallbackUrl);
    if (type) return type;
  }

  return null;
}

export default function AuthConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
    access_token?: string;
    refresh_token?: string;
  }>();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (done.current) return;
      done.current = true;
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };

    const run = async () => {
      // ── Flow 1: token_hash from Universal Link ──
      let tokenHash = params.token_hash;
      let type = params.type || 'email';

      if (!tokenHash) {
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && initialUrl.includes('token_hash=')) {
            const url = new URL(initialUrl);
            tokenHash = url.searchParams.get('token_hash') ?? undefined;
            type = url.searchParams.get('type') ?? 'email';
          }
        } catch {
          // ignore
        }
      }

      if (cancelled) return;

      if (tokenHash) {
        log.debug('[AuthConfirm] Verifying OTP with token_hash, type:', type);
        const otpType = normalizeOtpType(type);
        if (!otpType) {
          log.warn('[AuthConfirm] Unsupported OTP type:', type);
          finish();
          router.replace('/(onboarding)/auth');
          return;
        }
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });

          if (!error && data.session) {
            useAuthStore.setState({
              session: data.session,
              user: data.session.user,
            });

            if (type === 'recovery') {
              useAuthStore.setState({ pendingPasswordRecovery: true });
              finish();
              return;
            }

            useAuthStore.getState().clearPendingVerification();
            await useAuthStore.getState().fetchProfile();
          } else if (error) {
            log.warn('[AuthConfirm] verifyOtp error:', error.message);
          }
        } catch (e) {
          log.warn('[AuthConfirm] verifyOtp exception:', e);
        }

        if (cancelled) return;

        if (type !== 'recovery') {
          finish();
          router.replace('/(onboarding)/verify-email');
        }
        return;
      }

      // ── Flow 1b: access_token + refresh_token as query params ──
      // On Android, the landing page sends tokens as query params because
      // Android strips hash fragments from custom-scheme intents.
      // expo-router parses these into useLocalSearchParams.
      // _layout.tsx also processes these via parseAuthTokensFromUrl(), but
      // we handle them here as a reliable backup.
      if (params.access_token && params.refresh_token) {
        log.debug('[AuthConfirm] Tokens received via query params, type:', type);
        try {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) {
            log.warn('[AuthConfirm] setSession from query params failed:', error.message);
          } else {
            log.debug('[AuthConfirm] setSession from query params succeeded');
          }
        } catch (e) {
          log.warn('[AuthConfirm] setSession from query params exception:', e);
        }

        if (cancelled) return;

        const isConfirmType = type === 'signup' || type === 'email' || type === 'email_change' || type === 'magiclink';

        if (type === 'recovery') {
          useAuthStore.setState({ pendingPasswordRecovery: true });
          finish();
          return;
        }

        if (isConfirmType) {
          // Wait briefly for onAuthStateChange to fire and update the store
          await new Promise((r) => setTimeout(r, 300));
          useAuthStore.getState().clearPendingVerification();
          if (!useAuthStore.getState().profile) {
            await useAuthStore.getState().fetchProfile();
          }
          finish();
          router.replace('/(onboarding)/verify-email');
          return;
        }
      }

      // ── Flow 2: deep link without inline tokens ──
      // _layout.tsx may process tokens via its own URL handler. We poll the
      // auth store until the session settles, then route accordingly.

      // On warm launch, getInitialURL() returns the cold-start URL, not the
      // current deep link. Listen for the url event to capture the actual URL.
      let warmUrl: string | null = null;
      const urlSub = Linking.addEventListener('url', (event) => {
        warmUrl = event.url;
      });

      const deepLinkType = await getDeepLinkType(warmUrl);
      urlSub.remove();

      // If we still couldn't determine the type but this screen was opened via
      // a deep link, assume it's an email confirmation (this screen is only
      // reachable via /auth/confirm deep links from the landing page).
      const isEmailConfirmation = deepLinkType
        ? (deepLinkType === 'signup' || deepLinkType === 'email_change' || deepLinkType === 'magiclink')
        : true;

      log.debug('[AuthConfirm] Flow 2: deepLinkType =', deepLinkType, 'isEmailConfirmation =', isEmailConfirmation);

      if (cancelled) return;

      const tryNavigate = async () => {
        if (done.current) return;
        if (!useAuthStore.getState().isInitialized) return;

        const { session } = useAuthStore.getState();
        const user = session?.user;

        if (!user) return;

        // Ensure profile is loaded before routing
        if (!useAuthStore.getState().profile) {
          await useAuthStore.getState().fetchProfile();
        }

        if (cancelled || done.current) return;

        if (isEmailConfirmation) {
          // Email confirmation: always go to verify-email so the user
          // sees the "Email Verified!" success screen.
          finish();
          router.replace('/(onboarding)/verify-email');
          return;
        }

        if (!shouldRequireEmailVerification(user)) {
          finish();
          const step = useAuthStore.getState().onboardingStep;
          navigateByStep(router, step);
          return;
        }

        // User exists but email not confirmed — go to verify-email
        finish();
        router.replace('/(onboarding)/verify-email');
      };

      await tryNavigate();

      if (!done.current) {
        pollTimer = setInterval(tryNavigate, 500);
      }

      // Hard deadline: navigate no matter what after 6 seconds.
      deadlineTimer = setTimeout(async () => {
        if (done.current) return;
        log.warn('[AuthConfirm] Hard deadline reached, forcing navigation');

        // One last attempt to load profile
        const { session } = useAuthStore.getState();
        if (session?.user && !useAuthStore.getState().profile) {
          try { await useAuthStore.getState().fetchProfile(); } catch { /* ignore */ }
        }

        finish();

        const user = useAuthStore.getState().session?.user;
        if (user && isEmailConfirmation) {
          router.replace('/(onboarding)/verify-email');
        } else if (user && !shouldRequireEmailVerification(user)) {
          navigateByStep(router, useAuthStore.getState().onboardingStep);
        } else if (user) {
          router.replace('/(onboarding)/verify-email');
        } else {
          router.replace('/(onboarding)/auth');
        }
      }, 6000);
    };

    run();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
  }, [params.token_hash, params.type, params.access_token, params.refresh_token, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
