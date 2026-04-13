/**
 * MiniGaugeBar
 * Compact single-line representation of the active gauge.
 * Appears in the sticky section when the hero pager has scrolled off-screen.
 * Animated height/opacity driven by collapseProgress (0 = hidden, 1 = visible).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { fontStyles, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';

const MINI_H = 36;

interface MiniGaugeBarProps {
  collapseProgress: SharedValue<number>;
  // Active tab data — whichever tab/gauge is showing
  activePage: number; // 0=activity, 1=compete, 2=challenges, 3=arenas
  // Activity gauge
  todayDrops: number;
  dailyCap: number;
  // Compete gauge
  rank: number;
  totalMembers: number;
  // Challenges gauge
  challengeCompletedCount: number;
  challengeTotalCount: number;
  // Arenas gauge
  activeArenaCount: number;
}

function formatDrops(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}K`;
  return String(n);
}

function pct(val: number, cap: number): number {
  if (!cap) return 0;
  return Math.min(Math.round((val / cap) * 100), 100);
}

export function MiniGaugeBar({
  collapseProgress,
  activePage,
  todayDrops,
  dailyCap,
  rank,
  totalMembers,
  challengeCompletedCount,
  challengeTotalCount,
  activeArenaCount,
}: MiniGaugeBarProps) {
  const branding = useBranding();

  const wrapStyle = useAnimatedStyle(() => ({
    height: interpolate(collapseProgress.value, [0, 1], [0, MINI_H]),
    opacity: interpolate(collapseProgress.value, [0, 0.5, 1], [0, 0, 1]),
    transform: [{ translateY: 1 }],
    overflow: 'hidden',
  }));

  // Per-tab accent and label
  const ACCENTS = ['', '#EAB308', '#FF9F4A', '#22D3EE'];
  const accent = activePage === 0 ? branding.primary : ACCENTS[activePage];

  let iconName: string;
  let valueText: string;
  let labelText: string;
  let progressPct: number;

  switch (activePage) {
    case 1: // Compete
      iconName = 'trophy-outline';
      valueText = rank > 0 ? `#${rank}` : '—';
      labelText = `/ ${totalMembers}`;
      progressPct = rank > 0 && totalMembers > 0 ? Math.round(((totalMembers - rank + 1) / totalMembers) * 100) : 0;
      break;
    case 2: // Challenges
      iconName = 'ribbon-outline';
      valueText = `${challengeCompletedCount}/${challengeTotalCount}`;
      labelText = 'izazova';
      progressPct = challengeTotalCount > 0 ? Math.round((challengeCompletedCount / challengeTotalCount) * 100) : 0;
      break;
    case 3: // Arenas
      iconName = 'flash-outline';
      valueText = String(activeArenaCount);
      labelText = 'arena';
      progressPct = Math.min(activeArenaCount * 20, 100);
      break;
    default: // Activity
      iconName = 'water-outline';
      valueText = formatDrops(todayDrops);
      labelText = `/ ${formatDrops(dailyCap)} danas`;
      progressPct = pct(todayDrops, dailyCap);
  }

  return (
    <Animated.View style={[styles.wrap, wrapStyle]}>
      <View style={[styles.inner, { borderBottomColor: hexToRgba(accent, 0.18) }]}>
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: hexToRgba(accent, 0.15) }]}>
          <Ionicons name={iconName as any} size={13} color={accent} />
        </View>

        {/* Value + label */}
        <Text style={[styles.value, { color: accent }]}>{valueText}</Text>
        <Text style={[styles.label, { color: hexToRgba('#fff', 0.5) }]}>{labelText}</Text>

        {/* Mini progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPct}%` as any,
                backgroundColor: accent,
              },
            ]}
          />
        </View>

        <Text style={[styles.pctLabel, { color: hexToRgba(accent, 0.85) }]}>{progressPct}%</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  inner: {
    height: MINI_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 6,
    gap: 8,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
  },
  label: {
    ...fontStyles.body,
    fontSize: 12,
    flex: 1,
  },
  progressTrack: {
    width: 64,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  pctLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    minWidth: 32,
    textAlign: 'right',
  },
});
