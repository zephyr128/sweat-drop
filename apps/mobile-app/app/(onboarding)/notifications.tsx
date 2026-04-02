import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/lib/stores/authStore';
import { useTranslation } from 'react-i18next';
import {
  PUSH_NOTIFICATIONS_ENABLED,
  registerForPushNotifications,
} from '@/lib/notifications';
import { theme, fontStyles } from '@/lib/theme';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { log } from '@/lib/logger';

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  const [loading, setLoading] = useState(false);

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('pushNotificationsAsked', 'true');
    // Re-fetch profile so we have the latest onboarding_completed flag.
    const { fetchProfile, profile: staleProfile } = useAuthStore.getState();
    await fetchProfile();
    const profile = useAuthStore.getState().profile ?? staleProfile;
    if (profile?.onboarding_completed) {
      // Profile is already fully set up — go straight home.
      setOnboardingStep('done');
      router.replace('/home');
    } else {
      setOnboardingStep('profile_setup');
      router.replace('/(onboarding)/step-gender');
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      if (PUSH_NOTIFICATIONS_ENABLED) {
        const token = await registerForPushNotifications();
        if (token) {
          await updateProfile({ expo_push_token: token });
        }
      }
    } catch (error) {
      log.warn('[Notifications] Failed to register:', error);
    } finally {
      setLoading(false);
      await completeOnboarding();
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
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
        {/* Progress indicator */}
        <OnboardingProgress current={3} total={3} />

        {/* Bell Icon with Glow */}
        <Animated.View
          entering={FadeIn.delay(100).duration(500)}
          style={styles.iconSection}
        >
          <View style={styles.iconContainer}>
            <View style={styles.iconGlow} />
            <Ionicons
              name="notifications-outline"
              size={64}
              color={theme.colors.primary}
            />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(500)}
          style={styles.headerSection}
        >
          <Text style={styles.title}>{t('notifications.title')}</Text>
          <Text style={styles.subtitle}>
            {t('notifications.subtitle')}
          </Text>
        </Animated.View>

        {/* Benefits list */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(500)}
          style={styles.benefitsList}
        >
          {([
            { icon: 'flame' as const, color: '#FF6B35', text: t('notifications.benefit1') },
            { icon: 'trophy' as const, color: '#FFD700', text: t('notifications.benefit2') },
            { icon: 'gift' as const, color: theme.colors.primary, text: t('notifications.benefit3') },
          ]).map((benefit, index) => (
            <View key={index} style={styles.benefitRow}>
              <View style={styles.benefitIconBox}>
                <Ionicons name={benefit.icon} size={20} color={benefit.color} />
              </View>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Buttons */}
        <Animated.View
          entering={FadeInDown.delay(700).duration(500)}
          style={styles.buttonsContainer}
        >
          {/* Primary CTA */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && { opacity: 0.6 }]}
            onPress={handleEnable}
            disabled={loading}
            activeOpacity={0.8}
          >
            <View style={styles.primaryButtonInner}>
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.background}
                />
              ) : (
                <>
                  <Ionicons
                    name="notifications"
                    size={20}
                    color={theme.colors.background}
                  />
                  <Text style={styles.buttonText}>
                    {t('notifications.enableButton')}
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSkip}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>{t('common:notNow')}</Text>
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
    paddingHorizontal: 24,
    paddingVertical: theme.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Icon ──
  iconSection: {
    marginBottom: theme.spacing.xl,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.colors.primary,
    opacity: 0.25,
    ...theme.shadows.glow,
  },

  // ── Header ──
  headerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight:
      theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    paddingHorizontal: theme.spacing.md,
  },

  // ── Benefits ──
  benefitsList: {
    width: '100%',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.glass.background,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.glass.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  benefitIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    ...fontStyles.bodyMedium,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },

  // ── Buttons ──
  buttonsContainer: {
    width: '100%',
    gap: theme.spacing.md,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: theme.spacing.xl,
  },
  buttonText: {
    ...fontStyles.heading,
    color: '#000000',
    fontSize: 18,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.glass.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...fontStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    letterSpacing: 0.5,
  },
});
