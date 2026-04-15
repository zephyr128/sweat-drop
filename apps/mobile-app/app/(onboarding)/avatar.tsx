import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useAuthStore } from '@/lib/stores/authStore';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { PUSH_NOTIFICATIONS_ENABLED } from '@/lib/notifications';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { log } from '@/lib/logger';

const AVATARS = [
  '🔥', '💧', '⚡', '🦁',
  '🐺', '🦅', '🐯', '🦈',
  '💎', '👑', '🏔️', '🌊',
];

export default function AvatarScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === 'true';
  const { t } = useTranslation('onboarding');
  const branding = useBranding();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);
  const profile = useAuthStore((s) => s.profile);

  const [selected, setSelected] = useState<string | null>(
    isEdit && profile?.avatar_url ? profile.avatar_url : null,
  );
  const [loading, setLoading] = useState(false);

  /** Settings → change avatar: gym branding. Onboarding (pre-flow): global cyan theme. */
  const primary = isEdit ? branding.primary : theme.colors.primary;
  const onPrimary = isEdit ? branding.onPrimary : '#000000';

  const navigateNext = () => {
    if (isEdit) {
      router.back();
      return;
    }
    if (PUSH_NOTIFICATIONS_ENABLED) {
      setOnboardingStep('notifications');
      router.replace('/(onboarding)/notifications');
    } else {
      setOnboardingStep('profile_setup');
      router.replace('/(onboarding)/step-gender');
    }
  };

  const handleContinue = async () => {
    if (!selected) return;

    setLoading(true);
    const result = await updateProfile({ avatar_url: selected });
    setLoading(false);

    if (result.success) {
      navigateNext();
    } else {
      log.warn('[Avatar] Failed to save avatar:', result.error);
      navigateNext();
    }
  };

  const handleSkip = () => {
    navigateNext();
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
        {/* Progress indicator — hidden in edit mode */}
        {!isEdit && <OnboardingProgress current={2} total={3} />}

        {isEdit && (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={hexToRgba(branding.primary, 0.88)} />
          </TouchableOpacity>
        )}

        {/* Selected Preview */}
        <Animated.View
          entering={FadeIn.delay(100).duration(500)}
          style={styles.previewContainer}
        >
          <View
            style={[
              styles.previewRing,
              {
                borderColor: selected ? primary : 'rgba(255,255,255,0.10)',
                backgroundColor: hexToRgba(primary, 0.06),
              },
            ]}
          >
            {selected ? (
              <>
                <View style={[styles.previewGlow, { backgroundColor: primary }]} />
                <Text style={styles.previewEmoji}>{selected}</Text>
              </>
            ) : (
              <Ionicons
                name="help-outline"
                size={32}
                color="rgba(255,255,255,0.20)"
              />
            )}
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(500)}
          style={styles.headerSection}
        >
          <Text style={styles.title}>{t('avatar.title')}</Text>
          <Text style={styles.subtitle}>
            {t('avatar.subtitle')}
          </Text>
        </Animated.View>

        {/* Emoji Grid — 3×4 */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(500)}
          style={styles.emojiGrid}
        >
          {AVATARS.map((emoji, index) => {
            const isSelected = selected === emoji;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.emojiButton,
                  isSelected && [
                    styles.emojiButtonSelected,
                    {
                      borderColor: primary,
                      backgroundColor: hexToRgba(primary, 0.08),
                    },
                  ],
                ]}
                onPress={() => setSelected(emoji)}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        {/* Buttons */}
        <Animated.View
          entering={FadeInDown.delay(600).duration(500)}
          style={styles.buttonsContainer}
        >
          {/* Primary CTA */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: primary, shadowColor: primary },
              (!selected || loading) && { opacity: 0.6 },
            ]}
            onPress={handleContinue}
            disabled={!selected || loading}
            activeOpacity={0.8}
          >
            <View style={styles.primaryButtonInner}>
              {loading ? (
                <ActivityIndicator size="small" color={onPrimary} />
              ) : (
                <>
                  <Text style={[styles.buttonText, { color: onPrimary }]}>
                    {isEdit ? (t('common:save') || 'Save') : t('common:continue')}
                  </Text>
                  <Ionicons
                    name={isEdit ? 'checkmark' : 'arrow-forward'}
                    size={20}
                    color={onPrimary}
                  />
                </>
              )}
            </View>
          </TouchableOpacity>

          {/* Skip — hidden in edit mode */}
          {!isEdit && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSkip}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>{t('common:skip')}</Text>
            </TouchableOpacity>
          )}
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

  backButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: 8,
    zIndex: 10,
  },

  // ── Preview ──
  previewContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  previewRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  previewGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.08,
  },
  previewEmoji: {
    fontSize: 40,
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
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // ── Grid ──
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: theme.spacing.xl,
  },
  emojiButton: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiButtonSelected: {
    borderWidth: 2,
  },
  emojiText: {
    fontSize: 34,
  },

  // ── Buttons ──
  buttonsContainer: {
    width: '100%',
    gap: theme.spacing.md,
  },
  primaryButton: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
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
