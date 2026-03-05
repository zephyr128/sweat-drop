import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { ChallengeProgress } from '@/hooks/useChallengeProgress';
import { fontStyles } from '@/lib/theme';

interface ActiveChallengesOverlayProps {
  challenges: ChallengeProgress[];
  gymId: string;
  onClose: () => void;
}

export const ActiveChallengesOverlay: React.FC<ActiveChallengesOverlayProps> = ({
  challenges,
  gymId,
  onClose,
}) => {
  const { theme } = useTheme();
  const branding = useBranding();

  // Filter out completed challenges
  const activeChallenges = challenges.filter((c) => !c.is_completed);

  if (activeChallenges.length === 0) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.95)', 'rgba(10, 14, 26, 0.98)', 'rgba(0, 0, 0, 0.95)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trophy" size={24} color={branding.primary} />
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Active Challenges</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: branding.primaryLight }]}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={20} color={branding.primary} />
        </TouchableOpacity>
      </View>

      {/* Challenges List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeChallenges.map((challenge) => {
          const progressPercent = challenge.progress_percentage || 0;
          const isNearCompletion = progressPercent >= 80;

          // Get challenge type label
          const getChallengeTypeLabel = () => {
            switch (challenge.challenge_type) {
              case 'daily':
                return 'Daily';
              case 'weekly':
                return 'Weekly';
              case 'monthly':
                return 'Monthly';
              case 'streak':
                return 'Streak';
              case 'milestone':
                return 'Milestone';
              default:
                return 'Challenge';
            }
          };

          // Get progress label based on challenge type
          const getProgressLabel = () => {
            if (challenge.challenge_type === 'streak') {
              const remaining = Math.max(0, challenge.target_drops - challenge.current_streak_days);
              return {
                current: challenge.current_streak_days,
                target: challenge.target_drops,
                unit: 'days',
                remaining: remaining > 0 ? `${remaining} days to badge` : null,
              };
            } else {
              const remaining = Math.max(0, challenge.target_drops - challenge.current_drops);
              return {
                current: challenge.current_drops,
                target: challenge.target_drops,
                unit: 'drops',
                remaining: remaining > 0 ? `${remaining} drops to badge` : null,
              };
            }
          };

          const progressLabel = getProgressLabel();

          return (
            <View
              key={challenge.challenge_id}
              style={[
                styles.challengeCard,
                {
                  borderColor: isNearCompletion
                    ? branding.primary
                    : `${branding.primary}40`,
                },
              ]}
            >
              {/* Challenge Header */}
              <View style={styles.challengeHeader}>
                <View style={styles.challengeTitleContainer}>
                  <Text style={[styles.challengeName, { color: theme.colors.text }]} numberOfLines={1}>
                    {challenge.challenge_name}
                  </Text>
                  <View style={[styles.frequencyBadge, { backgroundColor: branding.primaryLight }]}>
                    <Text style={[styles.frequencyText, { color: branding.primary }]}>
                      {getChallengeTypeLabel()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Progress Info */}
              <View style={styles.progressInfo}>
                <Text style={[styles.progressText, { color: theme.colors.textSecondary }]}>
                  {progressLabel.current} / {progressLabel.target} {progressLabel.unit}
                </Text>
                {progressLabel.remaining && (
                  <Text style={[styles.remainingText, { color: branding.primary }]}>
                    {progressLabel.remaining}
                  </Text>
                )}
              </View>

              {/* Progress Bar */}
              <View style={[styles.progressBarContainer, { backgroundColor: branding.primaryLight }]}>
                <LinearGradient
                  colors={[branding.primary, branding.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(progressPercent, 100)}%`,
                    },
                  ]}
                />
              </View>

              {/* Reward Drops */}
              {challenge.reward_drops > 0 && (
                <View style={styles.bountyContainer}>
                  <Ionicons name="water" size={14} color={branding.primary} />
                  <Text style={[styles.bountyText, { color: branding.primary }]}>
                    +{challenge.reward_drops} drops reward
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  challengeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  challengeHeader: {
    marginBottom: 12,
  },
  challengeTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  challengeName: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    flex: 1,
  },
  frequencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  frequencyText: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
  },
  remainingText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  progressBarContainer: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  bountyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bountyText: {
    ...fontStyles.bodyMedium,
    fontSize: 12,
  },
});
