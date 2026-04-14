import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
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
import type { LeaderboardPeriod } from '@/components/LeaderboardPreview';
import {
  HERO_GAUGE_ARC_START_DEG,
  HERO_GAUGE_ARC_END_DEG,
  heroGaugeArcChordDrop,
} from '@/lib/heroGaugeArc';

const RANK_COLOR = '#EAB308';
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
const BG_ICON_SIZE = Math.round(ARC_BOWL_HEIGHT * 0.88);

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

export interface RankRingProps {
  rank: number;
  totalMembers: number;
  rankPeriod: LeaderboardPeriod;
  dropsToFirst?: number;
  rewardText?: string | null;
  active: boolean;
  onPress?: () => void;
}

export function RankRing({
  rank,
  totalMembers,
  rankPeriod,
  dropsToFirst = 0,
  rewardText = null,
  active,
  onPress,
}: RankRingProps) {
  const { t } = useTranslation('home');

  const progress = totalMembers > 0 && rank > 0
    ? Math.max(0, Math.min(1, 1 - (rank - 1) / totalMembers))
    : 0;
  const targetPct = Math.round(progress * 100);
  const periodLabel = rankPeriod === 'weekly'
    ? t('weeklyPeriod')
    : rankPeriod === 'monthly'
      ? t('monthlyPeriod')
      : t('allTimePeriod');

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
              stroke={tk.lit ? RANK_COLOR : 'rgba(255,255,255,0.2)'}
              strokeWidth={tk.long ? 3.5 : 2}
              strokeLinecap="round"
            />
          </React.Fragment>
        ))}
      </Svg>

      <Animated.View style={[styles.center, { top: ARC_BOWL_TOP, height: ARC_BOWL_HEIGHT }, centerReveal]}>
        <Ionicons name="podium-outline" size={BG_ICON_SIZE} color={hexToRgba(RANK_COLOR, 0.08)} style={styles.bgIcon} />
        {rank > 0 ? (
          <>
            <Text style={styles.rankLabel}>{periodLabel}</Text>
            <Text style={[styles.rankNumber, { color: RANK_COLOR }]}>#{rank}</Text>
            {rank === 1 ? (
              <Text style={styles.metaPrimary}>{t('compete.defendFirst', { defaultValue: 'Braniš prvo mesto' })}</Text>
            ) : dropsToFirst > 0 ? (
              <Text style={styles.metaPrimary}>
                {t('compete.stillNeedDrops', {
                  count: dropsToFirst,
                  defaultValue: `još ${dropsToFirst} kapi do #1`,
                })}
              </Text>
            ) : null}
            {!!rewardText && (
              <Text style={styles.metaReward} numberOfLines={1}>
                {rewardText}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.rankNumber, { color: hexToRgba(RANK_COLOR, 0.4), fontSize: 28 }]}>—</Text>
            <Text style={styles.percentile}>{periodLabel}</Text>
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
  bgIcon: {
    position: 'absolute',
    alignSelf: 'center',
    top: 4,
  },
  rankLabel: {
    ...fontStyles.heading,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  rankNumber: {
    ...fontStyles.heading,
    fontSize: 46,
    color: RANK_COLOR,
    textAlign: 'center',
    lineHeight: 52,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  percentile: {
    ...fontStyles.heading,
    fontSize: 13,
    color: hexToRgba(RANK_COLOR, 0.7),
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  metaPrimary: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.62)',
    marginTop: 2,
    textAlign: 'center',
  },
  metaReward: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: RANK_COLOR,
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 220,
  },
});
