import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { fontStyles, hexToRgba } from '@/lib/theme';
import {
  HERO_GAUGE_ARC_START_DEG,
  HERO_GAUGE_ARC_END_DEG,
  heroGaugeArcChordDrop,
} from '@/lib/heroGaugeArc';

const ARENA_COLOR = '#22D3EE';
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
const ARC_SPAN = HERO_GAUGE_ARC_END_DEG - HERO_GAUGE_ARC_START_DEG;
const ARC_BOWL_TOP = CENTER - RADIUS + TICK_LONG + 4;
const ARC_BOWL_BOTTOM = CENTER + ARC_CHORD_DROP;
const ARC_BOWL_HEIGHT = ARC_BOWL_BOTTOM - ARC_BOWL_TOP;
const BG_ICON_SIZE = Math.round(ARC_BOWL_HEIGHT * 0.9);

function buildTicks(animPct: number) {
  const progress = Math.max(0, Math.min(animPct / 100, 1));
  return Array.from({ length: TICKS }, (_, i) => {
    const frac = i / (TICKS - 1);
    // i=0 → left end (195°), fills left-to-right
    const angleDeg = HERO_GAUGE_ARC_END_DEG - frac * ARC_SPAN;
    const theta = angleDeg * D2R;
    const long = i % 4 === 0;
    const len = long ? TICK_LONG : TICK_SHORT;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    return {
      x1: CENTER + TICK_R_OUTER * cosT,
      y1: CENTER - TICK_R_OUTER * sinT,
      x2: CENTER + (TICK_R_OUTER - len) * cosT,
      y2: CENTER - (TICK_R_OUTER - len) * sinT,
      lit: progress >= 1 ? true : progress > 0 && frac < progress,
      long,
    };
  });
}

export interface ArenaRingProps {
  activeCount: number;
  bestRank: number | null;
  arenaName: string | null;
  progress: number;
  active: boolean;
  onPress?: () => void;
}

export function ArenaRing({ activeCount, bestRank, arenaName, progress, active, onPress }: ArenaRingProps) {
  const { t } = useTranslation('home');
  const targetPct = Math.round(progress * 100);

  const [animPct, setAnimPct] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
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
  }, [active, targetPct]);

  const revealOpacity = useSharedValue(0);
  const revealScale = useSharedValue(0.78);
  const centerOpacity = useSharedValue(0);
  const centerScale = useSharedValue(0.7);

  useEffect(() => {
    if (!active) return;
    const EASE_OUT = Easing.out(Easing.cubic);
    revealOpacity.value = 0; revealScale.value = 0.78;
    centerOpacity.value = 0; centerScale.value = 0.7;
    revealOpacity.value = withTiming(1, { duration: 350, easing: EASE_OUT });
    revealScale.value = withSequence(
      withTiming(1.04, { duration: 280, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1, { duration: 160, easing: EASE_OUT }),
    );
    centerOpacity.value = withDelay(500, withTiming(1, { duration: 320, easing: EASE_OUT }));
    centerScale.value = withDelay(500, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.8)) }));
  }, [active, progress]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scale: revealScale.value }],
  }));
  const centerReveal = useAnimatedStyle(() => ({
    opacity: centerOpacity.value,
    transform: [{ scale: centerScale.value }],
  }));

  const ticks = buildTicks(animPct);

  const ringContent = (
    <Animated.View style={[styles.wrap, revealStyle]}>
      <Svg width={SVG_SIZE} height={SEMI_H} viewBox={`0 0 ${SVG_SIZE} ${SEMI_H}`}>
        {ticks.map((tk, i) => (
          <React.Fragment key={i}>
            <Line
              x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={(tk.long ? 3.5 : 2) + 1.4}
              strokeLinecap="round"
            />
            <Line
              x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
              stroke={tk.lit ? ARENA_COLOR : 'rgba(255,255,255,0.2)'}
              strokeWidth={tk.long ? 3.5 : 2}
              strokeLinecap="round"
            />
          </React.Fragment>
        ))}
      </Svg>

      <Animated.View style={[styles.center, { top: ARC_BOWL_TOP, height: ARC_BOWL_HEIGHT }, centerReveal]}>
        <MaterialCommunityIcons name="sword-cross" size={BG_ICON_SIZE} color={hexToRgba(ARENA_COLOR, 0.08)} style={styles.bgIcon} />
        {activeCount > 0 ? (
          <>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{t('liveNow')}</Text>
            </View>
            {bestRank != null ? (
              <Text style={[styles.rankNumber, { color: ARENA_COLOR }]}>#{bestRank}</Text>
            ) : (
              <Text style={[styles.rankNumber, { color: hexToRgba(ARENA_COLOR, 0.5), fontSize: 28 }]}>—</Text>
            )}
            {arenaName && (
              <Text style={styles.arenaName} numberOfLines={2}>{arenaName}</Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.arenaName, { color: hexToRgba(ARENA_COLOR, 0.5) }]}>{t('pagerTabs.arenas')}</Text>
            <Text style={styles.arenaSubLabel}>{t('noArenaActive')}</Text>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );

  if (!onPress) return ringContent;
  return <Pressable onPress={onPress} hitSlop={8}>{ringContent}</Pressable>;
}

const styles = StyleSheet.create({
  wrap: {
    width: SVG_SIZE,
    height: SEMI_H,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: ARENA_COLOR,
  },
  liveText: {
    ...fontStyles.heading,
    fontSize: 12,
    color: ARENA_COLOR,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  rankNumber: {
    ...fontStyles.heading,
    fontSize: 46,
    color: ARENA_COLOR,
    textAlign: 'center',
    lineHeight: 52,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  arenaName: {
    ...fontStyles.body,
    fontSize: 12,
    color: hexToRgba(ARENA_COLOR, 0.6),
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  arenaSubLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  bgIcon: {
    position: 'absolute',
    alignSelf: 'center',
    top: 4,
  },
});
