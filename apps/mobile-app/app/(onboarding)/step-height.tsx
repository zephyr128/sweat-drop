import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard } from '@/hooks/useOnboardingWizard';
import OnboardingStepLayout from '@/components/OnboardingStep';

const QUICK_VALUES = [160, 165, 170, 175, 180, 185, 190];

export default function StepHeightScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const { data, setField, isEdit } = useOnboardingWizard();
  const [text, setText] = useState(data.height_cm ? String(data.height_cm) : '');

  useEffect(() => {
    if (data.height_cm) setText(String(data.height_cm));
  }, [data.height_cm]);

  const height = parseInt(text, 10);
  const isValid = !isNaN(height) && height >= 100 && height <= 250;

  const handleChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    setText(cleaned);
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num >= 100 && num <= 250) {
      setField('height_cm', num);
    } else {
      setField('height_cm', null);
    }
  };

  const handleQuick = (val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setText(String(val));
    setField('height_cm', val);
  };

  return (
    <OnboardingStepLayout
      step={3}
      totalSteps={5}
      title={t('profileSetup.height.title')}
      subtitle={t('profileSetup.height.subtitle')}
      onNext={() => router.push('/(onboarding)/step-birthday')}
      onBack={() => router.back()}
      nextDisabled={!isValid}
      isEdit={isEdit}
    >
      <View style={styles.inputSection}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, getNumberStyle(48)]}
            value={text}
            onChangeText={handleChange}
            keyboardType="number-pad"
            placeholder={t('profileSetup.height.placeholder')}
            placeholderTextColor="rgba(255,255,255,0.2)"
            maxLength={3}
            autoFocus
          />
          <Text style={styles.unit}>{t('profileSetup.height.unit')}</Text>
        </View>

        <View style={styles.quickRow}>
          {QUICK_VALUES.map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.quickChip,
                data.height_cm === v && { borderColor: theme.colors.primary, backgroundColor: 'rgba(0,229,255,0.1)' },
              ]}
              onPress={() => handleQuick(v)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.quickChipText,
                  data.height_cm === v && { color: theme.colors.primary },
                ]}
              >
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  inputSection: {
    alignItems: 'center',
    gap: 32,
    marginTop: 32,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 48,
    textAlign: 'center',
    minWidth: 120,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    paddingBottom: 8,
  },
  unit: {
    ...fontStyles.body,
    fontSize: 20,
    color: theme.colors.textTertiary,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  quickChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  quickChipText: {
    ...fontStyles.bodyMedium,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
});
