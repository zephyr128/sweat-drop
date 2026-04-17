/**
 * Deep link landing screen for email confirmation / password recovery.
 *
 * This screen is rendered when the app is opened via:
 *   sweatdrop://auth/confirm?access_token=...&refresh_token=...&type=email
 *   sweatdrop://auth/confirm?token_hash=...&type=email
 *   sweatdrop://auth/confirm#access_token=...  (iOS legacy)
 *
 * Strategy:
 *   1. Extract tokens from route params / Linking.getInitialURL()
 *   2. Call verifyOtp (token_hash) or setSession (access_token)
 *   3. Wait for auth store to settle (isInitialized + session)
 *   4. Navigate to verify-email success screen
 *   5. Hard deadline ensures no infinite loader
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { theme } from '@/lib/theme';
import { isConsumerRole, rejectElevatedSession } from '@/lib/auth/isConsumerAccount';

function isRecoveryType(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower === 'recovery';
}

function isPasswordUpdatedType(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase() === 'password_updated';
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
 * Extract auth parameters from a URL string.
 * Checks query parameters first (Android-safe), then hash fragment (iOS).
 */
function extractParamsFromUrl(url: string): {
  tokenHash?: string;
  accessToken?: string;
  refreshToken?: string;
  type?: string;
} {
  const result: ReturnType<typeof extractParamsFromUrl> = {};

  // Query parameters
  const qIdx = url.indexOf('?');
  if (qIdx !== -1) {
    const qStr = url.slice(qIdx + 1).split('#')[0];
    const qp = new URLSearchParams(qStr);
    result.tokenHash = qp.get('token_hash') || undefined;
    result.accessToken = qp.get('access_token') || undefined;
    result.refreshToken = qp.get('refresh_token') || undefined;
    result.type = qp.get('type') || undefined;
  }

  // Hash fragment fallback (iOS / legacy)
  if (!result.tokenHash && !result.accessToken) {
    const hIdx = url.indexOf('#');
    if (hIdx !== -1) {
      const hp = new URLSearchParams(url.slice(hIdx + 1));
      result.tokenHash = hp.get('token_hash') || undefined;
      result.accessToken = hp.get('access_token') || undefined;
      result.refreshToken = hp.get('refresh_token') || undefined;
      result.type = hp.get('type') || undefined;
    }
  }

  return result;
}

async function hasActiveAuthSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

