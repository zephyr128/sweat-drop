import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  ActionSheetIOS,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useAppModal } from '@/lib/stores/useAppModal';
import { log } from '@/lib/logger';

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

function buildPublicWebUrl(pathname: string): string | undefined {
  const raw = (process.env.EXPO_PUBLIC_SITE_URL || '').trim();
  if (!raw) return undefined;
  try {
    const candidate = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    const base = new URL(candidate);
    return new URL(pathname, `${base.protocol}//${base.host}`).toString();
  } catch {
    return undefined;
  }
}

export default function ResetLinkSentScreen() {
  const router = useThrottledRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);

  const [resendLoading, setResendLoading] = useState(false);
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);

  // NOTE: Navigation to /reset-password on a successful deep-link recovery is
  // handled exclusively by _layout.tsx (pendingPasswordRecovery effect).
  // This screen intentionally does NOT watch pendingPasswordRecovery or the
  // PASSWORD_RECOVERY auth event. When the user submits the in-app form on
  // /reset-password, supabase.auth.verifyOtp({type:'recovery'}) fires another
  // PASSWORD_RECOVERY event while this screen is still mounted below in the
  // stack — any extra listener here would call router.replace() back to
  // /reset-password, remounting it and wiping local formDone state. The user
  // would then see the password form a second time despite a successful
  // update. See commit 3cda6d6 for the prior half-fix in _layout.tsx.

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleResend = useCallback(async () => {
    if (!email) return;
    const now = Date.now();
    if (lastResendAt && now - lastResendAt < 60_000) return;

    setResendLoading(true);
    try {
      const resetRedirect =
        Platform.OS === 'android'
          ? buildPublicWebUrl('/auth/confirm')
          : 'sweatdrop://auth/confirm';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect || 'sweatdrop://auth/confirm',
      });
      if (error) throw error;
      setLastResendAt(now);
      showModal({ title: t('auth.resetEmailSent'), body: t('auth.resetEmailResentConfirm') });
    } catch (err: unknown) {
      log.error('[ResetLinkSent] resend error:', err);
      const msg = err instanceof Error ? err.message : t('auth.somethingWentWrong');
      showModal({ title: t('common:error'), body: msg });
    } finally {
      setResendLoading(false);
    }
  }, [email, lastResendAt, t, showModal]);

  const handleOpenEmail = useCallback(() => {
    openEmailApp(t, showModal);
  }, [t, showModal]);

  const handleBackToSignIn = () => {
    router.replace('/(onboarding)/auth');
  };

  const busy = resendLoading;
  const resendCooldown = lastResendAt ? Date.now() - lastResendAt < 60_000 : false;

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
        <View style={styles.top}>
          <Animated.View entering={FadeIn.delay(60).duration(500)} style={styles.iconWrap}>
            <View style={styles.iconGlow} />
            <Ionicons name="mail" size={52} color={theme.colors.primary} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(500)}>
            <Text style={styles.title}>{t('auth.resetEmailSent')}</Text>
            {email ? (
              <Text style={styles.emailLabel}>{email}</Text>
            ) : null}
            <Text style={styles.body}>{t('auth.resetLinkSentBody')}</Text>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(280).duration(500)} style={styles.actions}>
          {/* Primary: Open email app */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleOpenEmail}
            activeOpacity={0.85}
          >
            <Ionicons name="mail-open-outline" size={18} color="#000" style={{ marginRight: 6 }} />
            <Text style={styles.primaryBtnText}>{t('auth.openEmailApp')}</Text>
          </TouchableOpacity>

          {/* Secondary: Resend */}
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              (busy || resendCooldown) && styles.btnDisabled,
            ]}
            onPress={handleResend}
            disabled={busy || resendCooldown}
            activeOpacity={0.85}
          >
            {resendLoading ? (
              <ActivityIndicator color={theme.colors.text} />
            ) : (
              <Text style={styles.secondaryBtnText}>{t('auth.resetEmailResend')}</Text>
            )}
          </TouchableOpacity>

          {/* Tertiary: Already reset / Back to sign in */}
          <TouchableOpacity
            onPress={handleBackToSignIn}
            activeOpacity={0.7}
            style={styles.backRow}
          >
            <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.5)" />
            <Text style={styles.backText}>{t('auth.alreadyResetPassword')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
    opacity: 0.18,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    letterSpacing: 0.2,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  emailLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.primary,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  body: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
    marginTop: theme.spacing.sm,
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
  primaryBtnText: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#000',
  },
  secondaryBtn: {
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  secondaryBtnText: {
    ...fontStyles.bodyMedium,
    fontSize: 15,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  backText: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.2,
  },
});
