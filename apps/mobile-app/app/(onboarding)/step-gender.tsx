import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { theme, fontStyles, hexToRgba} from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard, type Gender } from '@/hooks/useOnboardingWizard';
import { useAuthStore } from '@/lib/stores/authStore';
import OnboardingStepLayout from '@/components/OnboardingStep';
import { useAppModal } from '@/lib/stores/useAppModal';
import { useBranding } from '@/lib/contexts/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function StepGenderScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === 'true';
  const { t } = useTranslation('onboarding');
  const branding = useBranding();
  const showModal = useAppModal((s) => s.showModal);
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
    showModal({
      title: t('profileSetup.skipConfirmTitle'),
      body: t('profileSetup.skipConfirmMessage'),
      buttons: [
        { label: t('profileSetup.skipConfirmNo'), style: 'cancel' },
        {
          label: t('profileSetup.skipConfirmYes'),
          onPress: async () => {
            await skip();
            useAuthStore.getState().setOnboardingStep('done');
            router.replace('/(onboarding)/home-gym');
          },
        },
      ],
    });
  };

  const handleBack = () => {
    if (isEdit) {
      router.back();
    } else {
      handleSkip();
    }
  };

  const cards: { value: Gender; icon: IoniconName; color: string; labelKey: string }[] = [
    { value: 'male',   icon: 'male',   color: '#60A5FA', labelKey: 'profileSetup.gender.male' },
    { value: 'female', icon: 'female', color: '#F472B6', labelKey: 'profileSetup.gender.female' },
    { value: 'other',  icon: 'people', color: '#A78BFA', labelKey: 'profileSetup.gender.other' },
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
                  borderColor: branding.primary,
                  backgroundColor: hexToRgba(branding.primary, 0.10),
                },
              ]}
              onPress={() => handleSelect(card.value)}
              activeOpacity={0.8}
            >
              <View style={[styles.cardIconBox, selected && { backgroundColor: hexToRgba(card.color, 0.15) }]}>
                <Ionicons
                  name={card.icon}
                  size={36}
                  color={selected ? card.color : theme.colors.textSecondary}
                />
              </View>
              <Text style={[styles.cardLabel, selected && { color: theme.colors.text }]}>
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
    gap: 14,
    justifyContent: 'center',
    marginTop: 24,
  },
  card: {
    flex: 1,
    minWidth: '28%',
    maxWidth: '31%',
    aspectRatio: 0.78,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  cardIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
});
