import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { fontStyles, hexToRgba } from '@/lib/theme';
import { PressableCard } from '@/components/PressableCard';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withDelay,
} from 'react-native-reanimated';

/* ── Helpers ──────────────────────────────────────── */
function fmtDrops(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ── Types ────────────────────────────────────────── */
interface DayData {
  day: string;
  drops: number;
  isToday: boolean;
}

interface WeeklyActivityChartProps {
  data: DayData[];
  activeDays: number;
  totalSlots?: number;  // denominator for "X/Y days/weeks/months"
  brandPrimary: string;
  title?: string;
  activeSuffix?: string; // e.g. 'days', 'weeks', 'months'
  showDropLabels?: boolean; // show drops count above each bar
  onPress?: () => void;
}

/* ── Animated Bar ──────────────────────────────────── */
const AnimatedBar: React.FC<{
  heightPercent: number;
  isActive: boolean;
  isToday: boolean;
  brandPrimary: string;
  delay: number;
}> = ({ heightPercent, isActive, isToday, brandPrimary, delay }) => {
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withDelay(
      delay,
      withTiming(heightPercent, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );
  }, [heightPercent]);

  const barStyle = useAnimatedStyle(() => ({
    height: `${height.value}%`,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: isActive
            ? isToday
              ? brandPrimary
              : hexToRgba(brandPrimary, 0.6)
            : hexToRgba(brandPrimary, 0.08),
          minHeight: 4,
        },
        isToday && isActive && {
          shadowColor: brandPrimary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 6,
          elevation: 4,
        },
        barStyle,
      ]}
    />
  );
};

/* ── Component ────────────────────────────────────── */
export const WeeklyActivityChart: React.FC<WeeklyActivityChartProps> = ({
  data,
  activeDays,
  totalSlots,
  brandPrimary,
  title = 'This Week',
  activeSuffix = 'days',
  showDropLabels = false,
  onPress,
}) => {
  const maxDrops = Math.max(...data.map((d) => d.drops), 1);
  const denominator = totalSlots ?? data.length;

  const inner = (
    <PlatformBlur intensity={50} tint="dark" style={styles.blur} androidColor="rgba(12,12,22,0.97)">
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.activeDaysText, { color: brandPrimary }]}>
          {activeDays}/{denominator} {activeSuffix}
        </Text>
      </View>

      {/* Bars */}
      <View style={[styles.chartRow, showDropLabels && styles.chartRowTall]}>
        {data.map((d, i) => {
          const pct = d.drops > 0 ? Math.max((d.drops / maxDrops) * 100, 8) : 0;
          return (
            <View key={d.day} style={styles.barCol}>
              {showDropLabels && (
                <Text
                  style={[
                    styles.dropsLabel,
                    { color: d.drops > 0 ? (d.isToday ? brandPrimary : hexToRgba(brandPrimary, 0.75)) : 'transparent' },
                  ]}
                  numberOfLines={1}
                >
                  {d.drops > 0 ? fmtDrops(d.drops) : '·'}
                </Text>
              )}
              <View style={styles.barContainer}>
                <AnimatedBar
                  heightPercent={pct}
                  isActive={d.drops > 0}
                  isToday={d.isToday}
                  brandPrimary={brandPrimary}
                  delay={i * 60}
                />
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  d.isToday && { color: brandPrimary, ...fontStyles.bodySemiBold },
                ]}
              >
                {d.day}
              </Text>
            </View>
          );
        })}
      </View>
    </PlatformBlur>
  );

  if (onPress) {
    return (
      <PressableCard style={styles.wrapper} onPress={onPress}>
        {inner}
      </PressableCard>
    );
  }

  return <View style={styles.wrapper}>{inner}</View>;
};

/* ── Styles ───────────────────────────────────────── */
const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 12, 22, 0.38)',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
    marginBottom: 24,
  },
  blur: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#FFFFFF',
  },
  activeDaysText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    gap: 6,
  },
  chartRowTall: {
    height: 80,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dropsLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.2,
    textAlign: 'center',
    minHeight: 13,
  },
  barContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderRadius: 3,
    minHeight: 4,
  },
  dayLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 9,
    color: '#808080',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
