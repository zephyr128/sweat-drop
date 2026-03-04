import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { theme } from '@/lib/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  // ── Glow animation ──
  const glowScale = useSharedValue(1);

  useEffect(() => {
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.content}>
        {/* Water Drop Icon with Glow */}
        <Animated.View
          entering={FadeIn.delay(200).duration(500)}
          style={styles.iconContainer}
        >
          <Animated.View style={[styles.iconGlow, glowStyle]} />
          <Ionicons name="water" size={80} color={theme.colors.primary} />
        </Animated.View>

        {/* Title — intentional two-line layout */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <Text style={styles.titleTop}>Dobrodošao u</Text>
          <Text style={styles.titleBottom}>SweatDrop</Text>
        </Animated.View>

        {/* Subtitle */}
        <Animated.Text
          entering={FadeInDown.delay(400).duration(500)}
          style={styles.subtitle}
        >
          Treniraj. Osvajaj kapi.{'\n'}
          Menjaj ih za nagrade u teretani.
        </Animated.Text>
      </View>

      {/* CTA button pinned at bottom */}
      <Animated.View
        entering={FadeInDown.delay(700).duration(500)}
        style={styles.buttonContainer}
      >
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/(onboarding)/auth')}
          activeOpacity={0.8}
        >
          <View style={styles.primaryButtonInner}>
            <Text style={styles.buttonText}>Započni</Text>
            <Ionicons
              name="arrow-forward"
              size={20}
              color={theme.colors.background}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
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
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 100, // leave room for button
  },

  // ── Icon ──
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

  // ── Title (two-line) ──
  titleTop: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    letterSpacing: 3,
    textAlign: 'center',
  },
  titleBottom: {
    fontSize: 36,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: -2,
    // Subtle text glow
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },

  // ── Subtitle ──
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    lineHeight:
      theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.lg,
  },

  // ── Button (fixed at bottom) ──
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 48,
    paddingTop: 16,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
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
