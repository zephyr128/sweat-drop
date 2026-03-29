import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAllBadges } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useUserBadges } from '@/hooks/useUserBadges';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { fontStyles } from '@/lib/theme';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

export const ProgressWidget: React.FC = () => {
  const { t } = useTranslation('home');
  const router = useRouter();
  const branding = useBranding();
  const { globalAchievements, gymChallenges } = useAllBadges();
  const { badges: earnedBadges } = useUserBadges();
  const { progress: userProgress } = useUserProgress();

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
        const diff = b.progressPercent - a.progressPercent;
        return diff !== 0 ? diff : a.display_order - b.display_order;
      });

    return unearnedBadges[0] || null;
  }, [globalAchievements, gymChallenges, userProgress, earnedBadges]);

  const progressPercent = nextBadge?.progressPercent ?? 0;

  // Hook must be called unconditionally
  const progressStyle = useAnimatedStyle(() => ({
    width: withTiming(`${progressPercent}%` as any, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    }),
  }));

  if (!nextBadge) return null;

  const pct = Math.round(progressPercent);

  return (
    <TouchableOpacity
      style={styles.outer}
      onPress={() => router.push('/trophy-room')}
      activeOpacity={0.85}
    >
      <BlurView intensity={50} tint="dark" style={styles.blur}>
        <LinearGradient
          colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {/* Circular badge */}
          <View style={styles.imageWrap}>
            {nextBadge.badge_image_url ? (
              <Image
                source={{ uri: nextBadge.badge_image_url }}
                style={styles.badgeImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.badgePlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.18) }]}>
                <Ionicons name="ribbon" size={28} color={branding.primary} />
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.content}>
            <View style={styles.topRow}>
              <Text style={styles.categoryLabel}>
                {t('nextBadge').toUpperCase()}
              </Text>
              <View style={[styles.pctPill, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                <Text style={[styles.pctText, { color: branding.primary }]}>{pct}%</Text>
              </View>
            </View>

            <Text style={styles.badgeName} numberOfLines={1}>{nextBadge.name}</Text>

            <View style={styles.barTrack}>
              <View style={styles.barBg}>
                <Animated.View style={[styles.barFillWrap, progressStyle]}>
                  <LinearGradient
                    colors={[branding.primary, branding.primaryDark ?? branding.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.barFill}
                  />
                </Animated.View>
              </View>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" style={styles.chevron} />
        </LinearGradient>
      </BlurView>
    </TouchableOpacity>
  );
};

const BADGE_SIZE = 52;

const styles = StyleSheet.create({
  outer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginBottom: 24,
  },
  blur: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },

  imageWrap: {
    flexShrink: 0,
  },
  badgeImage: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
  },
  badgePlaceholder: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.45)',
  },
  pctPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pctText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  badgeName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  barTrack: {
    marginTop: 2,
  },
  barBg: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  barFillWrap: {
    height: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },

  chevron: {
    flexShrink: 0,
  },
});
