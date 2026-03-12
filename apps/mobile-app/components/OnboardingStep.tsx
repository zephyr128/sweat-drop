import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';

interface OnboardingStepProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  isEdit?: boolean;
  children: React.ReactNode;
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={dotStyles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            {
              width: i === step - 1 ? 24 : 8,
              backgroundColor: i < step ? theme.colors.primary : 'rgba(255,255,255,0.15)',
            },
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
});

export default function OnboardingStepLayout({
  step,
  totalSteps,
  title,
  subtitle,
  onNext,
  onBack,
  onSkip,
  nextDisabled = false,
  nextLabel,
  isEdit = false,
  children,
}: OnboardingStepProps) {
  const { t } = useTranslation('onboarding');
  const label = nextLabel ?? (step === totalSteps ? t('profileSetup.finish') : t('profileSetup.next'));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar: Back + Skip */}
        <View style={styles.topBar}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}

          {!isEdit && onSkip ? (
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.skipText}>{t('profileSetup.skip')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Progress + step label */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.progressSection}>
            <ProgressDots step={step} total={totalSteps} />
            <Text style={styles.stepLabel}>
              {t('profileSetup.stepOf', { step, total: totalSteps })}
            </Text>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </Animated.View>

          {/* Content */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.contentArea}>
            {children}
          </Animated.View>
        </ScrollView>

        {/* Bottom button */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}
            onPress={onNext}
            disabled={nextDisabled}
            activeOpacity={0.8}
          >
            <Text style={[styles.nextButtonText, nextDisabled && styles.nextButtonTextDisabled]}>
              {label}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  keyboardView: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  skipText: {
    ...fontStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  progressSection: {
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 32,
  },
  stepLabel: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 34,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  contentArea: {
    flex: 1,
    marginTop: 24,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextButtonText: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#000000',
  },
  nextButtonTextDisabled: {
    color: 'rgba(255,255,255,0.25)',
  },
});
