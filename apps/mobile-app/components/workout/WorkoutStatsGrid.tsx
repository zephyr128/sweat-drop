import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import AnimatedText from './AnimatedText';

interface WorkoutStatsGridProps {
  machineType: string;
  duration: number;
  bleConnected: boolean;
  signalStatus: 'ok' | 'lost';
  hasSensor: boolean;
  animatedRPMText: SharedValue<string>;
  animatedCaloriesText: SharedValue<string>;
  animatedPaceText: SharedValue<string>;
  animatedSpeedText: SharedValue<string>;
  animatedDistanceText: SharedValue<string>;
  animatedInclineText: SharedValue<string>;
  rpmPulseStyle: any;
  rpmTextColorStyle: any;
  distanceUnitLabel: string;
  primaryColor: string;
  formatTime: (s: number) => string;
  labels: {
    time: string;
    rpm: string;
    kcal: string;
    kmh: string;
    minPerKm: string;
    incline: string;
  };
}

function SignalIndicator({ status, primaryColor }: { status: 'ok' | 'lost'; primaryColor: string }) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'ok') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseScale.value = 1;
      pulseOpacity.value = 0.5;
    }
  }, [status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons
        name="radio"
        size={12}
        color={status === 'ok' ? primaryColor : theme.colors.textSecondary}
      />
    </Animated.View>
  );
}

export default function WorkoutStatsGrid({
  machineType,
  duration,
  bleConnected,
  signalStatus,
  hasSensor,
  animatedRPMText,
  animatedCaloriesText,
  animatedPaceText,
  animatedSpeedText,
  animatedDistanceText,
  animatedInclineText,
  rpmPulseStyle,
  rpmTextColorStyle,
  distanceUnitLabel,
  primaryColor,
  formatTime,
  labels,
}: WorkoutStatsGridProps) {
  if (machineType === 'treadmill') {
    return (
      <View style={styles.statsGridTreadmill}>
        <View style={styles.statItemTreadmill}>
          <Ionicons name="time-outline" size={20} color={primaryColor} />
          <Text style={[styles.statValue, getNumberStyle(18)]}>{formatTime(duration)}</Text>
          <Text style={styles.statLabel}>{labels.time}</Text>
        </View>

        <View style={styles.statItemTreadmill}>
          <View style={styles.rpmHeader}>
            <Ionicons name="speedometer-outline" size={20} color={primaryColor} />
            {bleConnected && <SignalIndicator status={signalStatus} primaryColor={primaryColor} />}
          </View>
          <AnimatedText text={animatedSpeedText} style={[styles.statValue, getNumberStyle(18)]} />
          <Text style={styles.statLabel}>{labels.kmh}</Text>
        </View>

        <View style={styles.statItemTreadmill}>
          <Ionicons name="timer-outline" size={20} color={primaryColor} />
          <AnimatedText text={animatedPaceText} style={[styles.statValue, getNumberStyle(18)]} />
          <Text style={styles.statLabel}>{labels.minPerKm}</Text>
        </View>

        <View style={styles.statItemTreadmill}>
          <Ionicons name="flame" size={20} color={theme.colors.error} />
          <AnimatedText text={animatedCaloriesText} style={[styles.statValue, getNumberStyle(18)]} />
          <Text style={styles.statLabel}>{labels.kcal}</Text>
        </View>

        <View style={styles.statItemTreadmill}>
          <Ionicons name="navigate-outline" size={20} color={primaryColor} />
          <AnimatedText text={animatedDistanceText} style={[styles.statValue, getNumberStyle(18)]} />
          <Text style={styles.statLabel}>{distanceUnitLabel}</Text>
        </View>

        <View style={styles.statItemTreadmill}>
          <Ionicons name="trending-up-outline" size={20} color={primaryColor} />
          <AnimatedText text={animatedInclineText} style={[styles.statValue, getNumberStyle(18)]} />
          <Text style={styles.statLabel}>{labels.incline} %</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.statsGrid}>
      <View style={styles.statItem}>
        <Ionicons name="time-outline" size={24} color={primaryColor} />
        <Text style={[styles.statValue, getNumberStyle(20)]}>{formatTime(duration)}</Text>
        <Text style={styles.statLabel}>{labels.time}</Text>
      </View>

      <View style={styles.statItem}>
        <Ionicons name="flame" size={24} color={theme.colors.error} />
        <AnimatedText text={animatedCaloriesText} style={[styles.statValue, getNumberStyle(20)]} />
        <Text style={styles.statLabel}>{labels.kcal}</Text>
      </View>

      <View style={styles.statItem}>
        <Ionicons name="speedometer-outline" size={24} color={primaryColor} />
        <AnimatedText text={animatedPaceText} style={[styles.statValue, getNumberStyle(20)]} />
        <Text style={styles.statLabel}>{labels.minPerKm}</Text>
      </View>

      {hasSensor && (
        <Animated.View style={[styles.statItem, rpmPulseStyle]}>
          <View style={styles.rpmHeader}>
            <Ionicons
              name="pulse-outline"
              size={24}
              color={bleConnected ? primaryColor : theme.colors.textSecondary}
            />
            {bleConnected && <SignalIndicator status={signalStatus} primaryColor={primaryColor} />}
          </View>
          <AnimatedText
            text={animatedRPMText}
            style={[styles.statValue, getNumberStyle(20), rpmTextColorStyle]}
          />
          <Text style={styles.statLabel}>{labels.rpm}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  statsGridTreadmill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    rowGap: theme.spacing.md,
  },
  statItemTreadmill: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: '33%',
  },
  rpmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statItem: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statValue: {
    ...fontStyles.number,
    color: theme.colors.text,
  },
  statLabel: {
    ...fontStyles.heading,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
});
