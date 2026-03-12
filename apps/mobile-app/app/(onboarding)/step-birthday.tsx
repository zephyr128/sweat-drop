import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useOnboardingWizard } from '@/hooks/useOnboardingWizard';
import OnboardingStepLayout from '@/components/OnboardingStep';

const YEAR_QUICK = [2000, 1998, 1995, 1990, 1985, 1980];

function isValidDate(d: number, m: number, y: number): boolean {
  if (y < 1920 || y > new Date().getFullYear()) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function calculateAge(dateStr: string): number {
  const birth = new Date(dateStr);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function StepBirthdayScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const { data, setField, isEdit } = useOnboardingWizard();

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  useEffect(() => {
    if (data.date_of_birth) {
      const parts = data.date_of_birth.split('-');
      if (parts.length === 3) {
        setYear(parts[0]);
        setMonth(parts[1].replace(/^0/, ''));
        setDay(parts[2].replace(/^0/, ''));
      }
    }
  }, [data.date_of_birth]);

  const { dateStr, age, isValid, tooYoung, invalidDate } = useMemo(() => {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (!day || !month || !year || isNaN(d) || isNaN(m) || isNaN(y)) {
      return { dateStr: null, age: null, isValid: false, tooYoung: false, invalidDate: false };
    }

    if (!isValidDate(d, m, y)) {
      return { dateStr: null, age: null, isValid: false, tooYoung: false, invalidDate: true };
    }

    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const a = calculateAge(ds);

    if (a < 13) {
      return { dateStr: ds, age: a, isValid: false, tooYoung: true, invalidDate: false };
    }
    if (a > 100) {
      return { dateStr: ds, age: a, isValid: false, tooYoung: false, invalidDate: true };
    }

    return { dateStr: ds, age: a, isValid: true, tooYoung: false, invalidDate: false };
  }, [day, month, year]);

  useEffect(() => {
    setField('date_of_birth', isValid && dateStr ? dateStr : null);
  }, [isValid, dateStr]);

  const handleYearQuick = (y: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setYear(String(y));
  };

  return (
    <OnboardingStepLayout
      step={4}
      totalSteps={5}
      title={t('profileSetup.birthday.title')}
      subtitle={t('profileSetup.birthday.subtitle')}
      onNext={() => router.push('/(onboarding)/step-goal')}
      onBack={() => router.back()}
      nextDisabled={!isValid}
      isEdit={isEdit}
    >
      <View style={styles.inputSection}>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>{t('profileSetup.birthday.day')}</Text>
            <TextInput
              style={[styles.dateInput, getNumberStyle(32)]}
              value={day}
              onChangeText={(v) => setDay(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor="rgba(255,255,255,0.15)"
              maxLength={2}
            />
          </View>

          <Text style={styles.dateSeparator}>/</Text>

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>{t('profileSetup.birthday.month')}</Text>
            <TextInput
              style={[styles.dateInput, getNumberStyle(32)]}
              value={month}
              onChangeText={(v) => setMonth(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="06"
              placeholderTextColor="rgba(255,255,255,0.15)"
              maxLength={2}
            />
          </View>

          <Text style={styles.dateSeparator}>/</Text>

          <View style={[styles.dateField, { flex: 1.5 }]}>
            <Text style={styles.dateLabel}>{t('profileSetup.birthday.year')}</Text>
            <TextInput
              style={[styles.dateInput, getNumberStyle(32)]}
              value={year}
              onChangeText={(v) => setYear(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="1995"
              placeholderTextColor="rgba(255,255,255,0.15)"
              maxLength={4}
            />
          </View>
        </View>

        {/* Age display */}
        {age !== null && age >= 13 && (
          <Text style={styles.ageDisplay}>
            {t('profileSetup.birthday.ageDisplay', { age })}
          </Text>
        )}
        {tooYoung && (
          <Text style={styles.errorText}>{t('profileSetup.birthday.tooYoung')}</Text>
        )}
        {invalidDate && day && month && year && (
          <Text style={styles.errorText}>{t('profileSetup.birthday.invalidDate')}</Text>
        )}

        {/* Year quick select */}
        <View style={styles.quickRow}>
          {YEAR_QUICK.map((y) => (
            <TouchableOpacity
              key={y}
              style={[
                styles.quickChip,
                year === String(y) && { borderColor: theme.colors.primary, backgroundColor: 'rgba(0,229,255,0.1)' },
              ]}
              onPress={() => handleYearQuick(y)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.quickChipText,
                  year === String(y) && { color: theme.colors.primary },
                ]}
              >
                {y}
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
    gap: 24,
    marginTop: 24,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    width: '100%',
    paddingHorizontal: 8,
  },
  dateField: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dateLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
  },
  dateInput: {
    color: '#FFFFFF',
    fontSize: 32,
    textAlign: 'center',
    width: '100%',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    paddingBottom: 6,
  },
  dateSeparator: {
    ...fontStyles.body,
    fontSize: 24,
    color: 'rgba(255,255,255,0.2)',
    paddingBottom: 8,
  },
  ageDisplay: {
    ...fontStyles.bodySemiBold,
    fontSize: 18,
    color: theme.colors.primary,
    marginTop: 8,
  },
  errorText: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#FF5252',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
  },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  quickChipText: {
    ...fontStyles.bodyMedium,
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
});
