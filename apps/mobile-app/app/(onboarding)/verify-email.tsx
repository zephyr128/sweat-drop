import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
  Linking,
  ActionSheetIOS,
  Platform,
  Alert,
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

// ── Email provider deep-links ─────────────────────────────────────────────────

interface EmailProvider {
  label: string;
  url: string;
}

const EMAIL_PROVIDERS: EmailProvider[] = [
  { label: 'Apple Mail',   url: 'message://' },
  { label: 'Gmail',        url: 'googlegmail://' },
  { label: 'Outlook',      url: 'ms-outlook://' },
  { label: 'Yahoo Mail',   url: 'ymail://' },
  { label: 'Spark',        url: 'readdle-spark://' },
  { label: 'Superhuman',   url: 'superhuman://' },
  { label: 'Proton Mail',  url: 'protonmail://' },
  { label: 'Fastmail',     url: 'fastmail://' },
  { label: 'Hey',          url: 'hey://' },
];

async function getAvailableEmailProviders(): Promise<EmailProvider[]> {
  const results = await Promise.all(
    EMAIL_PROVIDERS.map(async (p) => {
      try {
        const canOpen = await Linking.canOpenURL(p.url);
        return canOpen ? p : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((p): p is EmailProvider => p !== null);
}

async function openEmailApp(
  t: (key: string) => string,
  showModal: (opts: { title: string; body: string }) => void,
): Promise<void> {
  const available = await getAvailableEmailProviders();

  if (available.length === 0) {
    showModal({ title: t('auth.noEmailAppTitle'), body: t('auth.noEmailAppBody') });
    return;
  }

  if (available.length === 1) {
    await Linking.openURL(available[0].url);
    return;
  }

  // Multiple apps — show native picker
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...available.map((p) => p.label), t('auth.cancel')],
        cancelButtonIndex: available.length,
        title: t('auth.openEmailApp'),
      },
      async (index) => {
        if (index < available.length) {
          await Linking.openURL(available[index].url);
        }
      },
    );
  } else {
    // Android — use Alert as a simple picker
    Alert.alert(
      t('auth.openEmailApp'),
      undefined,
      [
        ...available.map((p) => ({
          text: p.label,
          onPress: () => Linking.openURL(p.url),
        })),
        { text: t('auth.cancel'), style: 'cancel' as const },
      ],
    );
  }
}

