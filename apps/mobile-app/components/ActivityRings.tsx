import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle, Line, Defs, LinearGradient as SvgGradient, Stop, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useBranding } from '@/lib/hooks/useBranding';
import { getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';

export interface ActivityRingsHandle {
  replay: () => void;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

export interface ActivityRingsProps {
  streakDays: number;
  todayDrops: number;
  todayBonusDrops?: number;
  dailyCap: number;
  weeklyDrops: number;
  weeklyCap: number;
  totalGymDrops: number;
  size?: number;
  onPress?: () => void;
}

function getStreakColor(streak: number, primary: string): string {
  if (streak >= 60) return '#FFD700';
  if (streak >= 30) return primary;
  if (streak >= 14) return '#FF3B30';
  if (streak >= 7) return '#FFD700';
  return '#FF6B00';
}

const TODAY_COLOR = '#E8E8E8';
const STROKE_WIDTH = 14;
const GAP = 10;
const OUTER_RADIUS = 120;
const MIDDLE_RADIUS = OUTER_RADIUS - STROKE_WIDTH - GAP;
const INNER_RADIUS = MIDDLE_RADIUS - STROKE_WIDTH - GAP;

// Fast start, hard brake — snappy ring fill
const SNAP_EASING = Easing.bezier(0.22, 1, 0.36, 1);
// Slower deceleration for the entrance sweep
const SWEEP_EASING = Easing.bezier(0.16, 1, 0.30, 1);

export const ActivityRings = forwardRef<ActivityRingsHandle, ActivityRingsProps>(function ActivityRings({
  streakDays,
  todayDrops,
  todayBonusDrops = 0,
  dailyCap,
  weeklyDrops,
  weeklyCap,
  totalGymDrops,
  size = 290,
  onPress,
}, ref) {
  const { t } = useTranslation('home');
  const branding = useBranding();

  const WEEKLY_COLOR = branding.primary;
  const streakColor = getStreakColor(streakDays, branding.primary);

  const weeklyProgress = weeklyCap > 0 ? Math.min(weeklyDrops / weeklyCap, 1) : 0;
  const streakCycle = streakDays % 7;
  const streakProgress = streakDays === 0 ? 0 : streakCycle === 0 ? 1 : streakCycle / 7;
  const overCap = dailyCap > 0 && todayDrops > dailyCap;
  const todayProgress = dailyCap > 0 ? Math.min(todayDrops / dailyCap, 1) : 0;
  const todayColor = overCap ? '#4CD964' : TODAY_COLOR;

  const svgSize = (OUTER_RADIUS + STROKE_WIDTH / 2 + 4) * 2;
  const center = svgSize / 2;

  const outerC = 2 * Math.PI * OUTER_RADIUS;
  const middleC = 2 * Math.PI * MIDDLE_RADIUS;
  const innerC = 2 * Math.PI * INNER_RADIUS;

  // Tick marks around outer ring perimeter
  const TICK_COUNT = 60;
  const tickMarks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const angle = (i / TICK_COUNT) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const isMajor = i % 5 === 0;
    const outerR = OUTER_RADIUS + STROKE_WIDTH / 2 + (isMajor ? 7 : 4);
    const innerR = OUTER_RADIUS + STROKE_WIDTH / 2 + 1;
    return {
      x1: center + Math.cos(rad) * innerR,
      y1: center + Math.sin(rad) * innerR,
      x2: center + Math.cos(rad) * outerR,
      y2: center + Math.sin(rad) * outerR,
      isMajor,
    };
  });

  // ── Shared animated values ──────────────────────────
  // Ring fill (0 → target progress)
  const animWeekly = useSharedValue(0);
  const animStreak = useSharedValue(0);
  const animToday  = useSharedValue(0);

  // Entrance: whole SVG fades + scales in
  const revealOpacity = useSharedValue(0);
  const revealScale   = useSharedValue(0.78);

  // Each ring track fades in staggered (bezel → outer → middle → inner)
  const bezelOpacity  = useSharedValue(0);
  const outerOpacity  = useSharedValue(0);
  const middleOpacity = useSharedValue(0);
  const innerOpacity  = useSharedValue(0);

  // Center counter fades in last
  const centerOpacity = useSharedValue(0);
  const centerScale   = useSharedValue(0.7);

  // Press scale
  const pressScale = useSharedValue(1);

  // Internal replay counter — incremented by the imperative handle.
  // Kept local so incrementing it never re-renders the parent screen.
  const [replayKey, setReplayKey] = useState(0);

  useImperativeHandle(ref, () => ({
    replay: () => setReplayKey((k) => k + 1),
  }), []);

  // ── Entrance animation — replays every time replayKey changes ──
  useEffect(() => {
    const EASE_OUT = Easing.out(Easing.cubic);

    // Reset all values to their start state instantly
    revealOpacity.value = 0;
    revealScale.value   = 0.78;
    bezelOpacity.value  = 0;
    outerOpacity.value  = 0;
    middleOpacity.value = 0;
    innerOpacity.value  = 0;
    animWeekly.value    = 0;
    animStreak.value    = 0;
    animToday.value     = 0;
    centerOpacity.value = 0;
    centerScale.value   = 0.7;

    // 1. Whole container pops in from slightly small
    revealOpacity.value = withTiming(1, { duration: 350, easing: EASE_OUT });
    revealScale.value   = withSequence(
      withTiming(1.04, { duration: 280, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1,    { duration: 160, easing: EASE_OUT }),
    );

    // 2. Bezel ticks materialise first
    bezelOpacity.value  = withDelay(60,  withTiming(1, { duration: 300, easing: EASE_OUT }));

    // 3. Track rings appear staggered
    outerOpacity.value  = withDelay(120, withTiming(1, { duration: 280, easing: EASE_OUT }));
    middleOpacity.value = withDelay(200, withTiming(1, { duration: 280, easing: EASE_OUT }));
    innerOpacity.value  = withDelay(280, withTiming(1, { duration: 280, easing: EASE_OUT }));

    // 4. Progress arcs sweep in (staggered, slower sweep easing)
    animWeekly.value = withDelay(160, withTiming(weeklyProgress, { duration: 900, easing: SWEEP_EASING }));
    animStreak.value = withDelay(240, withTiming(streakProgress,  { duration: 900, easing: SWEEP_EASING }));
    animToday.value  = withDelay(320, withTiming(todayProgress,   { duration: 900, easing: SWEEP_EASING }));

    // 5. Center number appears after rings are well on their way
    centerOpacity.value = withDelay(500, withTiming(1, { duration: 320, easing: EASE_OUT }));
    centerScale.value   = withDelay(500, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.8)) }));
  }, [replayKey]);

  // ── Re-animate on data change (after mount) ─────────
  useEffect(() => {
    animWeekly.value = withTiming(weeklyProgress, { duration: 600, easing: SNAP_EASING });
  }, [weeklyProgress]);

  useEffect(() => {
    animStreak.value = withDelay(80, withTiming(streakProgress, { duration: 600, easing: SNAP_EASING }));
  }, [streakProgress]);

  useEffect(() => {
    animToday.value = withDelay(160, withTiming(todayProgress, { duration: 600, easing: SNAP_EASING }));
  }, [todayProgress]);

  // ── Animated props & styles ─────────────────────────
  const outerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: outerC * (1 - animWeekly.value),
  }));
  const middleAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: middleC * (1 - animStreak.value),
  }));
  const innerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: innerC * (1 - animToday.value),
  }));

  const containerScale = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scale: revealScale.value }],
  }));

  const bezelAnimatedProps  = useAnimatedProps(() => ({ opacity: bezelOpacity.value }));
  const outerTrackAnimatedProps  = useAnimatedProps(() => ({ opacity: outerOpacity.value }));
  const middleTrackAnimatedProps = useAnimatedProps(() => ({ opacity: middleOpacity.value }));
  const innerTrackAnimatedProps  = useAnimatedProps(() => ({ opacity: innerOpacity.value }));

  const centerReveal = useAnimatedStyle(() => ({
    opacity: centerOpacity.value,
    transform: [{ scale: centerScale.value }],
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.94, { damping: 14, stiffness: 220 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 10, stiffness: 160 });
  };

  const formatDrops = (n: number): string => {
    if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
    if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
    return n.toLocaleString();
  };

  const dropsFontSize = totalGymDrops >= 100000 ? 22 : totalGymDrops >= 10000 ? 26 : 30;

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.outerWrap, containerScale]}>
        <Animated.View style={[styles.container, { width: svgSize + 16, height: svgSize + 16 }, revealStyle]}>

          <Svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
            <Defs>
              {/* Solid-to-bright gradient: arc tip is always vivid */}
              <SvgGradient id="outerGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor={hexToRgba(WEEKLY_COLOR, 0.85)} stopOpacity="1" />
                <Stop offset="100%" stopColor={WEEKLY_COLOR} stopOpacity="1" />
              </SvgGradient>
              <SvgGradient id="middleGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor={hexToRgba(streakColor, 0.85)} stopOpacity="1" />
                <Stop offset="100%" stopColor={streakColor} stopOpacity="1" />
              </SvgGradient>
              <SvgGradient id="innerGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor={hexToRgba(todayColor, 0.85)} stopOpacity="1" />
                <Stop offset="100%" stopColor={todayColor} stopOpacity="1" />
              </SvgGradient>
            </Defs>

            {/* Tick marks — bezel detail, fade in first */}
            <AnimatedG animatedProps={bezelAnimatedProps}>
              {tickMarks.map((tick, i) => (
                <Line
                  key={i}
                  x1={tick.x1} y1={tick.y1}
                  x2={tick.x2} y2={tick.y2}
                  stroke={tick.isMajor ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}
                  strokeWidth={tick.isMajor ? 1.2 : 0.5}
                />
              ))}
            </AnimatedG>

            {/* Outer: Weekly */}
            <AnimatedG animatedProps={outerTrackAnimatedProps}>
              <Circle
                cx={center} cy={center} r={OUTER_RADIUS}
                stroke={hexToRgba(WEEKLY_COLOR, 0.22)}
                strokeWidth={STROKE_WIDTH} fill="transparent"
              />
            </AnimatedG>
            <AnimatedCircle
              cx={center} cy={center} r={OUTER_RADIUS}
              stroke="url(#outerGrad)"
              strokeWidth={STROKE_WIDTH} fill="transparent"
              strokeDasharray={outerC} animatedProps={outerAnimatedProps}
              strokeLinecap="round" rotation="-90" origin={`${center}, ${center}`}
            />

            {/* Middle: Streak */}
            <AnimatedG animatedProps={middleTrackAnimatedProps}>
              <Circle
                cx={center} cy={center} r={MIDDLE_RADIUS}
                stroke={hexToRgba(streakColor, 0.22)}
                strokeWidth={STROKE_WIDTH} fill="transparent"
              />
            </AnimatedG>
            <AnimatedCircle
              cx={center} cy={center} r={MIDDLE_RADIUS}
              stroke="url(#middleGrad)"
              strokeWidth={STROKE_WIDTH} fill="transparent"
              strokeDasharray={middleC} animatedProps={middleAnimatedProps}
              strokeLinecap="round" rotation="-90" origin={`${center}, ${center}`}
            />

            {/* Inner: Today */}
            <AnimatedG animatedProps={innerTrackAnimatedProps}>
              <Circle
                cx={center} cy={center} r={INNER_RADIUS}
                stroke={hexToRgba(todayColor, 0.22)}
                strokeWidth={STROKE_WIDTH} fill="transparent"
              />
            </AnimatedG>
            <AnimatedCircle
              cx={center} cy={center} r={INNER_RADIUS}
              stroke="url(#innerGrad)"
              strokeWidth={STROKE_WIDTH} fill="transparent"
              strokeDasharray={innerC} animatedProps={innerAnimatedProps}
              strokeLinecap="round" rotation="-90" origin={`${center}, ${center}`}
            />
          </Svg>

          {/* Center */}
          <Animated.View style={[styles.centerContent, centerReveal]}>
            <Text
              style={[
                styles.centerNumber,
                getNumberStyle(dropsFontSize),
                overCap && { color: '#4CD964' },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {formatDrops(totalGymDrops)}
            </Text>
            <Text style={styles.centerLabel}>{t('rings.drops')}</Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  outerWrap: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: INNER_RADIUS * 2 - STROKE_WIDTH * 2,
  },
  centerNumber: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    includeFontPadding: false,
    textAlign: 'center',
  },
  centerLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});
