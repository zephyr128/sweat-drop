import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useMemo } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  FadeIn,
  FadeInDown,
  Easing,
} from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

// Helper: derive branding from primary color
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function adjustBrightness(hex: string, pct: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.min(255, Math.max(0, Math.round(parseInt(result[1], 16) * (1 + pct))));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(result[2], 16) * (1 + pct))));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(result[3], 16) * (1 + pct))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
function isDarkColor(hex: string): boolean {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return true;
  const [r, g, b] = [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255].map(
    v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Animated Drop Component ──────────────────────────────
function AnimatedDrop({
  delay,
  size,
  x,
  opacity,
  color,
}: {
  delay: number;
  size: number;
  x: number;
  opacity: number;
  color: string;
}) {
  const translateY = useSharedValue(-20);
  const scale = useSharedValue(0);
  const dropOpacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 8, stiffness: 120 })
    );
    dropOpacity.value = withDelay(
      delay,
      withTiming(opacity, { duration: 400 })
    );
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, {
            duration: 0,
          }),
          withTiming(18, {
            duration: 1800 + delay * 0.5,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0, {
            duration: 1800 + delay * 0.5,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,  // infinite
        false
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: dropOpacity.value,
    position: 'absolute',
    left: x,
    top: 80,
  }));

  return (
    <Animated.View style={animStyle}>
      <Ionicons name="water" size={size} color={color} />
    </Animated.View>
  );
}

