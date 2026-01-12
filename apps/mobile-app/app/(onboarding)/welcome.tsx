import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme, getNumberStyle } from '@/lib/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Pure black background with subtle gradient */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      
      <View style={styles.content}>
        {/* Water Drop Icon with Glow */}
        <View style={styles.iconContainer}>
          <View style={styles.iconGlow} />
          <Ionicons name="water" size={80} color={theme.colors.primary} />
        </View>

        <Text style={styles.title}>Welcome to SweatDrop</Text>
        <Text style={styles.subtitle}>
          Earn drops 💧 for every workout.{'\n'}
          Redeem rewards at your gym.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/(onboarding)/auth')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.primaryDark]}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.buttonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
          </LinearGradient>
        </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primary,
    opacity: 0.3,
    ...theme.shadows.glow,
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing['2xl'],
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.lg,
  },
  button: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    minWidth: 200,
    ...theme.shadows.glow,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
