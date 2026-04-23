import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { useAppModal } from '@/lib/stores/useAppModal';
import { log } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { isConsumerRole, rejectElevatedSession } from '@/lib/auth/isConsumerAccount';

/**
 * Password reset screen.
 *
 * Two ways the user can land here:
 *
 *   1. Web flow (preferred): browser opens landing page → user submits the
 *      form there → updateUser succeeds on the web → landing page deep-links
 *      into the app with access_token + refresh_token + password_updated=1.
 *      In that case passwordAlreadyReset === true and we just render the
 *      success state.
 *
 *   2. In-app flow (fallback): Android App Link / iOS Universal Link
 *      intercepted the email URL and opened auth/confirm.tsx directly with a
 *      recovery token_hash. confirm.tsx stashed the token_hash in authStore
 *      WITHOUT consuming it. We render the password form here and perform
 *      verifyOtp(token_hash) + updateUser(password) as one atomic operation
 *      on submit. This avoids any window where the recovery session could be
 *      invalidated between verifyOtp and updateUser (navigation, fetchProfile
 *      role checks, AsyncStorage persistence races), which used to surface
 *      as "Auth session missing!" when the user clicked Save.
 */
export default function ResetPasswordScreen() {
  const router = useThrottledRouter();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const passwordAlreadyReset = useAuthStore((s) => s.passwordAlreadyReset);

  useEffect(() => {
    return () => {
      useAuthStore.setState({
        passwordAlreadyReset: false,
        pendingRecoveryTokenHash: null,
      });
    };
  }, []);

  const [loading, setLoading] = useState(false);

  // ── Form state (shown when user needs to enter new password in-app) ──
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formDone, setFormDone] = useState(false);

  const handleContinue = async () => {
    setLoading(true);
    try {
      // Force-refresh user so email_confirmed_at is present in the JWT before
      // the global email-verification guard runs.
      await supabase.auth.getUser();
      await fetchProfile();
    } catch (err) {
      log.warn('[ResetPassword] fetchProfile after recovery:', err);
    } finally {
      setLoading(false);
    }
    router.dismissAll();
    router.replace('/home');
  };

  // ── Fallback: user opened the screen without a recovery session ──
  const handleFallbackSubmit = async () => {
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
      // If confirm.tsx stashed a recovery token_hash (deep-link flow), consume
      // it right here: verifyOtp immediately followed by updateUser. Doing
      // both in the same tick means there is no window for the recovery
      // session to be invalidated in between.
      const tokenHash = useAuthStore.getState().consumePendingRecoveryTokenHash();
      if (tokenHash) {
        log.debug('[ResetPassword] Atomic verifyOtp + updateUser via stashed token_hash');
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (verifyError) {
          log.warn('[ResetPassword] verifyOtp error:', verifyError.message);
          captureException(new Error(`ResetPassword verifyOtp failed: ${verifyError.message}`), {
            source: 'reset_password_verify_otp',
            supabase_error: verifyError.message,
          });
          showModal({
            title: t('common:error'),
            body: verifyError.message || t('auth.verifySessionHint'),
          });
          router.replace('/(onboarding)/auth');
          return;
        }

        // Defense-in-depth: elevated roles are not allowed in the consumer app.
        // For recovery links, role lives in profiles.role (not auth metadata),
        // so check it immediately after verifyOtp before allowing updateUser.
        const { data: verifiedUserData } = await supabase.auth.getUser();
        const verifiedUserId = verifiedUserData.user?.id;
        if (verifiedUserId) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', verifiedUserId)
            .maybeSingle();
          const role = (profileRow as { role: string | null } | null)?.role ?? null;
          if (role && !isConsumerRole(role)) {
            await rejectElevatedSession('reset_password_verify_otp_elevated_role', role);
            router.replace('/(onboarding)/auth');
            return;
          }
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const email = useAuthStore.getState().session?.user?.email;
      if (email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          log.warn('[ResetPassword] Re-auth failed:', signInError.message);
        } else {
          await supabase.auth.getUser();
        }
      }

      setFormDone(true);
      await fetchProfile();
    } catch (err: unknown) {
      log.error('[ResetPassword] updateUser error:', err);
      const msg = err instanceof Error ? err.message : t('auth.somethingWentWrong');
      captureException(err instanceof Error ? err : new Error(String(err)), {
        source: 'reset_password_update_user',
        supabase_error: msg,
      });
      if (typeof msg === 'string' && msg.toLowerCase().includes('auth session missing')) {
        showModal({
          title: t('common:error'),
          body: t('auth.verifySessionHint'),
        });
        router.replace('/(onboarding)/auth');
        return;
      }
      showModal({ title: t('common:error'), body: msg });
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  //  Success state — shown when:
  //  1. passwordAlreadyReset (password was changed in browser, deep link sent back)
  //  2. formDone (user just submitted the in-app form successfully)
  // ─────────────────────────────────────────────────────────────
  if (passwordAlreadyReset || formDone) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.successContent}>
          <Animated.View entering={FadeIn.delay(60).duration(500)} style={styles.iconSection}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconGlow, { backgroundColor: theme.colors.primary }]} />
              <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(500)} style={styles.textSection}>
            <Text style={styles.successTitle}>{t('auth.resetPasswordSuccess')}</Text>
            <Text style={styles.successBody}>{t('auth.resetPasswordSuccessBody')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(500)} style={styles.ctaSection}>
            <TouchableOpacity
              style={[styles.primaryButton, loading && { opacity: 0.7 }]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.85}
            >
              <View style={styles.primaryButtonInner}>
                {loading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>{t('auth.resetPasswordContinue')}</Text>
                    <Ionicons name="arrow-forward" size={20} color="#000000" />
                  </>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  Fallback form — only shown if there is no recovery session
  //  (e.g. user manually navigated here or session expired)
  // ─────────────────────────────────────────────────────────────
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
          <Animated.View entering={FadeInDown.delay(80).duration(500)} style={styles.headerSection}>
            <View style={styles.iconContainer}>
              <View style={styles.iconGlow} />
              <Ionicons name="lock-open-outline" size={48} color={theme.colors.primary} />
            </View>
            <Text style={styles.formTitle}>{t('auth.resetPasswordTitle')}</Text>
            <Text style={styles.formSubtitle}>{t('auth.resetPasswordSubtitle')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
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
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
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
              <TouchableOpacity onPress={() => setShowConfirm((p) => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, (loading || !password.trim() || !confirmPassword.trim()) && { opacity: 0.6 }]}
              onPress={handleFallbackSubmit}
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

  // ── Success layout ──
  successContent: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconSection: {
    marginBottom: 32,
  },
  textSection: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 48,
  },
  ctaSection: {
    width: '100%',
  },
  successTitle: {
    ...fontStyles.heading,
    fontSize: 26,
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
  },

  // ── Shared icon ──
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.primary,
    opacity: 0.18,
    ...theme.shadows.glow,
  },

  // ── Fallback form layout ──
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
  formTitle: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  formSubtitle: {
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

  // ── Button ──
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
});
