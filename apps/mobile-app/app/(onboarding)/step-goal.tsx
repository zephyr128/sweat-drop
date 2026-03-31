import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { theme, fontStyles, hexToRgba} from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard, type FitnessGoal } from '@/hooks/useOnboardingWizard';
import { useAuthStore } from '@/lib/stores/authStore';
import OnboardingStepLayout from '@/components/OnboardingStep';
import { useAppModal } from '@/lib/stores/useAppModal';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const GOALS: { value: FitnessGoal; icon: IoniconName; color: string; labelKey: string; descKey: string }[] = [
  { value: 'weight_loss', icon: 'flame',          color: '#FF6B35', labelKey: 'profileSetup.goal.weight_loss', descKey: 'profileSetup.goal.weight_loss_desc' },
  { value: 'strength',    icon: 'barbell',        color: '#A78BFA', labelKey: 'profileSetup.goal.strength',    descKey: 'profileSetup.goal.strength_desc' },
  { value: 'cardio',      icon: 'heart-circle',   color: '#F43F5E', labelKey: 'profileSetup.goal.cardio',      descKey: 'profileSetup.goal.cardio_desc' },
  { value: 'health',      icon: 'leaf',           color: '#34D399', labelKey: 'profileSetup.goal.health',      descKey: 'profileSetup.goal.health_desc' },
];

export default function StepGoalScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);
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
        router.replace('/settings');
      } else {
        setOnboardingStep('done');
        router.replace('/(onboarding)/home-gym');
      }
    } else {
      showModal({ title: t('profileSetup.saveError'), body: result.error });
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
      nextLabel={t('profileSetup.finish')}
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
              <View style={[styles.cardIconBox, selected && { backgroundColor: hexToRgba(goal.color, 0.15) }]}>
                <Ionicons name={goal.icon} size={28} color={selected ? goal.color : theme.colors.textSecondary} />
              </View>
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
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
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
