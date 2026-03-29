import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
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
import { useTranslation } from 'react-i18next';
import { useBranding } from '@/lib/hooks/useBranding';
import { getNumberStyle, fontStyles } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ActivityRingsProps {
  currentRank: number;
  totalMembers: number;
  streakDays: number;
  todayDrops: number;
  todayBonusDrops?: number;
  dailyCap: number;
  size?: number;
  onPress?: () => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStreakColor(streak: number, primary: string): string {
  if (streak >= 60) return '#FFD700';
  if (streak >= 30) return primary;
  if (streak >= 14) return '#FF3B30';
  if (streak >= 7) return '#FFD700';
  return '#FF6B00';
}

function getStreakLabel(streak: number, t: (key: string) => string): string {
  if (streak >= 60) return t('rings.legend');
  if (streak >= 30) return t('rings.unstoppable');
  if (streak >= 14) return t('rings.onFire');
  if (streak >= 7) return t('rings.perfectWeek');
  return '';
}

const TODAY_COLOR = '#E8E8E8';
const STROKE_WIDTH = 12;
const OUTER_RADIUS = 104;
const MIDDLE_RADIUS = 83;
const INNER_RADIUS = 62;

export const ActivityRings: React.FC<ActivityRingsProps> = ({
  currentRank,
  totalMembers,
  streakDays,
  todayDrops,
  todayBonusDrops = 0,
  dailyCap,
  size = 240,
  onPress,
}) => {
  const { t } = useTranslation('home');
  const branding = useBranding();

  const RANK_COLOR = branding.primary;
  const streakColor = getStreakColor(streakDays, branding.primary);
  const streakLabel = getStreakLabel(streakDays, t);

  // Progress calculations
  const rankProgress = totalMembers > 1
    ? (totalMembers - currentRank) / (totalMembers - 1)
    : currentRank === 1 ? 1 : 0;

  const streakCycle = streakDays % 7;
  const streakProgress = streakDays === 0
    ? 0
    : streakCycle === 0
      ? 1
      : streakCycle / 7;

  const overCap = dailyCap > 0 && todayDrops > dailyCap;
  const todayProgress = dailyCap > 0 ? Math.min(todayDrops / dailyCap, 1) : 0;
  const todayColor = overCap ? '#4CD964' : TODAY_COLOR;

  // SVG dimensions
  const svgSize = (OUTER_RADIUS + STROKE_WIDTH / 2) * 2;
  const center = svgSize / 2;

  const outerCircumference = 2 * Math.PI * OUTER_RADIUS;
  const middleCircumference = 2 * Math.PI * MIDDLE_RADIUS;
  const innerCircumference = 2 * Math.PI * INNER_RADIUS;

  // Animated values
  const animRank = useSharedValue(0);
  const animStreak = useSharedValue(0);
  const animToday = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    animRank.value = withTiming(rankProgress, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [rankProgress]);

  useEffect(() => {
    animStreak.value = withTiming(streakProgress, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [streakProgress]);

  useEffect(() => {
    animToday.value = withTiming(todayProgress, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [todayProgress]);

  useEffect(() => {
    if (streakDays < 7) return;
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [streakDays]);

  const outerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: outerCircumference * (1 - animRank.value),
  }));

  const middleAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: middleCircumference * (1 - animStreak.value),
  }));

  const innerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: innerCircumference * (1 - animToday.value),
  }));

  const streakGlowStyle = useAnimatedStyle(() => {
    if (streakDays < 7) return { opacity: 0 };
    const opacity = interpolate(glowPulse.value, [0, 1], [0.2, 0.5]);
    const scale = interpolate(glowPulse.value, [0, 1], [1, 1.04]);
    return { opacity, transform: [{ scale }] };
  });

  const containerScale = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const centerScale = useAnimatedStyle(() => {
    const scale = interpolate(animToday.value, [0, 0.5, 1], [0.93, 1.01, 1]);
    return { transform: [{ scale }] };
  });

  const handlePressIn = () => {
    pressScale.value = withSpring(0.95, { damping: 14, stiffness: 180 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 160 });
  };

  const dropsFontSize = todayDrops >= 100000 ? 26 : todayDrops >= 10000 ? 30 : 36;

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.outerWrap, containerScale]}>
        <View style={[styles.container, { width: svgSize + 40, height: svgSize + 40 }]}>
          {streakDays >= 7 && (
            <Animated.View
              style={[
                styles.streakGlow,
                {
                  width: (MIDDLE_RADIUS + STROKE_WIDTH) * 2,
                  height: (MIDDLE_RADIUS + STROKE_WIDTH) * 2,
                  borderRadius: MIDDLE_RADIUS + STROKE_WIDTH,
                  shadowColor: streakColor,
                },
                streakGlowStyle,
              ]}
            />
          )}

          <Svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
            <Circle
              cx={center} cy={center} r={OUTER_RADIUS}
              stroke={hexToRgba(RANK_COLOR, 0.12)}
              strokeWidth={STROKE_WIDTH} fill="transparent"
            />
            <AnimatedCircle
              cx={center} cy={center} r={OUTER_RADIUS}
              stroke={RANK_COLOR} strokeWidth={STROKE_WIDTH} fill="transparent"
              strokeDasharray={outerCircumference} animatedProps={outerAnimatedProps}
              strokeLinecap="round" rotation="-90" origin={`${center}, ${center}`}
            />

            <Circle
              cx={center} cy={center} r={MIDDLE_RADIUS}
              stroke={hexToRgba(streakColor, 0.12)}
              strokeWidth={STROKE_WIDTH} fill="transparent"
            />
            <AnimatedCircle
              cx={center} cy={center} r={MIDDLE_RADIUS}
              stroke={streakColor} strokeWidth={STROKE_WIDTH} fill="transparent"
              strokeDasharray={middleCircumference} animatedProps={middleAnimatedProps}
              strokeLinecap="round" rotation="-90" origin={`${center}, ${center}`}
            />

            <Circle
              cx={center} cy={center} r={INNER_RADIUS}
              stroke={hexToRgba(todayColor, 0.1)}
              strokeWidth={STROKE_WIDTH} fill="transparent"
            />
            <AnimatedCircle
              cx={center} cy={center} r={INNER_RADIUS}
              stroke={todayColor} strokeWidth={STROKE_WIDTH} fill="transparent"
              strokeDasharray={innerCircumference} animatedProps={innerAnimatedProps}
              strokeLinecap="round" rotation="-90" origin={`${center}, ${center}`}
            />
          </Svg>

          <Animated.View style={[styles.centerContent, centerScale]}>
            <Text
              style={[styles.centerNumber, getNumberStyle(dropsFontSize), overCap && { color: '#4CD964' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {todayDrops.toLocaleString()}
            </Text>
            {overCap && todayBonusDrops > 0 ? (
              <View style={styles.centerBonusRow}>
                <Ionicons name="flash" size={9} color="rgba(76, 217, 100, 0.85)" />
                <Text style={styles.centerBonus}>+{todayBonusDrops}</Text>
              </View>
            ) : null}
            <Text style={styles.centerLabel}>{t('rings.today')}</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  outerWrap: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakGlow: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  centerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerNumber: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    includeFontPadding: false,
  },
  centerBonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  centerBonus: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: 'rgba(76, 217, 100, 0.85)',
  },
  centerLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
