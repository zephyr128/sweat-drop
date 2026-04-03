/**
 * Deep link landing screen for email confirmation / password recovery.
 *
 * Handles two flows:
 *  1) Universal Link: https://www.sweat-drop.com/auth/confirm?token_hash=...&type=email
 *     → calls verifyOtp(), establishes session, routes appropriately
 *  2) Custom scheme: sweatdrop://auth/confirm#access_token=...&refresh_token=...
 *     → _layout.tsx calls setSession(); this screen polls auth state until it settles
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
 * Parse the `type` value from a deep link's hash fragment.
 * e.g. sweatdrop://auth/confirm#access_token=...&type=signup → "signup"
 */
async function getDeepLinkType(): Promise<string | null> {
  try {
    const url = await Linking.getInitialURL();
    if (!url) return null;
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return null;
    const params = new URLSearchParams(url.slice(hashIndex + 1));
    return params.get('type');
  } catch {
    return null;
  }
}

export default function AuthConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
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

      // ── Flow 2: sweatdrop:// deep link (hash-fragment tokens) ──
      // _layout.tsx processes the tokens via setSession(). We poll the auth
      // store until the session settles, then route accordingly.

      const deepLinkType = await getDeepLinkType();
      const isEmailConfirmation = deepLinkType === 'signup' || deepLinkType === 'email_change' || deepLinkType === 'magiclink';

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
  }, [params.token_hash, params.type, router]);

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
