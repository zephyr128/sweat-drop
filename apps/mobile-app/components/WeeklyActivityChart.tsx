import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withDelay,
} from 'react-native-reanimated';

/* ── Types ────────────────────────────────────────── */
interface DayData {
  day: string;
  drops: number;
  isToday: boolean;
}

interface WeeklyActivityChartProps {
  data: DayData[];
  activeDays: number;
  brandPrimary: string;
}

/* ── Helpers ──────────────────────────────────────── */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
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
  brandPrimary,
}) => {
  const maxDrops = Math.max(...data.map((d) => d.drops), 1);

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={50} tint="dark" style={styles.blur}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>This Week</Text>
          <Text style={[styles.activeDaysText, { color: brandPrimary }]}>
            {activeDays}/7 days
          </Text>
        </View>

        {/* Bars */}
        <View style={styles.chartRow}>
          {data.map((d, i) => {
            const pct = d.drops > 0 ? Math.max((d.drops / maxDrops) * 100, 8) : 0;
            return (
              <View key={d.day} style={styles.barCol}>
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
                    d.isToday && { color: brandPrimary, fontWeight: '700' },
                  ]}
                >
                  {d.day}
                </Text>
              </View>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
};

/* ── Styles ───────────────────────────────────────── */
const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 24,
  },
  blur: {
    padding: 16,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  activeDaysText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
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
    fontSize: 9,
    fontWeight: '500',
    color: '#808080',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
