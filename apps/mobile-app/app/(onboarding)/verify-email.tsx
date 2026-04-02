import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { theme, fontStyles } from '@/lib/theme';
import { log } from '@/lib/logger';
import { useRouter } from 'expo-router';
import { useAppModal } from '@/lib/stores/useAppModal';

export default function VerifyEmailScreen() {
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [resendLoading, setResendLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const email = user?.email ?? '';

  const navigateByStep = useCallback((step: string) => {
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
      case 'profile_setup':
        router.replace('/(onboarding)/step-gender');
        break;
      case 'done':
        router.replace('/home');
        break;
      default:
        router.replace('/(onboarding)/stepper');
    }
  }, [router]);

  // Auto-poll: check every 5s to detect email confirmation.
  // Uses getUser() (server API call) as fallback when refreshSession() fails —
  // this handles the case where the user confirmed on a different device and
  // the local refresh token is stale but the server already knows.
  useEffect(() => {
    let stopped = false;

    const checkConfirmation = async () => {
      if (stopped) return;
      try {
        let confirmedUser = null;

        // Attempt 1: refresh the existing session (fast path)
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData.session?.user) {
          confirmedUser = refreshData.session.user;
        } else {
          // Attempt 2: ask the server directly for the user's current state.
          // getUser() hits /auth/v1/user with the current access token and
          // returns the latest user object regardless of local cache.
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user && !shouldRequireEmailVerification(userData.user)) {
            // Server says confirmed — try refreshSession again now that
            // the server state is updated. This often succeeds on the retry.
            const { data: retryData } = await supabase.auth.refreshSession();
            confirmedUser = retryData?.session?.user ?? userData.user;
          }
        }

        if (stopped) return;
        if (confirmedUser && !shouldRequireEmailVerification(confirmedUser)) {
          stopped = true;
          if (pollRef.current) clearInterval(pollRef.current);
          // Update the auth store with the fresh session
          const { data: freshSession } = await supabase.auth.getSession();
          if (freshSession.session) {
            useAuthStore.setState({ session: freshSession.session, user: freshSession.session.user });
          }
          await useAuthStore.getState().fetchProfile();
          const step = useAuthStore.getState().onboardingStep;
          navigateByStep(step);
        }
      } catch {
        // Network error — keep polling
      }
    };

    pollRef.current = setInterval(checkConfirmation, 5000);

    // Also check immediately on mount and on app foreground
    checkConfirmation();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !stopped) checkConfirmation();
    });

    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
      sub.remove();
    };
  }, [router, navigateByStep]);

  const handleResend = useCallback(async () => {
    if (!email.trim()) return;
    const now = Date.now();
    if (lastResendAt && now - lastResendAt < 60_000) {
      return;
    }
    setResendLoading(true);
    try {
      const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL || '').trim();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: siteUrl
          ? { emailRedirectTo: siteUrl + '/auth/confirm' }
          : undefined,
      });
      if (error) throw error;
      setLastResendAt(now);
      showModal({ title: t('auth.checkEmail'), body: t('auth.verifyResendDone') });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('auth.verifyResendFailed');
      log.warn('[VerifyEmail] resend:', message);
      showModal({ title: t('common:error'), body: message });
    } finally {
      setResendLoading(false);
    }
  }, [email, lastResendAt, t]);

  const handleSignOut = useCallback(async () => {
    setSignOutLoading(true);
    try {
      await signOut();
      router.replace('/(onboarding)/auth');
    } finally {
      setSignOutLoading(false);
    }
  }, [router, signOut]);

  const handleRecheck = useCallback(async () => {
    let confirmedUser = null;

    // Try refresh first
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session?.user) {
      confirmedUser = refreshData.session.user;
    } else {
      // Server-side check — getUser() hits the API regardless of local cache
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user && !shouldRequireEmailVerification(userData.user)) {
        // Retry refresh now that the server confirms the email
        const { data: retryData } = await supabase.auth.refreshSession();
        confirmedUser = retryData?.session?.user ?? userData.user;
      } else if (userData?.user) {
        // User exists but still unconfirmed
        showModal({ title: t('auth.verifyTitle'), body: t('auth.verifyInstructions') });
        return;
      }
    }

    if (confirmedUser && !shouldRequireEmailVerification(confirmedUser)) {
      const { data: freshSession } = await supabase.auth.getSession();
      if (freshSession.session) {
        useAuthStore.setState({ session: freshSession.session, user: freshSession.session.user });
      }
      await useAuthStore.getState().fetchProfile();
      const step = useAuthStore.getState().onboardingStep;
      navigateByStep(step);
      return;
    }

    // No session at all — prompt sign-in
    if (!confirmedUser) {
      showModal({
        title: t('auth.verifyTitle'),
        body: t('auth.sessionExpiredRecovery'),
        buttons: [
          {
            label: t('auth.verifySignOut'),
            onPress: () => {
              signOut().then(() => router.replace('/(onboarding)/auth'));
            },
          },
        ],
      });
      return;
    }

    showModal({ title: t('auth.verifyTitle'), body: t('auth.verifyInstructions') });
  }, [router, navigateByStep, signOut, t, showModal]);

  const busy = resendLoading || signOutLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.iconWrap}>
          <View style={styles.iconGlow} />
          <Ionicons name="mail-unread-outline" size={52} color={theme.colors.primary} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(450)}>
          <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.verifySubtitle')}</Text>
          {email ? (
            <Text style={styles.email}>{email}</Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(450)} style={styles.card}>
          <Text style={styles.cardText}>{t('auth.verifyInstructions')}</Text>
          <Text style={styles.hint}>{t('auth.verifyOfflineHint')}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(450)} style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={handleRecheck}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>{t('auth.verifyRecheck')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: theme.glass.border }]}
            onPress={handleResend}
            disabled={busy || !email}
            activeOpacity={0.85}
          >
            {resendLoading ? (
              <ActivityIndicator color={theme.colors.text} />
            ) : (
              <Text style={styles.secondaryBtnText}>{t('auth.verifyResend')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.textBtn}
            onPress={handleSignOut}
            disabled={busy}
            activeOpacity={0.7}
          >
            {signOutLoading ? (
              <ActivityIndicator color={theme.colors.textSecondary} />
            ) : (
              <Text style={styles.textBtnLabel}>{t('auth.verifySignOut')}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.footerHint}>{t('auth.verifySessionHint')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: theme.spacing['2xl'],
    paddingBottom: theme.spacing.xl,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    position: 'relative',
  },
  iconGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    backgroundColor: theme.colors.primary,
    opacity: 0.2,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 24,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  email: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  card: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.glass.background,
    borderWidth: 1,
    borderColor: theme.glass.border,
    gap: theme.spacing.sm,
  },
  cardText: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  hint: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    lineHeight: 18,
  },
  actions: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#000',
  },
  secondaryBtn: {
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 1.5,
    color: theme.colors.text,
  },
  textBtn: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  textBtnLabel: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  footerHint: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing['2xl'],
    lineHeight: 16,
    paddingHorizontal: theme.spacing.md,
  },
});
