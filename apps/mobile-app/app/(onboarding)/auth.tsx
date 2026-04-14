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
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import {
  getPrivacyUrl,
  getTermsUrl,
  openLegalUrl,
} from '@/lib/legalUrls';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { log } from '@/lib/logger';
import { useAppModal } from '@/lib/stores/useAppModal';

const _googleWebClientId =
  Constants.expoConfig?.extra?.googleWebClientId ||
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '';
const _googleIosClientId =
  Constants.expoConfig?.extra?.googleIosClientId ||
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  '';

const _googleConfigured = !!_googleWebClientId;

if (!_googleConfigured && __DEV__) {
  log.warn('[Auth] Google Sign-In not configured — EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing');
}

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');
let googleSigninModulePromise: Promise<GoogleSigninModule | null> | null = null;
let googleSigninConfigured = false;

async function getGoogleSigninModule(): Promise<GoogleSigninModule | null> {
  if (!googleSigninModulePromise) {
    googleSigninModulePromise = import('@react-native-google-signin/google-signin')
      .then((mod) => {
        if (
          !mod?.GoogleSignin ||
          typeof mod.GoogleSignin.configure !== 'function' ||
          typeof mod.GoogleSignin.signIn !== 'function'
        ) {
          if (__DEV__) log.warn('[Auth] GoogleSignin module loaded but API surface invalid');
          return null;
        }
        return mod;
      })
      .catch((e) => {
        if (__DEV__) log.warn('[Auth] GoogleSignin import failed:', e?.message);
        return null;
      });
  }
  return googleSigninModulePromise;
}

async function ensureGoogleSigninConfigured(): Promise<GoogleSigninModule | null> {
  const mod = await getGoogleSigninModule();
  if (!mod) return null;
  if (!googleSigninConfigured) {
    try {
      mod.GoogleSignin.configure({
        webClientId: _googleWebClientId,
        iosClientId: _googleIosClientId || undefined,
      });
      googleSigninConfigured = true;
      if (__DEV__) log.debug('[Auth:Google] configure() ok');
    } catch (e: any) {
      if (__DEV__) log.error('[Auth:Google] configure() failed:', e?.message);
      return null;
    }
  }
  return mod;
}

