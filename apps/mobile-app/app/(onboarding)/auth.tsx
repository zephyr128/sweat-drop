import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { theme, getNumberStyle } from '@/lib/theme';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const checkUsernameAndRedirect = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    // Check if username is missing or is a temporary/random username (starts with 'user_')
    const hasValidUsername = profile?.username && !profile.username.startsWith('user_');
    
    if (!hasValidUsername) {
      router.replace('/(onboarding)/username');
    } else {
      router.replace('/home');
    }
  }, [router]);

  // Listen for OAuth redirects
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // MOBILE APP LOGIN GUARD: Check user role for OAuth sign-in
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

          if (profileError) {
            console.error('Error fetching profile:', profileError);
            await supabase.auth.signOut();
            Alert.alert('Error', 'Failed to verify account. Please try again.');
            return;
          }

          // If role is NOT 'member' (or 'user'), sign out immediately
          if (profile?.role && profile.role !== 'member' && profile.role !== 'user') {
            await supabase.auth.signOut();
            Alert.alert(
              'Access Denied',
              'Admin accounts cannot be used for the mobile app. Please use a member account.',
              [{ text: 'OK' }]
            );
            return;
          }

          // Role is valid - proceed with username check
          checkUsernameAndRedirect();
        } catch (err: any) {
          console.error('Error checking role:', err);
          await supabase.auth.signOut();
          Alert.alert('Error', 'Failed to verify account. Please try again.');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkUsernameAndRedirect]);

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error('Sign up error:', error);
        Alert.alert('Error', error.message);
        setLoading(false);
        return;
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        // Email confirmation required
        Alert.alert(
          'Check your email',
          'We sent you a confirmation email. Please check your inbox and click the link to verify your account.',
          [
            {
              text: 'OK',
              onPress: () => {
                // User can try to sign in after confirming email
                setLoading(false);
              },
            },
          ]
        );
        return;
      }

      // User is signed in (no email confirmation required or already confirmed)
      if (data.session) {
        // Check if user needs to set username
        await checkUsernameAndRedirect();
      } else {
        Alert.alert('Error', 'Failed to create account. Please try again.');
      }
    } catch (err: any) {
      console.error('Sign up exception:', err);
      Alert.alert('Error', err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    
    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }

    // MOBILE APP LOGIN GUARD: Check user role
    if (data?.session?.user) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.session.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          setLoading(false);
          Alert.alert('Error', 'Failed to verify account. Please try again.');
          await supabase.auth.signOut();
          return;
        }

        // If role is NOT 'member' (or 'user'), sign out immediately
        if (profile?.role && profile.role !== 'member' && profile.role !== 'user') {
          await supabase.auth.signOut();
          setLoading(false);
          Alert.alert(
            'Access Denied',
            'Admin accounts cannot be used for the mobile app. Please use a member account.',
            [{ text: 'OK' }]
          );
          return;
        }

        // Role is valid (member/user) - proceed with username check
        setLoading(false);
        await checkUsernameAndRedirect();
      } catch (err: any) {
        console.error('Error checking role:', err);
        await supabase.auth.signOut();
        setLoading(false);
        Alert.alert('Error', 'Failed to verify account. Please try again.');
      }
    } else {
      setLoading(false);
      Alert.alert('Error', 'Login failed. Please try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // Try to import WebBrowser dynamically
      let WebBrowser: any = null;
      try {
        WebBrowser = require('expo-web-browser');
        // Complete OAuth session in browser
        if (WebBrowser?.maybeCompleteAuthSession) {
          WebBrowser.maybeCompleteAuthSession();
        }
      } catch (e) {
        console.warn('expo-web-browser not available, using Linking fallback');
      }

      // Use the app scheme for redirect URL
      // This must match what's configured in Supabase URL Configuration
      // For development: exp://localhost:8081 or sweatdrop://
      // For production: sweatdrop://
      let redirectTo: string;
      
      if (__DEV__) {
        // In development, prefer exp:// if using Expo Go, otherwise use app scheme
        redirectTo = Constants.expoConfig?.hostUri 
          ? `exp://${Constants.expoConfig.hostUri}`
          : 'sweatdrop://';
      } else {
        // In production, use the app scheme
        redirectTo = 'sweatdrop://';
      }
      
      // Ensure the URL is valid (contains ://)
      if (!redirectTo || !redirectTo.includes('://')) {
        Alert.alert('Error', 'Invalid redirect URL configuration. Please check app.config.js');
        setLoading(false);
        return;
      }
      
      console.log('Using redirect URL:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        Alert.alert('Error', error.message);
        setLoading(false);
        return;
      }

      if (data?.url) {
        if (!WebBrowser || !WebBrowser.openAuthSessionAsync) {
          // Fallback: Use Linking to open the URL
          Alert.alert(
            'Google Sign In',
            'Please complete sign in in your browser. The app will automatically detect when you return.',
            [{ text: 'OK' }]
          );
          await Linking.openURL(data.url);
          setLoading(false);
          return;
        }

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo
        );

        if (result.type === 'success') {
          // Supabase will automatically handle the session via the redirect URL
          // The onAuthStateChange listener will catch the SIGNED_IN event
          // Just wait a bit for the session to be established
          setTimeout(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              await checkUsernameAndRedirect();
            } else {
              Alert.alert('Error', 'Failed to complete Google sign in');
            }
          }, 1000);
        } else if (result.type === 'cancel') {
          // User cancelled - no action needed
          setLoading(false);
        } else {
          Alert.alert('Error', 'Failed to sign in with Google');
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Google sign in error:', error);
      Alert.alert('Error', error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Pure black background */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="lock-closed" size={48} color={theme.colors.primary} />
          <Text style={styles.title}>Sign In / Sign Up</Text>
          <Text style={styles.subtitle}>Enter your email and password</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={theme.colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={theme.colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryDark]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.background} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Sign Up</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign In Button */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-google" size={20} color={theme.colors.text} />
            <Text style={styles.googleButtonText}>
              {loading ? 'Signing in...' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  form: {
    gap: theme.spacing.lg,
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
  primaryButton: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    marginTop: theme.spacing.md,
    ...theme.shadows.glow,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.glass.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.glass.border,
  },
  dividerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.5,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.glass.background,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.glass.border,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  googleButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
