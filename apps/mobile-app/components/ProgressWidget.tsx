import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  interpolate,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAllBadges } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useUserBadges } from '@/hooks/useUserBadges';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme } from '@/lib/theme';

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
  const router = useRouter();
  const { theme: currentTheme } = useTheme();
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
        badge_type: 'global' as const,
        progress: userProgress.find((p) => p.global_achievement_id === a.id),
        is_earned: earnedBadges.some((b) => b.badge_type === 'global' && b.badge_name === a.name),
      })),
      ...gymChallenges.map((c) => ({
        id: c.id,
        name: c.name,
        badge_type: 'gym' as const,
        progress: userProgress.find((p) => p.gym_challenge_id === c.id),
        is_earned: earnedBadges.some((b) => b.badge_type === 'gym' && b.badge_name === c.name),
      })),
    ];

    // Filter out earned badges and find the one with highest progress
    const unearnedBadges = allBadges
      .filter((b) => !b.is_earned)
      .map((b) => {
        const progressPercent = b.progress
          ? b.progress.is_completed
            ? 100
            : 50 // Simplified - would need criteria evaluation
          : 0;
        return { ...b, progressPercent };
      })
      .sort((a, b) => b.progressPercent - a.progressPercent);

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
      <TouchableOpacity
        style={[
          styles.container,
          {
            borderColor: hexToRgba(branding.primary, 0.3),
          },
        ]}
        onPress={() => router.push('/trophy-room')}
        activeOpacity={0.8}
      >
        <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Ionicons name="trophy" size={20} color={branding.primary} />
              <Text style={[styles.title, { color: branding.primary }]}>
                Next Badge
              </Text>
            </View>

            <Text style={styles.badgeName} numberOfLines={1}>
              {nextBadge.name}
            </Text>

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

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: branding.primary }]}>View Trophy Room</Text>
              <Ionicons name="arrow-forward" size={16} color={branding.primary} />
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    // Width is set dynamically via inline style
  },
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    height: 160, // Same height as feature cards
  },
  cardBlur: {
    borderRadius: 20,
    padding: theme.spacing.md,
    flex: 1,
    justifyContent: 'space-between',
    height: '100%',
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    overflow: 'hidden',
  },
  content: {
    gap: theme.spacing.sm,
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  badgeName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
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
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  footerText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
});
