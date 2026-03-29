import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
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
import { useRouter } from 'expo-router';

export default function VerifyEmailScreen() {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [resendLoading, setResendLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const email = user?.email ?? '';

  // Auto-poll: check session every 5s to detect email confirmation
  useEffect(() => {
    const checkConfirmation = async () => {
      try {
        const { data } = await supabase.auth.refreshSession();
        const u = data.session?.user;
        if (u && !shouldRequireEmailVerification(u)) {
          if (pollRef.current) clearInterval(pollRef.current);
          await useAuthStore.getState().fetchProfile();
          const step = useAuthStore.getState().onboardingStep;
          switch (step) {
            case 'stepper':
              router.replace('/(onboarding)/stepper');
              break;
            case 'display_name':
              router.replace('/(onboarding)/username');
              break;
            default:
              router.replace('/(onboarding)/stepper');
          }
        }
      } catch {}
    };

    pollRef.current = setInterval(checkConfirmation, 5000);

    // Also check immediately when app returns from background
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkConfirmation();
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      sub.remove();
    };
  }, [router]);

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
      Alert.alert(t('auth.checkEmail'), t('auth.verifyResendDone'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('auth.verifyResendFailed');
      console.warn('[VerifyEmail] resend:', message);
      Alert.alert(t('common:error'), message);
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
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      Alert.alert(t('common:error'), error.message);
      return;
    }
    const session = data.session;
    const u = session?.user;
    if (u && !shouldRequireEmailVerification(u)) {
      await useAuthStore.getState().fetchProfile();
      const step = useAuthStore.getState().onboardingStep;
      if (step === 'done') {
        router.replace('/home');
        return;
      }
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
        default:
          router.replace('/home');
      }
    }
  }, [router]);

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
    paddingHorizontal: theme.spacing.xl,
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
    ...fontStyles.bodySemiBold,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
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
