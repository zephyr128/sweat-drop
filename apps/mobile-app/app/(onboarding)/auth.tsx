import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
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
import { theme } from '@/lib/theme';
import Constants from 'expo-constants';

// ── Google Sign-In Setup ──
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId:
    Constants.expoConfig?.extra?.googleWebClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId:
    Constants.expoConfig?.extra?.googleIosClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

export default function AuthScreen() {
  const router = useRouter();
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

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

  // ── Role Guard ──
  const checkRoleAndNavigate = async () => {
    await fetchProfile();
    const profile = useAuthStore.getState().profile;

    if (profile?.role && profile.role !== 'member' && profile.role !== 'user') {
      await supabase.auth.signOut();
      useAuthStore.getState().reset();
      Alert.alert(
        'Pristup odbijen',
        'Admin nalozi ne mogu koristiti mobilnu aplikaciju. Koristi korisnički nalog.',
      );
      return;
    }

    navigateToNextStep();
  };

  // ────────────────────────────────────────────────────
  //  GOOGLE SIGN-IN (Native)
  // ────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken;

      if (!idToken) {
        throw new Error('Nema ID tokena od Google-a');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) throw error;

      await checkRoleAndNavigate();
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED' && error.code !== '12501') {
        console.error('[Auth] Google sign-in error:', error);
        Alert.alert('Greška', error.message || 'Google prijava nije uspela');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ────────────────────────────────────────────────────
  //  APPLE SIGN-IN (Native)
  // ────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);

      const AppleAuthentication = await import('expo-apple-authentication');
      const Crypto = await import('expo-crypto');

      const nonce = Math.random().toString(36).substring(2, 10);
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
        throw new Error('Nema identity tokena od Apple-a');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: nonce,
      });

      if (error) throw error;

      await checkRoleAndNavigate();
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        console.error('[Auth] Apple sign-in error:', error);
        Alert.alert('Greška', error.message || 'Apple prijava nije uspela');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  // ────────────────────────────────────────────────────
  //  EMAIL SIGN-IN / SIGN-UP (smart — tries sign-in
  //  first, falls back to sign-up automatically)
  // ────────────────────────────────────────────────────
  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Greška', 'Unesi email i lozinku');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Greška', 'Lozinka mora imati najmanje 6 karaktera');
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
        // Existing user — proceed
        await checkRoleAndNavigate();
        return;
      }

      // 2. If sign-in failed with "Invalid login credentials", try sign-up
      if (
        signInError &&
        signInError.message.toLowerCase().includes('invalid login credentials')
      ) {
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
          });

        if (signUpError) {
          Alert.alert('Greška', signUpError.message);
          return;
        }

        // Email confirmation required (no session returned)
        if (signUpData.user && !signUpData.session) {
          Alert.alert(
            'Proveri email',
            'Poslali smo ti link za potvrdu. Klikni na link u email-u i pokušaj ponovo da se prijaviš.',
          );
          return;
        }

        if (signUpData.session) {
          await checkRoleAndNavigate();
        }
        return;
      }

      // 3. Any other sign-in error — show to user
      if (signInError) {
        Alert.alert('Greška', signInError.message);
      }
    } catch (err: any) {
      console.error('[Auth] Email auth error:', err);
      Alert.alert('Greška', err.message || 'Nešto je pošlo naopako');
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
            entering={FadeInDown.delay(100).duration(500)}
            style={styles.headerSection}
          >
            <View style={styles.iconContainer}>
              <View style={styles.iconGlow} />
              <Ionicons name="water" size={56} color={theme.colors.primary} />
            </View>
            <Text style={styles.title}>Prijavi se</Text>
            <Text style={styles.subtitle}>
              Kreni da treniraš i osvajaj nagrade
            </Text>
          </Animated.View>

          {/* ── Social Buttons ── */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(500)}
            style={styles.socialSection}
          >
            {/* Google — white bg, black text */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#1A1A1A" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={22} color="#4285F4" />
                  <Text style={styles.googleButtonText}>
                    Nastavi sa Google
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Apple — black bg, white border, iOS only */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleSignIn}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {appleLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
                    <Text style={styles.appleButtonText}>
                      Nastavi sa Apple
                    </Text>
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
            <Text style={styles.dividerText}>ili</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* ── Email / Password Form ── */}
          <Animated.View
            entering={FadeInDown.delay(400).duration(500)}
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
                placeholder="Email"
                placeholderTextColor={theme.colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={theme.colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Lozinka"
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

            {/* Neutral helper text */}
            <Text style={styles.authNote}>
              Novi korisnik? Upiši email i lozinku za registraciju.
            </Text>

            {/* Primary CTA — neutral "NASTAVI" label */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isLoading && { opacity: 0.6 },
              ]}
              onPress={handleEmailAuth}
              disabled={isLoading || !email.trim() || !password.trim()}
              activeOpacity={0.8}
            >
              <View style={styles.primaryButtonInner}>
                {emailLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.background}
                  />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Nastavi</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={20}
                      color={theme.colors.background}
                    />
                  </>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Footer ── */}
          <Animated.View entering={FadeInDown.delay(500).duration(500)}>
            <Text style={styles.footer}>
              Nastavljanjem prihvataš uslove korišćenja
            </Text>
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
    padding: theme.spacing.xl,
  },

  // ── Header ──
  headerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.primary,
    opacity: 0.25,
    ...theme.shadows.glow,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Social Buttons ──
  socialSection: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  // Google — white bg, black text
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: theme.borderRadius.full,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.xl,
  },
  googleButtonText: {
    color: '#1A1A1A',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  // Apple — pure black, white text, subtle border
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#000000',
    borderRadius: theme.borderRadius.full,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },

  // ── Divider ──
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.glass.border,
  },
  dividerText: {
    color: theme.colors.textTertiary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.5,
  },

  // ── Form ──
  form: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.glass.background,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.glass.border,
    paddingHorizontal: theme.spacing.md,
  },
  inputIcon: {
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },

  // ── Auth note (replaces toggle link) ──
  authNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: theme.spacing.sm,
  },

  // ── Primary Button (solid teal, NO gradient) ──
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    marginTop: theme.spacing.sm,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: theme.spacing.xl,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 1.5,
  },

  // ── Footer ──
  footer: {
    color: theme.colors.textTertiary,
    fontSize: theme.typography.fontSize.xs,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