export default function VerifyEmailScreen() {
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const pendingEmail = useAuthStore((s) => s.pendingVerificationEmail);

  const [resendLoading, setResendLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const nextStepRef = useRef<string>('stepper');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const email = user?.email ?? pendingEmail ?? '';

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
  //
  // Two strategies depending on whether Supabase returned a session after signUp:
  //  A) Session exists → refreshSession / getUser (original approach)
  //  B) No session (email-confirm-required config) → signInWithPassword using
  //     the credentials stored in authStore.pendingVerification*.  When the
  //     email IS confirmed, signIn succeeds and we get a fresh session.
  useEffect(() => {
    let stopped = false;

    const advanceAfterConfirmation = async () => {
      const { data: freshSession } = await supabase.auth.getSession();
      if (freshSession.session) {
        useAuthStore.setState({ session: freshSession.session, user: freshSession.session.user });
      }
      useAuthStore.getState().clearPendingVerification();
      await useAuthStore.getState().fetchProfile();
      const step = useAuthStore.getState().onboardingStep;
      nextStepRef.current = step;
      setVerified(true);
    };

    const checkConfirmation = async () => {
      if (stopped) return;
      try {
        const currentSession = useAuthStore.getState().session;

        if (currentSession) {
          // ── Strategy A: we have a session — refresh it and check email_confirmed_at
          let confirmedUser = null;

          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshData.session?.user) {
            confirmedUser = refreshData.session.user;
          } else {
            const { data: userData } = await supabase.auth.getUser();
            if (userData?.user && !shouldRequireEmailVerification(userData.user)) {
              const { data: retryData } = await supabase.auth.refreshSession();
              confirmedUser = retryData?.session?.user ?? userData.user;
            }
          }

          if (stopped) return;
          if (confirmedUser && !shouldRequireEmailVerification(confirmedUser)) {
            stopped = true;
            if (pollRef.current) clearInterval(pollRef.current);
            await advanceAfterConfirmation();
          }
        } else {
          // ── Strategy B: no session — try signInWithPassword with stored credentials
          const pe = useAuthStore.getState().pendingVerificationEmail;
          const pp = useAuthStore.getState().pendingVerificationPassword;
          if (!pe || !pp) return;

          const { data, error } = await supabase.auth.signInWithPassword({
            email: pe,
            password: pp,
          });

          if (stopped) return;
          if (!error && data.session?.user && !shouldRequireEmailVerification(data.session.user)) {
            stopped = true;
            if (pollRef.current) clearInterval(pollRef.current);
            await advanceAfterConfirmation();
          }
          // "Email not confirmed" or other error → keep polling
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
    const currentSession = useAuthStore.getState().session;

    if (currentSession) {
      // Strategy A: session exists — refresh and check
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.user) {
        confirmedUser = refreshData.session.user;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user && !shouldRequireEmailVerification(userData.user)) {
          const { data: retryData } = await supabase.auth.refreshSession();
          confirmedUser = retryData?.session?.user ?? userData.user;
        } else if (userData?.user) {
          showModal({ title: t('auth.verifyTitle'), body: t('auth.verifyInstructions') });
          return;
        }
      }
    } else {
      // Strategy B: no session — try signInWithPassword
      const pe = useAuthStore.getState().pendingVerificationEmail;
      const pp = useAuthStore.getState().pendingVerificationPassword;

      if (pe && pp) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: pe,
          password: pp,
        });

        if (!error && data.session?.user) {
          confirmedUser = data.session.user;
        } else if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
            showModal({ title: t('auth.verifyTitle'), body: t('auth.verifyInstructions') });
            return;
          }
        }
      }
    }

    if (confirmedUser && !shouldRequireEmailVerification(confirmedUser)) {
      const { data: freshSession } = await supabase.auth.getSession();
      if (freshSession.session) {
        useAuthStore.setState({ session: freshSession.session, user: freshSession.session.user });
      }
      useAuthStore.getState().clearPendingVerification();
      await useAuthStore.getState().fetchProfile();
      const step = useAuthStore.getState().onboardingStep;
      nextStepRef.current = step;
      setVerified(true);
      return;
    }

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
    }
  }, [router, navigateByStep, signOut, t, showModal]);

  const handleOpenEmail = useCallback(() => {
    openEmailApp(t, showModal);
  }, [t, showModal]);

  const handleContinue = useCallback(() => {
    navigateByStep(nextStepRef.current);
  }, [navigateByStep]);

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
        {verified ? (
          <>
            <View style={styles.top}>
              <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.iconWrap}>
                <View style={[styles.iconGlow, styles.iconGlowSuccess]} />
                <Ionicons name="checkmark-circle-outline" size={52} color="#22C55E" />
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(140).duration(450)}>
                <Text style={styles.title}>{t('auth.verifiedTitle')}</Text>
                <Text style={styles.subtitle}>{t('auth.verifiedSubtitle')}</Text>
              </Animated.View>
            </View>

            <Animated.View entering={FadeInDown.delay(220).duration(450)} style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleContinue}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>{t('auth.verifiedContinue')}</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        ) : (
          <>
            <View style={styles.top}>
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
            </View>

            <Animated.View entering={FadeInDown.delay(220).duration(450)} style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleOpenEmail}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-open-outline" size={18} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.primaryBtnText}>{t('auth.openEmailApp')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: theme.glass.border }, busy && styles.btnDisabled]}
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
          </>
        )}
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
    justifyContent: 'space-between',
  },
  top: {
    gap: theme.spacing.lg,
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
  iconGlowSuccess: {
    backgroundColor: '#22C55E',
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
  actions: {
    gap: theme.spacing.md,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 16,
    flexDirection: 'row',
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
});
