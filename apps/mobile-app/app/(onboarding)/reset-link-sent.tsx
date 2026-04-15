import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useAppModal } from '@/lib/stores/useAppModal';
import { log } from '@/lib/logger';

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
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);

  const [resendLoading, setResendLoading] = useState(false);
  const [resentConfirm, setResentConfirm] = useState(false);

  const handleResend = async () => {
    if (!email) return;
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
      setResentConfirm(true);
      setTimeout(() => setResentConfirm(false), 3000);
    } catch (err: unknown) {
      log.error('[ResetLinkSent] resend error:', err);
      const msg = err instanceof Error ? err.message : t('auth.somethingWentWrong');
      showModal({ title: t('common:error'), body: msg });
    } finally {
      setResendLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    router.replace('/(onboarding)/auth');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.content}>
        {/* Icon */}
        <Animated.View entering={FadeIn.delay(60).duration(500)} style={styles.iconSection}>
          <View style={styles.iconContainer}>
            <View style={styles.iconGlow} />
            <Ionicons name="mail" size={52} color={theme.colors.primary} />
          </View>
        </Animated.View>

        {/* Title & body */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)} style={styles.textSection}>
          <Text style={styles.title}>{t('auth.resetEmailSent')}</Text>
          {email ? (
            <Text style={styles.emailLabel}>{email}</Text>
          ) : null}
          <Text style={styles.body}>{t('auth.resetLinkSentBody')}</Text>
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInDown.delay(280).duration(500)} style={styles.actions}>
          <TouchableOpacity
            style={[styles.resendButton, (resendLoading || resentConfirm) && { opacity: 0.6 }]}
            onPress={handleResend}
            disabled={resendLoading || resentConfirm}
            activeOpacity={0.75}
          >
            {resendLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={styles.resendButtonText}>
                {resentConfirm ? t('auth.resetEmailResentConfirm') : t('auth.resetEmailResend')}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleBackToSignIn}
            activeOpacity={0.7}
            style={styles.backRow}
          >
            <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.5)" />
            <Text style={styles.backText}>{t('auth.backToSignIn')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
  },
  iconSection: {
    marginBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.primary,
    opacity: 0.18,
    ...theme.shadows.glow,
  },
  textSection: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    letterSpacing: 0.2,
    textAlign: 'center',
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
    marginTop: 4,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  resendButton: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  resendButtonText: {
    ...fontStyles.bodyMedium,
    fontSize: 15,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