function buildPublicWebUrl(pathname: string): string | undefined {
  const raw = (process.env.EXPO_PUBLIC_SITE_URL || '').trim();
  if (!raw) return undefined;

  try {
    const candidate = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    const base = new URL(candidate);
    return new URL(pathname, `${base.protocol}//${base.host}`).toString();
  } catch {
    return undefined;
  }
}

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resentConfirm, setResentConfirm] = useState(false);

  // Legal consent is implicit — tapping any auth action counts as acceptance
  const legalAccepted = true;

  const isLoading = googleLoading || appleLoading || emailLoading;

  // ── Navigate to correct onboarding step ──
  const navigateToNextStep = () => {
    const step = useAuthStore.getState().onboardingStep;
    switch (step) {
      case 'stepper':
        router.replace('/(onboarding)/stepper');
        break;
      case 'display_name':
        router.replace('/(onboarding)/username');
        break;
      case 'avatar':
        router.replace('/(onboarding)/avatar');
        break;
      case 'notifications':
        router.replace('/(onboarding)/notifications');
        break;
      case 'done':
        router.replace('/home');
        break;
      default:
        router.replace('/home');
    }
  };

  // ── After session exists: profile, role guard, email verification gate ──
  const finishSignInAfterSession = async () => {
    const sessionUser = useAuthStore.getState().session?.user;
    if (sessionUser?.id) {
      const now = new Date().toISOString();
      await supabase
        .from('profiles')
        .update({
          terms_privacy_acknowledged_at: now,
          terms_privacy_document_version: 'v1',
          updated_at: now,
        })
        .eq('id', sessionUser.id);
    }

    await fetchProfile();
    const profile = useAuthStore.getState().profile;
    const freshSessionUser = useAuthStore.getState().session?.user;

    if (profile?.role && profile.role !== 'member' && profile.role !== 'user') {
      await supabase.auth.signOut();
      useAuthStore.getState().reset();
      showModal({ title: t('auth.accessDenied'), body: t('auth.adminNotAllowed') });
      return;
    }

    if (freshSessionUser && shouldRequireEmailVerification(freshSessionUser)) {
      router.replace('/(onboarding)/verify-email');
      return;
    }

    navigateToNextStep();
  };

  // ────────────────────────────────────────────────────
  //  GOOGLE SIGN-IN (Native)
  // ────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    if (!legalAccepted) {
      showModal({ title: t('common:error'), body: t('auth.legalConsentRequired') });
      return;
    }
    if (!_googleConfigured) {
      log.warn('[Auth] Google sign-in attempted but client ID is missing');
      showModal({ title: t('common:error'), body: t('auth.googleNotConfigured') });
      return;
    }
    try {
      setGoogleLoading(true);
      if (__DEV__) log.debug('[Auth:Google] phase=start');

      const googleModule = await ensureGoogleSigninConfigured();
      if (!googleModule) {
        if (__DEV__) {
          log.warn('[Auth:Google] Native module unavailable — need a development build (not Expo Go)');
        }
        showModal({ title: t('common:error'), body: t('auth.googleNotConfigured') });
        return;
      }

      if (Platform.OS === 'android') {
        await googleModule.GoogleSignin.hasPlayServices();
      }

      const signInResult = await googleModule.GoogleSignin.signIn();

      if (signInResult?.type === 'cancelled') {
        if (__DEV__) log.debug('[Auth:Google] phase=user_cancelled (type field)');
        return;
      }

      const idToken =
        (signInResult as any)?.data?.idToken ??
        (signInResult as any)?.idToken;

      if (__DEV__) log.debug('[Auth:Google] phase=token_received, hasToken=', !!idToken);

      if (!idToken) {
        if (__DEV__) log.error('[Auth:Google] signInResult keys:', Object.keys(signInResult ?? {}));
        throw new Error(t('auth.noIdTokenGoogle'));
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) {
        if (__DEV__) log.error('[Auth:Google] phase=supabase_fail', error.message);
        throw error;
      }

      if (__DEV__) log.debug('[Auth:Google] phase=supabase_ok');
      await finishSignInAfterSession();
    } catch (error: any) {
      const code = error?.code ?? '';
      if (
        code === 'SIGN_IN_CANCELLED' ||
        code === '12501' ||
        code === 'ERR_REQUEST_CANCELED' ||
        code === 'CANCELED'
      ) {
        if (__DEV__) log.debug('[Auth:Google] phase=user_cancelled');
        return;
      }

      if (__DEV__) log.error('[Auth:Google] phase=error', { code, message: error?.message });

      if (code === 'NETWORK_ERROR' || code === '7' || error?.message?.toLowerCase().includes('network')) {
        showModal({ title: t('common:error'), body: t('auth.googleNetworkError') });
      } else if (code === 'DEVELOPER_ERROR' || code === '10') {
        showModal({ title: t('common:error'), body: t('auth.googleConfigError') });
      } else {
        showModal({ title: t('common:error'), body: t('auth.googleFailed') });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ────────────────────────────────────────────────────
  //  APPLE SIGN-IN (Native)
  // ────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    if (!legalAccepted) {
      showModal({ title: t('common:error'), body: t('auth.legalConsentRequired') });
      return;
    }
    try {
      setAppleLoading(true);

      const AppleAuthentication = await import('expo-apple-authentication');
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        showModal({ title: t('common:error'), body: t('auth.appleNotAvailable') });
        return;
      }

      const Crypto = await import('expo-crypto');

      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const nonce = Array.from(new Uint8Array(randomBytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error(t('auth.noIdTokenApple'));
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: nonce,
      });

      if (error) throw error;

      await finishSignInAfterSession();
    } catch (error: any) {
      const code = error?.code ?? '';

      if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
        return;
      }

      if (__DEV__) log.error('[Auth] Apple sign-in error:', { code, message: error?.message });

      if (code === 'ERR_INVALID_RESPONSE' || code === 'ERR_REQUEST_FAILED') {
        showModal({ title: t('common:error'), body: t('auth.appleNetworkError') });
      } else if (
        typeof error?.message === 'string' &&
        error.message.toLowerCase().includes('unacceptable audience in id_token')
      ) {
        showModal({ title: t('common:error'), body: t('auth.appleConfigError') });
      } else if (error?.message?.toLowerCase().includes('network')) {
        showModal({ title: t('common:error'), body: t('auth.appleNetworkError') });
      } else {
        showModal({ title: t('common:error'), body: t('auth.appleFailed') });
      }
    } finally {
      setAppleLoading(false);
    }
  };

  // ────────────────────────────────────────────────────
  //  FORGOT PASSWORD
  // ────────────────────────────────────────────────────
  const handleResetPassword = async (isResend = false) => {
    if (!email.trim()) {
      showModal({ title: t('common:error'), body: t('auth.enterEmailPassword') });
      return;
    }
    setResetLoading(true);
    try {
      const resetUrl = buildPublicWebUrl('/auth/reset');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: resetUrl,
      });
      if (error) throw error;
      if (isResend) {
        setResentConfirm(true);
        setTimeout(() => setResentConfirm(false), 3000);
      } else {
        setResetSent(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.somethingWentWrong');
      showModal({ title: t('common:error'), body: msg });
    } finally {
      setResetLoading(false);
    }
  };

  // ────────────────────────────────────────────────────
  //  EMAIL SIGN-IN / SIGN-UP (smart — tries sign-in
  //  first, falls back to sign-up automatically)
  // ────────────────────────────────────────────────────
  const handleEmailAuth = async () => {
    if (!legalAccepted) {
      showModal({ title: t('common:error'), body: t('auth.legalConsentRequired') });
      return;
    }
    if (!email.trim() || !password.trim()) {
      showModal({ title: t('common:error'), body: t('auth.enterEmailPassword') });
      return;
    }
    if (password.length < 6) {
      showModal({ title: t('common:error'), body: t('auth.passwordMinLength') });
      return;
    }

    setEmailLoading(true);
    try {
      // 1. Try sign-in first
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (!signInError && signInData.session) {
        await finishSignInAfterSession();
        return;
      }

      // 2. If sign-in failed with "Invalid login credentials", try sign-up
      if (
        signInError &&
        signInError.message.toLowerCase().includes('invalid login credentials')
      ) {
        const confirmUrl = buildPublicWebUrl('/auth/confirm');
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: confirmUrl
              ? { emailRedirectTo: confirmUrl }
              : undefined,
          });

        if (signUpError) {
          showModal({ title: t('common:error'), body: signUpError.message });
          return;
        }

        // Email confirmation required (no session returned)
        if (signUpData.user && !signUpData.session) {
          useAuthStore.getState().setPendingVerification(email.trim(), password);
          router.replace('/(onboarding)/verify-email');
          return;
        }

        if (signUpData.session) {
          await finishSignInAfterSession();
        }
        return;
      }

      // 3. Any other sign-in error — show to user
      if (signInError) {
        const low = signInError.message.toLowerCase();
        if (
          low.includes('email not confirmed') ||
          low.includes('not confirmed')
        ) {
          showModal({
            title: t('auth.verifyTitle'),
            body: t('auth.emailNotConfirmedBody'),
            buttons: [
              { label: t('common:cancel'), style: 'cancel' },
              {
                label: t('auth.verifyResend'),
                onPress: () => {
                  void supabase.auth.resend({ type: 'signup', email: email.trim() });
                },
              },
            ],
          });
          return;
        }
        if (
          low.includes('invalid refresh') ||
          low.includes('jwt expired') ||
          low.includes('session')
        ) {
          showModal({ title: t('common:error'), body: t('auth.sessionExpiredRecovery') });
          return;
        }
        showModal({ title: t('common:error'), body: signInError.message });
      }
    } catch (err: unknown) {
      if (__DEV__) log.error('[Auth] Email auth error:', err);
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (
        msg.includes('invalid refresh') ||
        msg.includes('jwt expired') ||
        msg.includes('session')
      ) {
        showModal({ title: t('common:error'), body: t('auth.sessionExpiredRecovery') });
        return;
      }
      showModal({ title: t('common:error'), body: err instanceof Error ? err.message : t('auth.somethingWentWrong') });
    } finally {
      setEmailLoading(false);
    }
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
          <Animated.View
            entering={FadeInDown.delay(80).duration(500)}
            style={styles.headerSection}
          >
            <View style={styles.iconContainer}>
              <View style={styles.iconGlow} />
              <Ionicons name="water" size={52} color={theme.colors.primary} />
            </View>
            <Text style={styles.title}>{t('auth.title')}</Text>
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          </Animated.View>

          {/* ── Social Buttons ── */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(500)}
            style={styles.socialSection}
          >
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#1A1A1A" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#4285F4" />
                  <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
                </>
              )}
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleSignIn}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {appleLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                    <Text style={styles.appleButtonText}>{t('auth.continueWithApple')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* ── Divider ── */}
          <Animated.View
            entering={FadeInDown.delay(300).duration(500)}
            style={styles.divider}
          >
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('common:or')}</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* ── Email / Password Form ── */}
          <Animated.View
            entering={FadeInDown.delay(380).duration(500)}
            style={styles.form}
          >
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={theme.colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isLoading && !resetLoading}
              />
            </View>

            {showForgotPassword ? (
              resetSent ? (
                <View style={styles.resetSentContainer}>
                  <View style={styles.resetSentIconBox}>
                    <Ionicons name="checkmark-circle" size={40} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.resetSentTitle}>{t('auth.resetEmailSent')}</Text>
                  <Text style={styles.resetSentText}>{t('auth.resetEmailInstructions')}</Text>
                  <TouchableOpacity
                    style={[styles.resendButton, (resetLoading || resentConfirm) && { opacity: 0.6 }]}
                    onPress={() => handleResetPassword(true)}
                    disabled={resetLoading || resentConfirm}
                    activeOpacity={0.75}
                  >
                    {resetLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Text style={styles.resendButtonText}>
                        {resentConfirm ? t('auth.resetEmailResentConfirm') : t('auth.resetEmailResend')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowForgotPassword(false); setResetSent(false); setResentConfirm(false); }}
                    activeOpacity={0.7}
                    style={styles.backToSignInContainer}
                  >
                    <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.backToSignInText}>{t('auth.backToSignIn')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.primaryButton, (resetLoading || !email.trim()) && { opacity: 0.6 }]}
                    onPress={() => handleResetPassword(false)}
                    disabled={resetLoading || !email.trim()}
                    activeOpacity={0.85}
                  >
                    <View style={styles.primaryButtonInner}>
                      {resetLoading ? (
                        <ActivityIndicator size="small" color={theme.colors.background} />
                      ) : (
                        <Text style={styles.primaryButtonText}>{t('auth.sendResetLink')}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowForgotPassword(false)}
                    activeOpacity={0.7}
                    style={styles.backToSignInContainer}
                  >
                    <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.backToSignInText}>{t('auth.backToSignIn')}</Text>
                  </TouchableOpacity>
                </>
              )
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                    editable={!isLoading}
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

                <TouchableOpacity
                  onPress={() => setShowForgotPassword(true)}
                  activeOpacity={0.7}
                  style={styles.forgotPasswordContainer}
                >
                  <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
                </TouchableOpacity>

                <Text style={styles.authNote}>{t('auth.authNote')}</Text>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && { opacity: 0.6 }]}
                  onPress={handleEmailAuth}
                  disabled={isLoading || !email.trim() || !password.trim()}
                  activeOpacity={0.85}
                >
                  <View style={styles.primaryButtonInner}>
                    {emailLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.background} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>{t('common:continue')}</Text>
                        <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>

          {/* ── Legal footer — implicit consent pattern ── */}
          <Animated.View
            entering={FadeInDown.delay(480).duration(500)}
            style={styles.footerLegal}
          >
            <Text style={styles.footerText}>
              {t('auth.legalIntro')}{' '}
            </Text>
            <View style={styles.footerLinksRow}>
              {getTermsUrl() ? (
                <TouchableOpacity
                  onPress={() => openLegalUrl(getTermsUrl())}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.footerLink}>{t('auth.termsLink')}</Text>
                </TouchableOpacity>
              ) : null}
              {getTermsUrl() && getPrivacyUrl() ? (
                <Text style={styles.footerText}>{' '}{t('auth.legalSeparator')}{' '}</Text>
              ) : null}
              {getPrivacyUrl() ? (
                <TouchableOpacity
                  onPress={() => openLegalUrl(getPrivacyUrl())}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.footerLink}>{t('auth.privacyLink')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  // ── Header ──
  headerSection: {
    alignItems: 'center',
    marginBottom: 36,
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
    fontSize: 28,
    color: theme.colors.text,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Social Buttons ──
  socialSection: {
    gap: 12,
    marginBottom: 24,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  googleButtonText: {
    ...fontStyles.bodySemiBold,
    color: '#1A1A1A',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#111111',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  appleButtonText: {
    ...fontStyles.bodySemiBold,
    color: '#FFFFFF',
    fontSize: 15,
    letterSpacing: 0.2,
  },

  // ── Divider ──
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    ...fontStyles.body,
    color: theme.colors.textTertiary,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Form ──
  form: {
    gap: 12,
    marginBottom: 28,
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
  authNote: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  forgotPasswordText: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.2,
  },
  resetSentContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  resetSentIconBox: {
    marginBottom: 4,
  },
  resetSentTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  resendButton: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    minWidth: 200,
    alignItems: 'center',
  },
  resendButtonText: {
    ...fontStyles.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  backToSignInContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
  },
  backToSignInText: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.2,
  },
  resetSentText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  // ── Primary Button ──
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

  // ── Legal footer — implicit consent ──
  footerLegal: {
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 2,
  },
  footerText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 17,
  },
  footerLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
    letterSpacing: 0.2,
    lineHeight: 17,
  },
});
