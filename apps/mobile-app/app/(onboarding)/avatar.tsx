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
import { useAuthStore } from '@/lib/stores/authStore';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles } from '@/lib/theme';
import { PUSH_NOTIFICATIONS_ENABLED } from '@/lib/notifications';

const AVATARS = [
  '🔥', '💧', '⚡', '🦁',
  '🐺', '🦅', '🐯', '🦈',
  '💎', '👑', '🏔️', '🌊',
];

// ── Onboarding Progress Indicator ──
function OnboardingProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <View style={progressStyles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.dot,
            {
              width: i === current - 1 ? 24 : 8,
              backgroundColor:
                i < current
                  ? theme.colors.primary
                  : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    height: 3,
    borderRadius: 2,
  },
});

export default function AvatarScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigateNext = () => {
    if (PUSH_NOTIFICATIONS_ENABLED) {
      setOnboardingStep('notifications');
      router.replace('/(onboarding)/notifications');
    } else {
      setOnboardingStep('done');
      router.replace('/home');
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
      // Non-critical — continue anyway
      console.warn('[Avatar] Failed to save avatar:', result.error);
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
        {/* Progress indicator */}
        <OnboardingProgress current={2} total={3} />

        {/* Selected Preview */}
        <Animated.View
          entering={FadeIn.delay(100).duration(500)}
          style={styles.previewContainer}
        >
          <View
            style={[
              styles.previewRing,
              {
                borderColor: selected
                  ? theme.colors.primary
                  : 'rgba(255,255,255,0.10)',
              },
            ]}
          >
            {selected ? (
              <>
                <View style={styles.previewGlow} />
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
                  isSelected && styles.emojiButtonSelected,
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
              (!selected || loading) && { opacity: 0.6 },
            ]}
            onPress={handleContinue}
            disabled={!selected || loading}
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
                  <Text style={styles.buttonText}>{t('common:continue')}</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={theme.colors.background}
                  />
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
            <Text style={styles.secondaryButtonText}>{t('common:skip')}</Text>

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
    padding: theme.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: 'rgba(0,229,255,0.06)',
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
    backgroundColor: theme.colors.primary,
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
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderColor: theme.colors.primary,
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
