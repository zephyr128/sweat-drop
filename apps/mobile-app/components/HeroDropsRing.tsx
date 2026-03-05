import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useBranding } from '@/lib/hooks/useBranding';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ── Types ────────────────────────────────────────── */
interface HeroDropsRingProps {
  /** Drops earned at the current gym */
  localDrops: number;
  /** Total drops across all gyms */
  totalDrops: number;
  /** 0-1, progress for outer (global) ring */
  globalProgress?: number;
  /** 0-1, progress for inner (local gym) ring */
  localProgress?: number;
  /** Diameter of the SVG canvas (outer ring edge-to-edge) */
  size?: number;
  /** Called when the user taps the ring */
  onPress?: () => void;
}

/* ── Helpers ──────────────────────────────────────── */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Derive a lighter / shifted secondary from the primary colour */
function deriveSecondaryColor(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#33EBFF';
  const r = Math.min(255, Math.round(parseInt(result[1], 16) * 0.6 + 100));
  const g = Math.min(255, Math.round(parseInt(result[2], 16) * 0.7 + 80));
  const b = Math.min(255, Math.round(parseInt(result[3], 16) * 0.5 + 60));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

/* ── Component ────────────────────────────────────── */
export const HeroDropsRing: React.FC<HeroDropsRingProps> = ({
  localDrops,
  totalDrops,
  globalProgress = 0,
  localProgress = 0,
  size = 240,
  onPress,
}) => {
  const branding = useBranding();
  const innerColor = deriveSecondaryColor(branding.primary);

  /* ── Ring geometry ─────────────────────────────────
   *  Thicker strokes + generous gap → premium look
   *  outerRadius sits 1 stroke-width inside the SVG edge
   *  innerRadius leaves a visible gap then another ring
   * ──────────────────────────────────────────────── */
  const outerStroke = 10;
  const innerStroke = 7;
  const ringGap = 18; // generous gap between the two rings
  const outerRadius = (size - outerStroke) / 2;
  const innerRadius = outerRadius - outerStroke / 2 - ringGap - innerStroke / 2;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;

  /* ── Animated values ─────────────────────────────── */
  const animGlobal = useSharedValue(0);
  const animLocal = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    animGlobal.value = withTiming(globalProgress, {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    });
  }, [globalProgress]);

  useEffect(() => {
    animLocal.value = withTiming(localProgress, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });
  }, [localProgress]);

  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  /* ── Animated props for SVG strokes ─────────────── */
  const outerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: outerCircumference * (1 - animGlobal.value),
  }));

  const innerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: innerCircumference * (1 - animLocal.value),
  }));

  /* ── Animated styles ────────────────────────────── */
  const glowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowPulse.value, [0, 1], [0.2, 0.55]);
    const scale = interpolate(glowPulse.value, [0, 1], [1, 1.05]);
    return { opacity, transform: [{ scale }] };
  });

  const containerScale = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const counterStyle = useAnimatedStyle(() => {
    const scale = interpolate(animLocal.value, [0, 0.5, 1], [0.93, 1.01, 1]);
    return { transform: [{ scale }] };
  });

  /* ── Press handlers ─────────────────────────────── */
  const handlePressIn = () => {
    pressScale.value = withSpring(0.95, { damping: 14, stiffness: 180 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 160 });
  };

  /* ── Render ─────────────────────────────────────── */
  const glowPadding = 50; // extra room so the soft glow is fully visible
  const containerSize = size + glowPadding;
  const center = size / 2;

  // Dynamic font: shrink a bit when the number gets huge (> 99 999)
  const dropsFontSize = localDrops >= 100000 ? 30 : localDrops >= 10000 ? 34 : 40;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.container,
          { width: containerSize, height: containerSize },
          containerScale,
        ]}
      >
        {/* ── Outer glow pulse ────────────────────── */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              width: size + 36,
              height: size + 36,
              borderRadius: (size + 36) / 2,
              shadowColor: branding.primary,
              backgroundColor: hexToRgba(branding.primary, 0.05),
            },
            glowStyle,
          ]}
        />

        {/* ── SVG Rings ───────────────────────────── */}
        <View style={[styles.ringContainer, { width: size, height: size }]}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Defs>
              {/* Outer gradient (primary brand) */}
              <SvgLinearGradient id="outerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={branding.primary} stopOpacity="1" />
                <Stop offset="45%" stopColor={branding.primaryDark} stopOpacity="1" />
                <Stop offset="100%" stopColor={branding.primary} stopOpacity="0.85" />
              </SvgLinearGradient>

              {/* Inner gradient (derived secondary) */}
              <SvgLinearGradient id="innerGrad" x1="100%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={innerColor} stopOpacity="0.85" />
                <Stop offset="100%" stopColor={branding.primary} stopOpacity="0.4" />
              </SvgLinearGradient>
            </Defs>

            {/* ── OUTER RING (Global / Total) ──────── */}
            <Circle
              cx={center}
              cy={center}
              r={outerRadius}
              stroke={hexToRgba(branding.primary, 0.08)}
              strokeWidth={outerStroke}
              fill="transparent"
            />
            <AnimatedCircle
              cx={center}
              cy={center}
              r={outerRadius}
              stroke="url(#outerGrad)"
              strokeWidth={outerStroke}
              fill="transparent"
              strokeDasharray={outerCircumference}
              animatedProps={outerAnimatedProps}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />

            {/* ── INNER RING (Local Gym) ───────────── */}
            <Circle
              cx={center}
              cy={center}
              r={innerRadius}
              stroke={hexToRgba(innerColor, 0.06)}
              strokeWidth={innerStroke}
              fill="transparent"
            />
            <AnimatedCircle
              cx={center}
              cy={center}
              r={innerRadius}
              stroke="url(#innerGrad)"
              strokeWidth={innerStroke}
              fill="transparent"
              strokeDasharray={innerCircumference}
              animatedProps={innerAnimatedProps}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />
          </Svg>

          {/* ── CENTER TEXT ──────────────────────── */}
          <Animated.View
            style={[
              styles.centerContent,
              {
                // Keep text well inside the inner ring
                width: innerRadius * 2 - innerStroke * 2 - 16,
                height: innerRadius * 2 - innerStroke * 2 - 16,
              },
              counterStyle,
            ]}
          >
            {/* Local drops – hero number */}
            <Text
              style={[
                styles.localDropsValue,
                getNumberStyle(dropsFontSize),
                { color: '#FFFFFF' },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {localDrops.toLocaleString()}
            </Text>

            {/* Label */}
            <Text
              style={[
                styles.localDropsLabel,
                { color: hexToRgba(branding.primary, 0.65) },
              ]}
            >
              Local Drops
            </Text>

            {/* Thin divider */}
            <View
              style={[
                styles.divider,
                { backgroundColor: hexToRgba(branding.primary, 0.12) },
              ]}
            />

            {/* Total line */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.textTertiary }]}>
                Total:{' '}
              </Text>
              <Text
                style={[
                  getNumberStyle(12),
                  { color: theme.colors.textSecondary },
                ]}
              >
                {totalDrops.toLocaleString()}
              </Text>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

/* ── Styles ───────────────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  glowRing: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 35,
    elevation: 18,
  },
  ringContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  localDropsValue: {
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    includeFontPadding: false, // Android: tighter bounding box
  },
  localDropsLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2,
  },
  divider: {
    width: 32,
    height: 1,
    borderRadius: 1,
    marginVertical: 6,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
