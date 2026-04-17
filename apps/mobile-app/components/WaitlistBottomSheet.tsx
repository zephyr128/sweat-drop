import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { log } from '@/lib/logger';
import { BottomSheet } from '@/components/BottomSheet';

interface WaitlistBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  brandColor?: string;
}

type SheetState = 'form' | 'submitting' | 'success' | 'already' | 'error';

export function WaitlistBottomSheet({ visible, onClose, brandColor = theme.colors.primary }: WaitlistBottomSheetProps) {
  const { t } = useTranslation('onboarding');
  const [gymName, setGymName] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<SheetState>('form');

  const resetForm = useCallback(() => {
    setGymName('');
    setCity('');
    setNotes('');
    setState('form');
  }, []);

  const handleSheetDismissed = useCallback(() => {
    onClose();
    setTimeout(resetForm, 300);
  }, [onClose, resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!gymName.trim()) return;

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const userId = freshSession?.user?.id;
    if (!userId) {
      log.error('[Waitlist] No authenticated user, cannot submit');
      setState('error');
      return;
    }

    Keyboard.dismiss();
    setState('submitting');

    try {
      const { data: existing } = await supabase
        .from('gym_waitlist')
        .select('id')
        .eq('user_id', userId)
        .ilike('gym_name', gymName.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        setState('already');
        return;
      }

      const { error } = await supabase.from('gym_waitlist').insert({
        user_id: userId,
        gym_name: gymName.trim(),
        city: city.trim() || null,
        notes: notes.trim() || null,
      });

      if (error) throw error;
      setState('success');
    } catch (err) {
      log.error('[Waitlist] Submit error:', err);
      setState('error');
    }
  }, [gymName, city, notes]);

  return (
    <BottomSheet
      visible={visible}
      onClose={handleSheetDismissed}
      accentColor={brandColor}
      hasScrollContent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.scrollContent}
        >
          {state === 'form' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.content}>
              <View style={[styles.iconCircle, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                <Ionicons name="business-outline" size={28} color={brandColor} />
              </View>
              <Text style={styles.title}>{t('homeGym.suggestGym')}</Text>
              <Text style={styles.subtitle}>{t('homeGym.suggestGymSub')}</Text>

              <View style={styles.fields}>
                <TextInput
                  style={[styles.input, { borderColor: hexToRgba(brandColor, 0.2) }]}
                  placeholder={t('homeGym.gymNamePlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  value={gymName}
                  onChangeText={setGymName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.input, { borderColor: hexToRgba(brandColor, 0.2) }]}
                  placeholder={t('homeGym.cityPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  value={city}
                  onChangeText={setCity}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.input, styles.textArea, { borderColor: hexToRgba(brandColor, 0.2) }]}
                  placeholder={t('homeGym.notesPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: brandColor, opacity: gymName.trim() ? 1 : 0.5 }]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={!gymName.trim()}
              >
                <Ionicons name="send" size={18} color="#000" />
                <Text style={styles.submitBtnText}>{t('homeGym.submitSuggestion')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {state === 'submitting' && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.centerState}>
              <ActivityIndicator size="large" color={brandColor} />
            </Animated.View>
          )}

          {state === 'success' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.centerState}>
              <View style={[styles.successCircle, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                <Ionicons name="checkmark-circle" size={48} color={brandColor} />
              </View>
              <Text style={styles.successTitle}>{t('homeGym.thankYou')}</Text>
              <Text style={styles.successSub}>{t('homeGym.thankYouSub')}</Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleSheetDismissed} activeOpacity={0.7}>
                <Text style={[styles.doneBtnText, { color: brandColor }]}>{t('homeGym.done')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {state === 'already' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.centerState}>
              <View style={[styles.successCircle, { backgroundColor: 'rgba(255, 193, 7, 0.12)' }]}>
                <Ionicons name="information-circle" size={48} color="#FFC107" />
              </View>
              <Text style={styles.successTitle}>{t('homeGym.alreadySuggested')}</Text>
              <Text style={styles.successSub}>{t('homeGym.alreadySuggestedSub')}</Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleSheetDismissed} activeOpacity={0.7}>
                <Text style={[styles.doneBtnText, { color: brandColor }]}>{t('homeGym.done')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {state === 'error' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.centerState}>
              <View style={[styles.successCircle, { backgroundColor: 'rgba(255, 82, 82, 0.12)' }]}>
                <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
              </View>
              <Text style={styles.successTitle}>{t('homeGym.submitError')}</Text>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: brandColor, marginTop: 16 }]}
                onPress={() => setState('form')}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>{t('homeGym.tryAgain')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  kav: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 20,
    // Bottom safe area comes from `BottomSheet` wrapper padding
    paddingBottom: 12,
  },
  content: {
    paddingTop: 4,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  fields: {
    width: '100%',
    gap: 12,
    marginBottom: 20,
  },
  input: {
    ...fontStyles.body,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
  },
  submitBtnText: {
    ...fontStyles.heading,
    fontSize: 17,
    color: '#000',
    letterSpacing: 0.3,
  },
  centerState: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSub: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  doneBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  doneBtnText: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
