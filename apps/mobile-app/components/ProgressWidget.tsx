import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAllBadges } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useUserBadges } from '@/hooks/useUserBadges';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16; // Horizontal padding of ScrollView
const BOTTOM_CARDS_GAP = 16;
const BOTTOM_CARD_WIDTH = (SCREEN_WIDTH - (CARD_PADDING * 2) - BOTTOM_CARDS_GAP) / 2;
const SMARTCOACH_CARD_WIDTH = (BOTTOM_CARD_WIDTH * 2) + BOTTOM_CARDS_GAP;
const CHALLENGE_CARD_WIDTH = SMARTCOACH_CARD_WIDTH;

// Helper function to add alpha to hex color
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const ProgressWidget: React.FC = () => {
  const { t } = useTranslation('home');
  const branding = useBranding();
  const { globalAchievements, gymChallenges } = useAllBadges();
  const { badges: earnedBadges } = useUserBadges();
  const { progress: userProgress } = useUserProgress();

  // Find the next closest badge (not earned, with highest progress)
  const nextBadge = useMemo(() => {
    const allBadges = [
      ...globalAchievements.map((a) => ({
        id: a.id,
        name: a.name,
        badge_image_url: a.badge_image_url as string | null,
        badge_type: 'global' as const,
        display_order: a.display_order,
        progress: userProgress.find((p) => p.global_achievement_id === a.id),
        is_earned: earnedBadges.some((b) => b.badge_type === 'global' && b.badge_name === a.name),
      })),
      ...gymChallenges.map((c) => ({
        id: c.id,
        name: c.name,
        badge_image_url: c.badge_image_url,
        badge_type: 'gym' as const,
        display_order: 999,
        progress: userProgress.find((p) => p.gym_challenge_id === c.id),
        is_earned: earnedBadges.some((b) => b.badge_type === 'gym' && b.badge_name === c.name),
      })),
    ];

    const unearnedBadges = allBadges
      .filter((b) => !b.is_earned)
      .map((b) => {
        const progressPercent = b.progress?.progress_percent ?? 0;
        const isCompleted = b.progress?.is_completed ?? false;
        return { ...b, progressPercent, isCompleted };
      })
      .filter((b) => !b.isCompleted && b.progressPercent < 100)
      .sort((a, b) => {
        const progressDiff = b.progressPercent - a.progressPercent;
        if (progressDiff !== 0) return progressDiff;
        return a.display_order - b.display_order;
      });

    return unearnedBadges[0] || null;
  }, [globalAchievements, gymChallenges, userProgress, earnedBadges]);

  const progressPercent = nextBadge?.progressPercent || 0;

  // Always call hooks in the same order (no early return before hooks)
  const progressStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(`${progressPercent}%`, {
        duration: 500,
        easing: Easing.out(Easing.ease),
      }),
    };
  });

  // Early return after all hooks are called
  if (!nextBadge) {
    return null; // All badges earned or no badges available
  }

  return (
    <View style={[styles.wrapper, { width: CHALLENGE_CARD_WIDTH }]}>
      <View
        style={[
          styles.container,
          {
            borderColor: hexToRgba(branding.primary, 0.3),
          },
        ]}
      >
        <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
          <View style={styles.content}>
            <View style={styles.header}>
              {nextBadge.badge_image_url ? (
                <Image source={{ uri: nextBadge.badge_image_url }} style={styles.badgeIcon} />
              ) : (
                <View style={[styles.badgeIconPlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="ribbon" size={18} color={branding.primary} />
                </View>
              )}
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: branding.primary }]}>
                  {t('nextBadge')}
                </Text>
                <Text style={styles.badgeName} numberOfLines={1}>
                  {nextBadge.name}
                </Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: hexToRgba(branding.primary, 0.2) }]}>
                <Animated.View style={progressStyle}>
                  <LinearGradient
                    colors={[branding.primary, branding.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.progressFill}
                  />
                </Animated.View>
              </View>
              <Text style={styles.progressText}>{Math.round(progressPercent)}%</Text>
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {},
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardBlur: {
    borderRadius: 20,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    overflow: 'hidden',
  },
  content: {
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  badgeIconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  badgeName: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  progressContainer: {
    gap: theme.spacing.xs,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    ...fontStyles.bodyMedium,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
});
