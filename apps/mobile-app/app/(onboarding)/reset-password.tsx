import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useAppModal } from '@/lib/stores/useAppModal';
import { log } from '@/lib/logger';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) {
      showModal({ title: t('common:error'), body: t('auth.enterNewPassword') });
      return;
    }
    if (password.length < 6) {
      showModal({ title: t('common:error'), body: t('auth.passwordMinLength') });
      return;
    }
    if (password !== confirmPassword) {
      showModal({ title: t('common:error'), body: t('auth.passwordMismatch') });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // The recovery session's refresh token is consumed after updateUser.
      // Re-authenticate to get a fresh session with working refresh tokens,
      // otherwise the next token refresh will fire SIGNED_OUT.
      const email = useAuthStore.getState().session?.user?.email;
      if (email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          log.warn('[ResetPassword] Re-auth after password update failed:', signInError.message);
        } else {
          // Force-refresh the user object so email_confirmed_at is present in
          // the session JWT. Without this, the global email-verification guard
          // in _layout.tsx may redirect the user to verify-email after they
          // land on /home.
          await supabase.auth.getUser();
        }
      }

      setDone(true);
      await fetchProfile();
    } catch (err: unknown) {
      log.error('[ResetPassword] updateUser error:', err);
      const msg = err instanceof Error ? err.message : t('auth.somethingWentWrong');
      showModal({ title: t('common:error'), body: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    // Dismiss the entire onboarding/auth stack before navigating to home
    // so swipe-back cannot return the user to the sign-in screen.
    router.dismissAll();
    router.replace('/home');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <Animated.View entering={FadeInDown.delay(80).duration(500)} style={styles.headerSection}>
            <View style={styles.iconContainer}>
              <View style={styles.iconGlow} />
              <Ionicons name="lock-open-outline" size={48} color={theme.colors.primary} />
            </View>
            <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.resetPasswordSubtitle')}</Text>
          </Animated.View>

          {done ? (
            /* ── Success state ── */
            <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.successCard}>
              <View style={styles.successIconContainer}>
                <View style={styles.successIconGlow} />
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.primary} />
              </View>
              <Text style={styles.successTitle}>{t('auth.resetPasswordSuccess')}</Text>
              <Text style={styles.successBody}>{t('auth.resetPasswordSuccessBody')}</Text>
              <TouchableOpacity
                style={[styles.primaryButton, styles.successButton]}
                onPress={handleContinue}
                activeOpacity={0.85}
              >
                <View style={styles.primaryButtonInner}>
                  <Text style={styles.primaryButtonText}>{t('auth.resetPasswordContinue')}</Text>
                  <Ionicons name="arrow-forward" size={20} color="#000000" />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            /* ── Form ── */
            <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.form}>
              {/* New password */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={theme.colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.newPasswordPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((p) => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>

              {/* Confirm password */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={theme.colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirm((p) => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (loading || !password.trim() || !confirmPassword.trim()) && { opacity: 0.6 },
                ]}
                onPress={handleSubmit}
                disabled={loading || !password.trim() || !confirmPassword.trim()}
                activeOpacity={0.85}
              >
                <View style={styles.primaryButtonInner}>
                  {loading ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>{t('auth.resetPasswordSave')}</Text>
                      <Ionicons name="checkmark" size={20} color="#000000" />
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    opacity: 0.20,
    ...theme.shadows.glow,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: 8,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 21,
  },
  form: {
    gap: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    ...fontStyles.body,
    flex: 1,
    paddingVertical: 15,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.40,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    ...fontStyles.heading,
    color: '#000000',
    fontSize: 17,
    letterSpacing: 0.3,
  },
  successCard: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  successIconGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    opacity: 0.20,
    ...theme.shadows.glow,
  },
  successTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  successBody: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  successButton: {
    alignSelf: 'stretch',
    marginTop: 4,
  },
});
