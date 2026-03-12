import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface GymScoreEntry {
  gym_id: string;
  gym_name: string;
  score: number;
  sessions: number;
}

interface ArenaGymBreakdownProps {
  breakdown: GymScoreEntry[];
  totalScore: number;
  scoringModel: string;
  accentColor?: string;   // Custom arena branding color
  delay?: number;         // Animation delay
}

function getScoreLabel(score: number, scoringModel: string, t: (key: string) => string): string {
  switch (scoringModel) {
    case 'total_drops':
      return `${Math.round(score)} 💧`;
    case 'days_visited':
      return `${Math.round(score)} ${t('scoreLabelDays')}`;
    case 'variety_score':
      return `${Math.round(score)} ${t('scoreLabelMachines')}`;
    case 'streak_days':
      return `🔥 ${Math.round(score)} ${t('scoreLabelDays')}`;
    default:
      return `${Math.round(score)} 💧`;
  }
}

/**
 * Per-gym score label: for streak_days the per-gym data stores drops (informational),
 * not streak days, because streak is a global metric.
 */
function getGymScoreLabel(score: number, scoringModel: string, t: (key: string) => string): string {
  if (scoringModel === 'streak_days') {
    return `${Math.round(score)} 💧`;
  }
  return getScoreLabel(score, scoringModel, t);
}

function getTotalLabel(scoringModel: string, t: (key: string) => string): string {
  switch (scoringModel) {
    case 'total_drops':
      return t('breakdownTotalDrops');
    case 'days_visited':
      return t('breakdownTotalDays');
    case 'variety_score':
      return t('breakdownTotalMachines');
    case 'streak_days':
      return t('breakdownTotalStreak');
    default:
      return t('breakdownTotalDrops');
  }
}

/**
 * ArenaGymBreakdown — displays per-gym score breakdown for multi-gym arena participants.
 *
 * Rules:
 * - Only renders if breakdown has > 1 entry (skip for single-gym users)
 * - Sorted by score DESC
 * - Shows percentage of total for each gym
 * - Glassmorphism card with FadeInDown animation
 */
export default function ArenaGymBreakdown({
  breakdown,
  totalScore,
  scoringModel,
  accentColor,
  delay = 250,
}: ArenaGymBreakdownProps) {
  const branding = useBranding();
  const { t } = useTranslation('arena');
  const primary = accentColor || branding.primary;

  // Don't render if only 1 gym or no breakdown
  if (!breakdown || breakdown.length <= 1) {
    return null;
  }

  // Sort by score DESC
  const sorted = [...breakdown].sort((a, b) => b.score - a.score);

  // For streak_days, the per-gym breakdown stores DROPS (informational).
  // Percentages should be based on the sum of per-gym values, not totalScore (which is streak days).
  const isStreak = scoringModel === 'streak_days';
  const gymScoreSum = sorted.reduce((s, e) => s + e.score, 0);
  const safeDenominator = isStreak
    ? (gymScoreSum > 0 ? gymScoreSum : 1)
    : (totalScore > 0 ? totalScore : 1);

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)}>
      <Text style={styles.sectionTitle}>{t('breakdownTitle')}</Text>
      <View style={[styles.card, { borderColor: hexToRgba(primary, 0.15) }]}>
        <BlurView intensity={50} tint="dark" style={[styles.blur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
          {/* Total score header */}
          <View style={styles.totalRow}>
            <View style={styles.totalLabelRow}>
              <Ionicons name="stats-chart" size={18} color={primary} />
              <Text style={[styles.totalLabel, { color: primary }]}>
                {getTotalLabel(scoringModel, t)}
              </Text>
            </View>
            <Text style={[styles.totalValue, getNumberStyle(20), { color: primary }]}>
              {getScoreLabel(totalScore, scoringModel, t)}
            </Text>
          </View>

          {/* Streak sub-header: clarify per-gym shows drops, not streak */}
          {isStreak && gymScoreSum > 0 && (
            <View style={styles.streakSubHeader}>
              <Ionicons name="water" size={13} color={theme.colors.textTertiary} />
              <Text style={styles.streakSubHeaderText}>
                {t('breakdownDropsPerGym')}
              </Text>
            </View>
          )}

          {/* Per-gym rows */}
          {sorted.map((entry, index) => {
            const pct = Math.round((entry.score / safeDenominator) * 100);
            const isLast = index === sorted.length - 1;

            return (
              <View
                key={entry.gym_id}
                style={[
                  styles.gymRow,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255, 255, 255, 0.06)' },
                ]}
              >
                <View style={styles.gymInfo}>
                  <Ionicons name="fitness-outline" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.gymName} numberOfLines={1}>{entry.gym_name}</Text>
                </View>
                <View style={styles.gymScoreCol}>
                  <Text style={[styles.gymScore, getNumberStyle(14)]}>
                    {getGymScoreLabel(entry.score, scoringModel, t)}
                  </Text>
                  <Text style={[styles.gymPct, getNumberStyle(11), { color: hexToRgba(primary, 0.7) }]}>
                    ({pct}%)
                  </Text>
                </View>
                {/* Mini progress bar */}
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(pct, 4)}%`,
                        backgroundColor: hexToRgba(primary, 0.4),
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}

          {/* Sessions info */}
          <View style={styles.sessionsRow}>
            <Ionicons name="barbell-outline" size={13} color={theme.colors.textTertiary} />
            <Text style={styles.sessionsText}>
              {t('breakdownSessions', { count: sorted.reduce((s, e) => s + e.sessions, 0) })}
            </Text>
          </View>
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    letterSpacing: 0.3,
    marginBottom: 12,
    marginTop: 20,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  blur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },
  /* Total score header */
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  totalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalLabel: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  totalValue: {
    letterSpacing: 0.5,
  },
  /* Per-gym rows */
  gymRow: {
    paddingVertical: 12,
  },
  gymInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  gymName: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
    flex: 1,
    letterSpacing: 0.2,
  },
  gymScoreCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  gymScore: {
    color: theme.colors.textSecondary,
  },
  gymPct: {
    // color set dynamically
  },
  /* Mini progress bar */
  barContainer: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  /* Sessions info */
  sessionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  sessionsText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  streakSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 10,
    paddingBottom: 4,
  },
  streakSubHeaderText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
});
