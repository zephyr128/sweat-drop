import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard } from '@/hooks/useOnboardingWizard';
import OnboardingStepLayout from '@/components/OnboardingStep';
import { useBranding } from '@/lib/contexts/ThemeContext';

const QUICK_VALUES = [50, 60, 70, 80, 90, 100];

export default function StepWeightScreen() {
  const router = useThrottledRouter();
  const { t } = useTranslation('onboarding');
  const branding = useBranding();
  const { data, setField, isEdit } = useOnboardingWizard();
  const [text, setText] = useState(data.weight_kg ? String(data.weight_kg) : '');

  useEffect(() => {
    if (data.weight_kg) setText(String(data.weight_kg));
  }, [data.weight_kg]);

  const weight = parseFloat(text);
  const isValid = !isNaN(weight) && weight >= 30 && weight <= 200;

  const handleChange = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    setText(cleaned);
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 30 && num <= 200) {
      setField('weight_kg', num);
    } else {
      setField('weight_kg', null);
    }
  };

  const handleQuick = (val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setText(String(val));
    setField('weight_kg', val);
  };

  return (
    <OnboardingStepLayout
      step={2}
      totalSteps={5}
      title={t('profileSetup.weight.title')}
      subtitle={t('profileSetup.weight.subtitle')}
      onNext={() => router.push('/(onboarding)/step-height')}
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
            keyboardType="decimal-pad"
            placeholder={t('profileSetup.weight.placeholder')}
            placeholderTextColor="rgba(255,255,255,0.2)"
            maxLength={5}
            autoFocus
          />
          <Text style={styles.unit}>{t('profileSetup.weight.unit')}</Text>
        </View>

        <View style={styles.quickRow}>
          {QUICK_VALUES.map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.quickChip,
                data.weight_kg === v && { borderColor: branding.primary, backgroundColor: 'rgba(0,229,255,0.1)' },
              ]}
              onPress={() => handleQuick(v)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.quickChipText,
                  data.weight_kg === v && { color: branding.primary },
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
