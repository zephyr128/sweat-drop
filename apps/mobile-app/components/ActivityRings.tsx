import React, { useEffect, useImperativeHandle, forwardRef, useState, useRef } from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useBranding } from '@/lib/hooks/useBranding';
import { fontStyles, hexToRgba } from '@/lib/theme';
import {
  HERO_GAUGE_ARC_START_DEG,
  HERO_GAUGE_ARC_END_DEG,
  heroGaugeArcChordDrop,
} from '@/lib/heroGaugeArc';

export interface ActivityRingsHandle {
  replay: () => void;
}

export interface ActivityRingsProps {
  streakDays: number;
  todayDrops: number;
  todayBonusDrops?: number;
  dailyCap: number;
  totalGymDrops: number;
  size?: number;
  onPress?: () => void;
  compact?: boolean;
}

// ── Gauge constants ────────────────────────────────────────────────────────────
const TICKS = 33;
const RADIUS = 128;
const STROKE_W = 28;
const SVG_PAD = 4;
const SVG_SIZE = (RADIUS + STROKE_W / 2 + SVG_PAD) * 2;
const CENTER = SVG_SIZE / 2;
const ARC_CHORD_DROP = heroGaugeArcChordDrop(RADIUS);
const TICK_R_OUTER = RADIUS + STROKE_W * 0.5 - 1;
const ENDPOINT_Y = CENTER + TICK_R_OUTER * Math.sin(15 * Math.PI / 180);
const SEMI_H = Math.ceil(ENDPOINT_Y) + 8;
const TICK_LONG = 24;
const TICK_SHORT = 14;
const D2R = Math.PI / 180;
const ARC_SPAN = HERO_GAUGE_ARC_END_DEG - HERO_GAUGE_ARC_START_DEG; // 210°
const ARC_BOWL_TOP = CENTER - RADIUS + TICK_LONG + 4;
const ARC_BOWL_BOTTOM = CENTER + ARC_CHORD_DROP;
const ARC_BOWL_HEIGHT = ARC_BOWL_BOTTOM - ARC_BOWL_TOP;
const BG_ICON_SIZE = Math.round(ARC_BOWL_HEIGHT * 0.88);

function buildTicks(animPct: number) {
  return Array.from({ length: TICKS }, (_, i) => {
    const frac = i / (TICKS - 1);
    const angleDeg = HERO_GAUGE_ARC_END_DEG - frac * ARC_SPAN;
    const theta = angleDeg * D2R;
    const long = i % 4 === 0;
    const len = long ? TICK_LONG : TICK_SHORT;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const x1 = CENTER + TICK_R_OUTER * cosT;
    const y1 = CENTER - TICK_R_OUTER * sinT;
    const x2 = CENTER + (TICK_R_OUTER - len) * cosT;
    const y2 = CENTER - (TICK_R_OUTER - len) * sinT;
    const progress = Math.max(0, Math.min(animPct / 100, 1));
    const lit = progress >= 1 ? true : progress > 0 && frac <= progress;
    return { x1, y1, x2, y2, lit, long };
  });
}

function formatDrops(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}


