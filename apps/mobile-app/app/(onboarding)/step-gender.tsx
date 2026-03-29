import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard, type Gender } from '@/hooks/useOnboardingWizard';
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

export default function StepGenderScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === 'true';
  const { t } = useTranslation('onboarding');
  const { data, setField, setEditMode, initializeFromProfile, skip, reset } = useOnboardingWizard();
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (isEdit && profile) {
      setEditMode(true);
      initializeFromProfile({
        gender: profile.gender as Gender | null,
        weight_kg: profile.weight_kg,
        height_cm: profile.height_cm,
        date_of_birth: profile.date_of_birth,
        fitness_goal: profile.fitness_goal as any,
      });
    } else if (!isEdit) {
      setEditMode(false);
      reset();
    }
  }, [isEdit, profile]);

  const handleSelect = (g: Gender) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setField('gender', g);
  };

  const handleSkip = () => {
    Alert.alert(
      t('profileSetup.skipConfirmTitle'),
      t('profileSetup.skipConfirmMessage'),
      [
        { text: t('profileSetup.skipConfirmNo'), style: 'cancel' },
        {
          text: t('profileSetup.skipConfirmYes'),
          onPress: async () => {
            await skip();
            useAuthStore.getState().setOnboardingStep('done');
            router.replace('/(onboarding)/home-gym');
          },
        },
      ],
    );
  };

  const handleBack = () => {
    if (isEdit) {
      router.back();
    } else {
      handleSkip();
    }
  };

  const cards: { value: Gender; emoji: string; labelKey: string }[] = [
    { value: 'male', emoji: '♂', labelKey: 'profileSetup.gender.male' },
    { value: 'female', emoji: '♀', labelKey: 'profileSetup.gender.female' },
  ];

  return (
    <OnboardingStepLayout
      step={1}
      totalSteps={5}
      title={t('profileSetup.gender.title')}
      onNext={() => router.push('/(onboarding)/step-weight')}
      onBack={handleBack}
      onSkip={handleSkip}
      nextDisabled={!data.gender}
      isEdit={isEdit}
    >
      <View style={styles.cardsRow}>
        {cards.map((card) => {
          const selected = data.gender === card.value;
          return (
            <TouchableOpacity
              key={card.value}
              style={[
                styles.card,
                selected && {
                  borderColor: theme.colors.primary,
                  backgroundColor: hexToRgba(theme.colors.primary, 0.12),
                },
              ]}
              onPress={() => handleSelect(card.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cardEmoji, selected && { opacity: 1 }]}>{card.emoji}</Text>
              <Text style={[styles.cardLabel, selected && { color: theme.colors.primary }]}>
                {t(card.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  cardsRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginTop: 24,
  },
  card: {
    flex: 1,
    maxWidth: '47%',
    aspectRatio: 0.85,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  cardEmoji: {
    fontSize: 56,
    opacity: 0.6,
  },
  cardLabel: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.textSecondary,
  },
});