// ── Main Screen ──────────────────────────────────────────
export default function GymWelcomeScreen() {
  const {
    gymId,
    gymName,
    // Workout params to pass through
    sessionId,
    machineId,
    machineType,
    sensorId,
    bleProtocol,
    // Optional SmartCoach params
    planId,
    subscriptionId,
    planItemId,
    exerciseIndex,
  } = useLocalSearchParams<{
    gymId: string;
    gymName: string;
    sessionId: string;
    machineId: string;
    machineType: string;
    sensorId: string;
    bleProtocol: string;
    planId?: string;
    subscriptionId?: string;
    planItemId?: string;
    exerciseIndex?: string;
  }>();
  const router = useRouter();
  const { t } = useTranslation('gymWelcome');

  // ── Fetch gym branding from owner_branding (the sole source of truth) ──
  // NOTE: gyms.primary_color was DROPPED by migration 20240101000034.
  // Branding lives exclusively in the owner_branding table.
  const [gymColor, setGymColor] = useState<string | null>(null);
  useEffect(() => {
    if (!gymId) return;
    (async () => {
      try {
        // 1. Get the gym's owner_id (primary_color no longer exists on gyms)
        const { data: gymData, error: gymErr } = await supabase
          .from('gyms')
          .select('owner_id')
          .eq('id', gymId)
          .single();

        if (gymErr || !gymData?.owner_id) {
          console.warn('[GymWelcome] No owner_id for gym:', gymId, gymErr);
          return;
        }

        // 2. Fetch branding from owner_branding
        const { data: branding, error: brandErr } = await supabase
          .from('owner_branding')
          .select('primary_color')
          .eq('owner_id', gymData.owner_id)
          .single();

        if (brandErr) {
          console.warn('[GymWelcome] owner_branding query error:', brandErr);
          return;
        }

        if (branding?.primary_color) {
          console.log('[GymWelcome] Branding color for gym:', branding.primary_color);
          setGymColor(branding.primary_color);
        }
      } catch (e) {
        console.warn('[GymWelcome] Could not fetch gym color:', e);
      }
    })();
  }, [gymId]);

  const brandPrimary = gymColor || theme.colors.primary;
  const brandDark = useMemo(() => adjustBrightness(brandPrimary, -0.2), [brandPrimary]);
  const brandOnPrimary = useMemo(() => isDarkColor(brandPrimary) ? '#FFFFFF' : '#000000', [brandPrimary]);

  // Hero drop animation
  const heroScale = useSharedValue(0);
  const heroOpacity = useSharedValue(0);
  const heroPulse = useSharedValue(1);
  useEffect(() => {
    // Drop bounces in
    heroScale.value = withDelay(
      200,
      withSpring(1, { damping: 6, stiffness: 80, mass: 1.2 })
    );
    heroOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 300 })
    );

    // Subtle pulse loop after landing
    heroPulse.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1.06, {
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1.0, {
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      )
    );
  }, []);

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value * heroPulse.value }],
    opacity: heroOpacity.value,
  }));

  const handleStartWorkout = () => {
    // Build workout params — pass through everything from scan
    const workoutParams: Record<string, string> = {
      sessionId: sessionId || '',
      machineId: machineId || '',
      gymId: gymId || '',
      machineType: machineType || '',
      sensorId: sensorId || '',
      bleProtocol: bleProtocol || '',
    };

    // Include SmartCoach plan params if present
    if (planId) workoutParams.planId = planId;
    if (subscriptionId) workoutParams.subscriptionId = subscriptionId;
    if (planItemId) workoutParams.planItemId = planItemId;
    if (exerciseIndex) workoutParams.exerciseIndex = exerciseIndex;

    // Replace so user can't go back to this screen
    router.replace({
      pathname: '/workout',
      params: workoutParams,
    });
  };

  const displayName = gymName || t('defaultGymName');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', hexToRgba(brandPrimary, 0.06), '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ambient background drops — decorative */}
      <AnimatedDrop delay={600}  size={22} x={24}                    opacity={0.18} color={brandPrimary} />
      <AnimatedDrop delay={900}  size={16} x={SCREEN_WIDTH - 56}     opacity={0.14} color={brandPrimary} />
      <AnimatedDrop delay={1200} size={12} x={SCREEN_WIDTH * 0.35}   opacity={0.10} color={brandPrimary} />
      <AnimatedDrop delay={750}  size={14} x={SCREEN_WIDTH * 0.72}   opacity={0.12} color={brandPrimary} />

      <View style={styles.content}>

        {/* ── TOP SECTION ─────────────────────────── */}
        <View style={styles.topSection}>

          {/* Hero icon — same water icon as welcome screen */}
          <Animated.View style={[styles.heroIconContainer, heroAnimStyle]}>
            <Ionicons name="water" size={80} color={brandPrimary} style={{
              shadowColor: brandPrimary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
            }} />
          </Animated.View>

          {/* "Dobrodošao U" label */}
          <Animated.Text
            entering={FadeInDown.delay(500).duration(500)}
            style={[styles.welcomeLabel, { color: hexToRgba(brandPrimary, 0.7) }]}
          >
            {t('welcomeTo')}
          </Animated.Text>

          {/* Gym name */}
          <Animated.Text
            entering={FadeInDown.delay(620).duration(500)}
            style={[styles.gymNameText, {
              color: brandPrimary,
              shadowColor: brandPrimary,
            }]}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {displayName}
          </Animated.Text>

          {/* Divider line */}
          <Animated.View
            entering={FadeIn.delay(750).duration(400)}
            style={[styles.divider, {
              backgroundColor: hexToRgba(brandPrimary, 0.30),
            }]}
          />

          {/* Subtitle */}
          <Animated.Text
            entering={FadeInDown.delay(800).duration(400)}
            style={styles.subtitle}
          >
            {t('subtitle')}
          </Animated.Text>
        </View>

        {/* ── DROPS INFO CARD ─────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(950).duration(400)}
          style={[styles.infoCard, { borderColor: hexToRgba(brandPrimary, 0.12) }]}
        >
          <BlurView
            intensity={50}
            tint="dark"
            style={styles.infoCardBlur}
          >
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="water" size={24} color={brandPrimary} />
                <Text style={[styles.infoValue, { color: brandPrimary }]}>{t('earningDrops')}</Text>
                <Text style={styles.infoLabel}>{t('dropsPerKm')}</Text>
              </View>

              <View style={[styles.infoDivider, { backgroundColor: hexToRgba(brandPrimary, 0.12) }]} />

              <View style={styles.infoItem}>
                <Ionicons name="flame" size={24} color={brandPrimary} />
                <Text style={[styles.infoValue, { color: brandPrimary }]}>{t('streak')}</Text>
                <Text style={styles.infoLabel}>{t('streakBonus')}</Text>
              </View>

              <View style={[styles.infoDivider, { backgroundColor: hexToRgba(brandPrimary, 0.12) }]} />

              <View style={styles.infoItem}>
                <Ionicons name="trophy" size={24} color={brandPrimary} />
                <Text style={[styles.infoValue, { color: brandPrimary }]}>{t('rewards')}</Text>
                <Text style={styles.infoLabel}>{t('inGym')}</Text>
              </View>
            </View>
          </BlurView>
        </Animated.View>

        {/* ── CTA BUTTON ──────────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(1100).duration(400)}
          style={styles.buttonContainer}
        >
          <TouchableOpacity
            style={[styles.primaryButton, { shadowColor: brandPrimary }]}
            onPress={handleStartWorkout}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[brandPrimary, brandDark]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={[styles.buttonText, { color: brandOnPrimary }]}>{t('startWorkout')}</Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={brandOnPrimary}
              />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

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
    paddingHorizontal: theme.spacing.xl,
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.xl,
  },

  // ── Top section ──
  topSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.spacing.xl,
  },

  // ── Hero drop ──
  heroIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },

  // ── Text ──
  welcomeLabel: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  gymNameText: {
    fontSize: 34,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    // Teal glow on text
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 0,
  },
  divider: {
    width: 48,
    height: 1.5,
    backgroundColor: 'rgba(0, 229, 255, 0.30)',
    marginBottom: theme.spacing.lg,
    borderRadius: 1,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.relaxed *
      theme.typography.fontSize.base,
    letterSpacing: 0.3,
  },

  // ── Info card ──
  infoCard: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.12)',
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  infoCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  infoValue: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  infoLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  infoDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },

  // ── Button ──
  buttonContainer: {
    gap: theme.spacing.sm,
  },
  primaryButton: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
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
  },
});
