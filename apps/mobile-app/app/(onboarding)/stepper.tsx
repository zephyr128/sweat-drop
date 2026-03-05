import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/lib/stores/authStore';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const STEP_ICONS = ['💧', '🏆', '🎁'];

// Step accent colors (glow behind emoji)
const stepColors = [
  'rgba(0, 229, 255, 0.15)',   // teal for drops
  'rgba(255, 215, 0, 0.12)',   // gold for compete
  'rgba(255, 107, 53, 0.12)',  // orange for rewards
];

export default function StepperScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  const STEPS = [
    {
      icon: STEP_ICONS[0],
      title: t('stepper.step1Title'),
      description: t('stepper.step1Desc'),
    },
    {
      icon: STEP_ICONS[1],
      title: t('stepper.step2Title'),
      description: t('stepper.step2Desc'),
    },
    {
      icon: STEP_ICONS[2],
      title: t('stepper.step3Title'),
      description: t('stepper.step3Desc'),
    },
  ];

  const handleContinue = () => {
    setOnboardingStep('display_name');
    router.replace('/(onboarding)/username');
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
        {/* Title */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(500)}
          style={styles.headerSection}
        >
          <Text style={styles.title}>{t('stepper.title')}</Text>
          <Text style={styles.subtitle}>{t('stepper.subtitle')}</Text>
        </Animated.View>

        {/* Step Cards */}
        <View style={styles.stepsContainer}>
          {STEPS.map((step, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.delay((index + 1) * 200).duration(500)}
            >
              <View style={styles.stepCard}>
                <BlurView
                  intensity={40}
                  tint="dark"
                  style={styles.stepCardBlur}
                >
                  <View style={styles.stepCardContent}>
                    {/* Emoji in a glowing circle with step number badge */}
                    <View style={styles.stepEmojiContainer}>
                      <View
                        style={[
                          styles.stepEmojiGlow,
                          { backgroundColor: stepColors[index] },
                        ]}
                      />
                      <Text style={styles.stepEmoji}>{step.icon}</Text>
                      {/* Step number badge */}
                      <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>{index + 1}</Text>
                      </View>
                    </View>

                    <View style={styles.stepText}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <Text style={styles.stepDesc}>{step.description}</Text>
                    </View>
                  </View>
                </BlurView>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* CTA */}
        <Animated.View
          entering={FadeInDown.delay(800).duration(500)}
          style={styles.buttonContainer}
        >
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <View style={styles.primaryButtonInner}>
              <Text style={styles.buttonText}>{t('stepper.continueButton')}</Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={theme.colors.background}
              />
            </View>
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
    justifyContent: 'center',
    padding: theme.spacing.xl,
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
  },

  // ── Steps ──
  stepsContainer: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  stepCard: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  stepCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  stepCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(20, 20, 30, 0.70)',
  },
  stepEmojiContainer: {
    position: 'relative',
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepEmojiGlow: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  stepEmoji: {
    fontSize: 28,
  },
  stepNumber: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    ...fontStyles.heading,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 0,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  stepDesc: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    letterSpacing: 0.2,
  },

  // ── Button ──
  buttonContainer: {
    marginTop: theme.spacing.md,
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
});
