import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';

interface GoalProgressBarProps {
  currentDrops: number;
  sessionBase: number;
  segmentTarget: number;
  progressWidth: string;
  isOverachieved: boolean;
  isTrackingOnly: boolean;
  dailyRemaining: number;
  primaryColor: string;
  goalLabel: string;
  remainingTodayLabel: string;
  limitReachedLabel: string;
}

export default function GoalProgressBar({
  currentDrops,
  sessionBase,
  segmentTarget,
  progressWidth,
  isOverachieved,
  isTrackingOnly,
  dailyRemaining,
  primaryColor,
  goalLabel,
  remainingTodayLabel,
  limitReachedLabel,
}: GoalProgressBarProps) {
  return (
    <View style={styles.progressBarContainer}>
      <View style={styles.goalRow}>
        <View style={styles.goalLeft}>
          <Ionicons name="water-outline" size={13} color="rgba(255,255,255,0.35)" />
          <Text style={styles.goalLabel}>{goalLabel}</Text>
        </View>
        <Text style={[styles.goalProgress, getNumberStyle(13)]}>
          <Text style={[styles.goalProgressCurrent, isOverachieved && { color: theme.colors.secondary }]}>
            {Math.round(currentDrops)}
          </Text>
          <Text style={styles.goalProgressSep}> / </Text>
          <Text style={styles.goalProgressTarget}>{Math.round(sessionBase) + segmentTarget}</Text>
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: progressWidth as any,
              backgroundColor: isOverachieved ? theme.colors.secondary : primaryColor,
            },
          ]}
        />
      </View>

      <View style={styles.infoRow}>
        {!isTrackingOnly && dailyRemaining > 0 ? (
          <View style={styles.remainingPill}>
            <Ionicons name="water" size={11} color={primaryColor} />
            <Text style={[styles.remainingPillText, { color: primaryColor }]}>
              {dailyRemaining}
            </Text>
            <Text style={styles.remainingPillSuffix}>{remainingTodayLabel}</Text>
          </View>
        ) : isTrackingOnly ? (
          <View style={styles.remainingPill}>
            <Ionicons name="checkmark-circle" size={11} color="#4CD964" />
            <Text style={[styles.remainingPillText, { color: 'rgba(255,255,255,0.30)' }]}>{limitReachedLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressBarContainer: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: theme.borderRadius.sm,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  goalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  goalLabel: {
    ...fontStyles.body,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
  },
  goalProgress: {
    ...fontStyles.number,
  },
  goalProgressCurrent: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.90)',
  },
  goalProgressSep: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
  goalProgressTarget: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
  },
  infoRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  remainingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  remainingPillText: {
    ...fontStyles.number,
    fontSize: 12,
  },
  remainingPillSuffix: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.30)',
    marginLeft: 2,
  },
});
