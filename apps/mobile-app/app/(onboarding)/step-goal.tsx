import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard, type FitnessGoal } from '@/hooks/useOnboardingWizard';
import { useAuthStore } from '@/lib/stores/authStore';
import OnboardingStepLayout from '@/components/OnboardingStep';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const GOALS: { value: FitnessGoal; emoji: string; labelKey: string; descKey: string }[] = [
  { value: 'weight_loss', emoji: '🔥', labelKey: 'profileSetup.goal.weight_loss', descKey: 'profileSetup.goal.weight_loss_desc' },
  { value: 'strength', emoji: '💪', labelKey: 'profileSetup.goal.strength', descKey: 'profileSetup.goal.strength_desc' },
  { value: 'cardio', emoji: '🏃', labelKey: 'profileSetup.goal.cardio', descKey: 'profileSetup.goal.cardio_desc' },
  { value: 'health', emoji: '❤️', labelKey: 'profileSetup.goal.health', descKey: 'profileSetup.goal.health_desc' },
];

export default function StepGoalScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const { data, setField, submit, isEdit } = useOnboardingWizard();
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  const handleSelect = (goal: FitnessGoal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setField('fitness_goal', goal);
  };

  const handleFinish = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const result = await submit();
    if (result.success) {
      if (isEdit) {
        router.replace('/profile');
      } else {
        setOnboardingStep('done');
        router.replace('/(onboarding)/home-gym');
      }
    } else {
      Alert.alert(t('profileSetup.saveError'), result.error);
    }
  };

  return (
    <OnboardingStepLayout
      step={5}
      totalSteps={5}
      title={t('profileSetup.goal.title')}
      onNext={handleFinish}
      onBack={() => router.back()}
      nextDisabled={!data.fitness_goal}
      nextLabel={`${t('profileSetup.finish')} ✓`}
      isEdit={isEdit}
    >
      <View style={styles.grid}>
        {GOALS.map((goal) => {
          const selected = data.fitness_goal === goal.value;
          return (
            <TouchableOpacity
              key={goal.value}
              style={[
                styles.card,
                selected && {
                  borderColor: theme.colors.primary,
                  backgroundColor: hexToRgba(theme.colors.primary, 0.12),
                },
              ]}
              onPress={() => handleSelect(goal.value)}
              activeOpacity={0.8}
            >
              <Text style={styles.cardEmoji}>{goal.emoji}</Text>
              <Text style={[styles.cardLabel, selected && { color: theme.colors.primary }]}>
                {t(goal.labelKey)}
              </Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{t(goal.descKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 16,
  },
  card: {
    width: '47%',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  cardEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  cardLabel: {
    ...fontStyles.heading,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  cardDesc: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 15,
  },
});
