import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/lib/stores/authStore';
import { theme } from '@/lib/theme';

// ── Onboarding Progress Indicator ──
function OnboardingProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <View style={progressStyles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.dot,
            {
              width: i === current - 1 ? 24 : 8,
              backgroundColor:
                i < current
                  ? theme.colors.primary
                  : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    height: 3,
    borderRadius: 2,
  },
});

export default function DisplayNameScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  // Pre-fill with OAuth name or existing username (if not auto-generated)
  const initialName =
    profile?.full_name ||
    (profile?.username && !profile.username.startsWith('user_')
      ? profile.username
      : '');

  const [displayName, setDisplayName] = useState(initialName);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length < 2) {
      Alert.alert('Greška', 'Ime mora imati najmanje 2 karaktera');
      return;
    }

    setLoading(true);
    const result = await updateProfile({ username: trimmed });
    setLoading(false);

    if (result.success) {
      setOnboardingStep('avatar');
      router.replace('/(onboarding)/avatar');
    } else {
      if (result.error?.includes('already taken') || result.error?.includes('23505')) {
        Alert.alert('Greška', 'Ovo ime je već zauzeto. Probaj drugo.');
      } else {
        Alert.alert('Greška', result.error || 'Nešto je pošlo naopako');
      }
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
        <View style={styles.content}>
          {/* Progress indicator */}
          <OnboardingProgress current={1} total={3} />

          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(500)}
            style={styles.headerSection}
          >
            <View style={styles.iconRing}>
              <Text style={styles.iconEmoji}>✏️</Text>
            </View>
            <Text style={styles.title}>Kako da te zovemo?</Text>
            <Text style={styles.subtitle}>
              Ovo ime će se prikazivati na leaderboardima
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View
            entering={FadeInDown.delay(300).duration(500)}
            style={styles.form}
          >
            <View style={styles.inputContainer}>
              <Ionicons
                name="at-outline"
                size={20}
                color={theme.colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Tvoje ime"
                placeholderTextColor={theme.colors.textTertiary}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="none"
                autoComplete="username"
                autoFocus
                editable={!loading}
                maxLength={30}
              />
              {displayName.length > 0 && (
                <TouchableOpacity
                  onPress={() => setDisplayName('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={theme.colors.textTertiary}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Character count */}
            <Text style={styles.charCount}>
              {displayName.trim().length}/30
            </Text>

            {/* Primary CTA */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (loading || displayName.trim().length < 2) && { opacity: 0.6 },
              ]}
              onPress={handleContinue}
              disabled={loading || displayName.trim().length < 2}
              activeOpacity={0.8}
            >
              <View style={styles.primaryButtonInner}>
                {loading ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.background}
                  />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Nastavi</Text>
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
        </View>
      </KeyboardAvoidingView>
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

  // ── Header ──
  headerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Form ──
  form: {
    gap: theme.spacing.md,
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
  charCount: {
    textAlign: 'right',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    marginTop: -theme.spacing.sm,
  },

  // ── Primary Button ──
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
  buttonText: {
    color: '#000000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 1.5,
  },
});