export const ActivityRings = forwardRef<ActivityRingsHandle, ActivityRingsProps>(function ActivityRings(
  {
    todayDrops,
    todayBonusDrops = 0,
    dailyCap,
    totalGymDrops,
    size = 290,
    onPress,
    compact = false,
  },
  ref,
) {
  const { t } = useTranslation('home');
  const branding = useBranding();
  const dailyProgress = dailyCap > 0 ? Math.min(todayDrops / dailyCap, 1) : 0;
  const goalReached = dailyProgress >= 1;
  const color = goalReached ? '#4ade80' : branding.primary;
  const targetPct = Math.round(dailyProgress * 100);
  const totalToday = todayDrops + todayBonusDrops;
  const todayDisplay = formatDrops(totalToday).toUpperCase();

  // ── JS-side tick animation ──────────────────────────────────────────────────
  const [animPct, setAnimPct] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setAnimPct(0);
    const start = performance.now();
    const dur = 1100;
    const run = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setAnimPct(ease * targetPct);
      if (p < 1) { rafRef.current = requestAnimationFrame(run); }
    };
    rafRef.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetPct, replayKey]);

  useImperativeHandle(ref, () => ({
    replay: () => setReplayKey((k) => k + 1),
  }), []);

  // ── Entrance animations ─────────────────────────────────────────────────────
  const revealOpacity = useSharedValue(0);
  const revealScale = useSharedValue(0.78);
  const centerOpacity = useSharedValue(0);
  const centerScale = useSharedValue(0.7);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    const EASE_OUT = Easing.out(Easing.cubic);
    revealOpacity.value = 0;
    revealScale.value = 0.78;
    centerOpacity.value = 0;
    centerScale.value = 0.7;

    revealOpacity.value = withTiming(1, { duration: 350, easing: EASE_OUT });
    revealScale.value = withSequence(
      withTiming(1.04, { duration: 280, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1, { duration: 160, easing: EASE_OUT }),
    );
    centerOpacity.value = withDelay(500, withTiming(1, { duration: 320, easing: EASE_OUT }));
    centerScale.value = withDelay(500, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.8)) }));
  }, [replayKey]);

  const ringScale = size / SVG_SIZE;

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value * ringScale }],
  }));
  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scale: revealScale.value }],
  }));
  const centerReveal = useAnimatedStyle(() => ({
    opacity: centerOpacity.value,
    transform: [{ scale: centerScale.value }],
  }));

  const handlePressIn = () => { pressScale.value = withSpring(0.94, { damping: 14, stiffness: 220 }); };
  const handlePressOut = () => { pressScale.value = withSpring(1, { damping: 10, stiffness: 160 }); };

  const ticks = buildTicks(animPct);

  const spendableDisplay = formatDrops(totalGymDrops).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={compact ? undefined : handlePressIn}
      onPressOut={compact ? undefined : handlePressOut}
    >
      <Animated.View style={[styles.outerWrap, { width: SVG_SIZE, height: SEMI_H }, containerStyle]}>
        <Animated.View style={[styles.container, { width: SVG_SIZE, height: SEMI_H }, revealStyle]}>
          <Svg width={SVG_SIZE} height={SEMI_H} viewBox={`0 0 ${SVG_SIZE} ${SEMI_H}`}>
            {ticks.map((tk, i) => (
              <React.Fragment key={i}>
                <Line
                  x1={tk.x1} y1={tk.y1}
                  x2={tk.x2} y2={tk.y2}
                  stroke="rgba(0,0,0,0.45)"
                  strokeWidth={(tk.long ? 3.5 : 2) + 1.4}
                  strokeLinecap="round"
                />
                <Line
                  x1={tk.x1} y1={tk.y1}
                  x2={tk.x2} y2={tk.y2}
                  stroke={tk.lit ? color : 'rgba(255,255,255,0.2)'}
                  strokeWidth={tk.long ? 3.5 : 2}
                  strokeLinecap="round"
                />
              </React.Fragment>
            ))}
          </Svg>

          <Animated.View
            style={[
              styles.centerContent,
              { top: ARC_BOWL_TOP, height: ARC_BOWL_HEIGHT },
              centerReveal,
            ]}
          >
            <Ionicons
              name={goalReached ? 'checkmark-circle-outline' : 'water-outline'}
              size={BG_ICON_SIZE}
              color={hexToRgba(color, goalReached ? 0.08 : 0.10)}
              style={styles.bgIcon}
            />
            <View style={styles.topRow}>
              <Text style={styles.topLabel}>{t('rings.spendable')}</Text>
            </View>
            <View style={styles.spendableRow}>
              <Text style={[styles.spendableNumber, { color }]}>{spendableDisplay}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={[styles.todayNumber, { color }]}>{todayDisplay}</Text>
            <Text style={styles.todayLabel}>
              {goalReached ? t('rings.goalReached') : t('rings.today')}
            </Text>
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
    overflow: 'visible',
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  centerContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  topLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  bgIcon: {
    position: 'absolute',
    alignSelf: 'center',
    top: 2,
  },
  spendableNumber: {
    ...fontStyles.heading,
    fontSize: 42,
    lineHeight: 46,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  spendableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    width: 52,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 8,
  },
  todayNumber: {
    ...fontStyles.heading,
    fontSize: 22,
    lineHeight: 25,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  todayLabel: {
    ...fontStyles.heading,
    fontSize: 9,
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 1,
    textAlign: 'center',
  },
});
