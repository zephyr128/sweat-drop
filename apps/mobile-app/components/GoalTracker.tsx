import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  SharedValue,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface GoalTrackerProps {
  exerciseName: string;
  targetMetric: string;
  targetValue: number;
  targetUnit: string | null;
  currentProgress: SharedValue<number>;
  goalPercentage: SharedValue<number>;
  primaryColor: string;
  primaryLight: string;
}

export default function GoalTracker({
  exerciseName,
  targetMetric,
  targetValue,
  targetUnit,
  currentProgress,
  goalPercentage,
  primaryColor,
  primaryLight,
}: GoalTrackerProps) {
  const { theme: currentTheme } = useTheme();

  const progressBarStyle = useAnimatedStyle(() => {
    const width = Math.min(goalPercentage.value, 100);
    return {
      width: `${width}%`,
    };
  });

  const getMetricDisplay = () => {
    switch (targetMetric) {
      case 'time':
        return `${targetValue} ${targetUnit || 'min'}`;
      case 'rpm':
        return `${targetValue} RPM`;
      case 'reps':
        return `${targetValue} reps`;
      case 'distance':
        return `${targetValue} ${targetUnit || 'km'}`;
      default:
        return `${targetValue} ${targetUnit || ''}`;
    }
  };

  // Use useDerivedValue for reactive progress display
  const progressDisplayText = useDerivedValue(() => {
    switch (targetMetric) {
      case 'time':
        const minutes = Math.floor(currentProgress.value / 60);
        const seconds = Math.floor(currentProgress.value % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      case 'rpm':
        return `${Math.round(currentProgress.value)} RPM`;
      case 'reps':
        return `${Math.round(currentProgress.value)} reps`;
      case 'distance':
        return `${currentProgress.value.toFixed(2)} ${targetUnit || 'km'}`;
      default:
        return `${currentProgress.value.toFixed(1)} ${targetUnit || ''}`;
    }
  }, [targetMetric, targetUnit]);

  // Animated props for text display
  const animatedProgressProps = useAnimatedProps(() => {
    'worklet';
    return {
      children: progressDisplayText.value,
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: primaryLight }]}>
      <View style={styles.header}>
        <Ionicons name="fitness-outline" size={20} color={primaryColor} />
        <Text style={[styles.exerciseName, { color: primaryColor }]}>
          {exerciseName}
        </Text>
      </View>
      
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <Animated.View
            style={[
              styles.progressBarFill,
              { backgroundColor: primaryColor },
              progressBarStyle,
            ]}
          />
        </View>
        <View style={styles.progressTextContainer}>
          <Animated.Text 
            style={[styles.progressText, { color: primaryColor }]}
            animatedProps={animatedProgressProps}
          />
          <Text style={[styles.targetText, { color: currentTheme.colors.textSecondary }]}>
            / {getMetricDisplay()}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  exerciseName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  progressContainer: {
    gap: theme.spacing.xs,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.xs,
  },
  progressText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
  },
  targetText: {
    fontSize: theme.typography.fontSize.sm,
  },
});
