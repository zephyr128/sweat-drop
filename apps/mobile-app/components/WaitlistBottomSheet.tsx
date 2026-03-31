import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { log } from '@/lib/logger';

interface WaitlistBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  brandColor?: string;
}

type SheetState = 'form' | 'submitting' | 'success' | 'already' | 'error';

export function WaitlistBottomSheet({ visible, onClose, brandColor = theme.colors.primary }: WaitlistBottomSheetProps) {
  const { t } = useTranslation('onboarding');
  const { session } = useSession();
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

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(resetForm, 300);
  }, [onClose, resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!gymName.trim()) return;

    // Re-fetch the session right before insert to ensure we have a valid auth token
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

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={Keyboard.dismiss} />

        <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(200)} style={styles.sheet}>
          <BlurView intensity={60} tint="dark" style={styles.sheetBlur}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>

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
                <TouchableOpacity style={styles.doneBtn} onPress={handleClose} activeOpacity={0.7}>
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
                <TouchableOpacity style={styles.doneBtn} onPress={handleClose} activeOpacity={0.7}>
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
          </BlurView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  sheetBlur: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(18, 18, 28, 0.92)',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    alignItems: 'center',
    minHeight: 220,
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