export default function AuthConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
    access_token?: string;
    refresh_token?: string;
  }>();

  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const pendingPasswordRecovery = useAuthStore((s) => s.pendingPasswordRecovery);

  const [tokensProcessed, setTokensProcessed] = useState(false);
  const navigatedRef = useRef(false);
  const authTypeRef = useRef<string>('email');

  const navigate = useCallback(
    (target: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      log.debug('[AuthConfirm] Navigating to:', target);
      router.replace(target as any);
    },
    [router],
  );

  // ── Step 1: Process tokens on mount ────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Gather tokens from route params
      let tokenHash = params.token_hash;
      let accessToken = params.access_token;
      let refreshToken = params.refresh_token;
      let type = params.type || 'email';
      authTypeRef.current = type;

      // On Android cold start, expo-router may not have parsed query params yet.
      // Fall back to Linking.getInitialURL() which reads the raw intent URI.
      // Retry once after a short delay — Android may not have delivered the
      // Intent to the JS bridge on very early cold start.
      if (!tokenHash && !accessToken) {
        try {
          let url = await Linking.getInitialURL();
          if (!url) {
            await new Promise((r) => setTimeout(r, 300));
            url = await Linking.getInitialURL();
          }
          if (url) {
            const parsed = extractParamsFromUrl(url);
            tokenHash = parsed.tokenHash;
            accessToken = parsed.accessToken;
            refreshToken = parsed.refreshToken;
            type = parsed.type || type;
            authTypeRef.current = type;
          }
        } catch {
          // ignore
        }
      }

      if (cancelled) return;

      // ── token_hash flow (email link → Universal/App Link) ──
      if (tokenHash) {
        // Recovery is special: verifyOtp BURNS the token, so we must defer it
        // to the exact moment we also call updateUser(password). Otherwise any
        // navigation hop, fetchProfile call, role-check, or AsyncStorage
        // persistence race between verifyOtp and updateUser can leave the
        // Supabase client without a session → "Auth session missing!" when
        // the user finally submits the form.
        //
        // Stash the token_hash in the auth store and jump straight to the
        // reset-password screen. That screen performs verifyOtp + updateUser
        // as one atomic step.
        if (isRecoveryType(type)) {
          log.debug('[AuthConfirm] Stashing recovery token_hash for in-app reset');
          useAuthStore.getState().setPendingRecoveryTokenHash(tokenHash);
          useAuthStore.setState({ pendingPasswordRecovery: true });
          navigatedRef.current = true; // _layout.tsx handles recovery navigation
          if (!cancelled) setTokensProcessed(true);
          return;
        }

        // Non-recovery (signup / magiclink / invite / email_change): verify now.
        log.debug('[AuthConfirm] Verifying OTP, type:', type);
        const otpType = normalizeOtpType(type);
        let authEstablished = false;
        if (otpType) {
          try {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: otpType,
            });
            if (error) {
              log.warn('[AuthConfirm] verifyOtp error:', error.message);
            } else {
              authEstablished = !!data.session || (await hasActiveAuthSession());
            }
          } catch (e) {
            log.warn('[AuthConfirm] verifyOtp exception:', e);
          }
        }
        if (cancelled) return;
        // Defense-in-depth: check role before allowing session to persist.
        if (authEstablished) {
          const { data: vtUserData } = await supabase.auth.getUser();
          const vtRole =
            (vtUserData?.user?.app_metadata?.role as string | undefined) ??
            (vtUserData?.user?.user_metadata?.role as string | undefined);
          if (vtRole !== undefined && !isConsumerRole(vtRole)) {
            log.warn('[AuthConfirm] verifyOtp: elevated role detected, rejecting', { role: vtRole });
            navigatedRef.current = true;
            await rejectElevatedSession('confirm_verify_otp_elevated_role', vtRole);
            if (!cancelled) setTokensProcessed(true);
            return;
          }
        }
        useAuthStore.getState().clearPendingVerification();
        if (!cancelled) setTokensProcessed(true);
        return;
      }

      // ── setSession (custom scheme with access_token + refresh_token) ──
      if (accessToken && refreshToken) {
        log.debug('[AuthConfirm] Setting session from tokens, type:', type);
        let authEstablished = false;
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            log.warn('[AuthConfirm] setSession error:', error.message);
          } else {
            log.debug('[AuthConfirm] setSession succeeded');
            authEstablished = !!data.session || (await hasActiveAuthSession());
          }
        } catch (e) {
          log.warn('[AuthConfirm] setSession exception:', e);
        }
        if (cancelled) return;
        if (!authEstablished && isRecoveryType(type)) {
          log.warn('[AuthConfirm] Recovery setSession did not produce an active session');
          useAuthStore.getState().clearPendingPasswordRecovery();
          if (!cancelled) setTokensProcessed(true);
          return;
        }
        // Defense-in-depth: check role before allowing recovery to proceed.
        const { data: ssUserData } = await supabase.auth.getUser();
        const ssRole =
          (ssUserData?.user?.app_metadata?.role as string | undefined) ??
          (ssUserData?.user?.user_metadata?.role as string | undefined);
        if (ssRole !== undefined && !isConsumerRole(ssRole)) {
          log.warn('[AuthConfirm] setSession: elevated role detected, rejecting', { role: ssRole });
          navigatedRef.current = true;
          await rejectElevatedSession('confirm_set_session_elevated_role', ssRole);
          if (!cancelled) setTokensProcessed(true);
          return;
        }
        if (isRecoveryType(type)) {
          useAuthStore.setState({ pendingPasswordRecovery: true });
          navigatedRef.current = true;
          if (!cancelled) setTokensProcessed(true);
          return;
        }
        useAuthStore.getState().clearPendingVerification();
        if (!cancelled) setTokensProcessed(true);
        return;
      }

      // ── No tokens found — _layout.tsx may handle them ──
      log.debug('[AuthConfirm] No tokens found in params or getInitialURL');
      if (!cancelled) setTokensProcessed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []); // Run once on mount — params may be empty initially, but getInitialURL covers cold start

  // ── Step 2: Navigate once auth state is ready ──────────────
  useEffect(() => {
    if (navigatedRef.current) return;
    if (!tokensProcessed) return;
    if (!isInitialized) return;

    // Recovery is handled by _layout.tsx's pendingPasswordRecovery effect
    if (pendingPasswordRecovery) return;

    if (!session?.user) {
      navigate('/(onboarding)/auth');
      return;
    }

    if (isPasswordUpdatedType(authTypeRef.current)) {
      navigate('/home');
      return;
    }

    // If profile is already loaded (onboardingStep computed), navigate now.
    // Otherwise give fetchProfile a brief window to finish so index.tsx has
    // the correct onboardingStep.
    if (useAuthStore.getState().profile) {
      navigate('/(onboarding)/verify-email');
      return;
    }

    const timer = setTimeout(() => navigate('/(onboarding)/verify-email'), 600);
    return () => clearTimeout(timer);
  }, [tokensProcessed, isInitialized, session, pendingPasswordRecovery, navigate]);

  // ── Step 3: Hard deadline — never show loader forever ──────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (navigatedRef.current) return;
      const state = useAuthStore.getState();
      log.warn('[AuthConfirm] Hard deadline reached', {
        tokensProcessed,
        isInitialized: state.isInitialized,
        hasUser: !!state.session?.user,
        hasProfile: !!state.profile,
      });
      if (state.session?.user) {
        if (isPasswordUpdatedType(authTypeRef.current)) {
          navigate('/home');
        } else {
          navigate('/(onboarding)/verify-email');
        }
      } else {
        navigate('/(onboarding)/auth');
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [tokensProcessed, navigate]);

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
