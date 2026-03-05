import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/hooks/useSession';
import { useUserBadges, UserBadge } from '@/hooks/useUserBadges';
import { useAllBadges, BadgeWithProgress } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles } from '@/lib/theme';
import BackButton from './BackButton';
import { BadgeCard } from './BadgeCard';
import { BadgeDetailModal } from './BadgeDetailModal';
import Animated, { FadeInDown } from 'react-native-reanimated';

// AGENT NOTE: [2026-03-03] - mobile-coder
// Redesigned TrophyRoom to Apple Fitness Awards style:
// - Clean 3-column grid layout
// - Earned badges at the top, locked badges below
// - Minimal chrome, focus on the badges themselves
// - Category color-coding like Apple Fitness rings

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TrophyRoomProps {
  userId?: string;
  onClose?: () => void;
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ userId, onClose }) => {
  const { t } = useTranslation('trophyRoom');
  const { theme: currentTheme } = useTheme();
  const branding = useBranding();
  const { badges: earnedBadges, loading: badgesLoading } = useUserBadges(userId);
  const { globalAchievements, gymChallenges, loading: allBadgesLoading } = useAllBadges();
  const { progress: userProgress, isCompleted } = useUserProgress(userId);
  const [filterType, setFilterType] = useState<'all' | 'this_gym' | 'earned' | 'locked'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loading = badgesLoading || allBadgesLoading;

  const allBadgesWithProgress = useMemo((): BadgeWithProgress[] => {
    const badges: BadgeWithProgress[] = [];

    globalAchievements.forEach((achievement) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'global' && b.badge_name === achievement.name
      );
      const prog = userProgress.find((p) => p.global_achievement_id === achievement.id);
      // Earned if badge row exists OR progress says criteria is met
      const earned = !!earnedBadge || prog?.is_completed === true;

      badges.push({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        badge_image_url: achievement.badge_image_url,
        badge_type: 'global',
        gym_name: null,
        is_earned: earned,
        earned_at: earnedBadge?.earned_at || null,
        progress: earned ? 100 : (prog?.progress_percent ?? 0),
        progress_data: prog?.progress_data,
      });
    });

    gymChallenges.forEach((challenge) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'gym' && b.badge_name === challenge.name
      );
      const prog = userProgress.find((p) => p.gym_challenge_id === challenge.id);
      // Earned if badge row exists OR progress says criteria is met
      const earned = !!earnedBadge || prog?.is_completed === true;

      badges.push({
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        badge_image_url: challenge.badge_image_url,
        badge_type: 'gym',
        gym_name: challenge.gym_name,
        is_earned: earned,
        earned_at: earnedBadge?.earned_at || null,
        progress: earned ? 100 : (prog?.progress_percent ?? 0),
        progress_data: prog?.progress_data,
      });
    });

    // Merge orphan earned gym badges not covered by gymChallenges
    // (e.g. from deleted challenges or gyms we no longer have membership for)
    const coveredGymBadgeNames = new Set(gymChallenges.map((c) => c.name));
    earnedBadges
      .filter((b) => b.badge_type === 'gym' && !coveredGymBadgeNames.has(b.badge_name))
      .forEach((b) => {
        badges.push({
          id: b.badge_id,
          name: b.badge_name,
          description: b.badge_description,
          badge_image_url: b.badge_image_url,
          badge_type: 'gym',
          gym_name: b.gym_name,
          is_earned: true,
          earned_at: b.earned_at,
          progress: 100,
        });
      });

    return badges;
  }, [globalAchievements, gymChallenges, earnedBadges, userProgress]);

  const filteredBadges = useMemo(() => {
    let filtered = allBadgesWithProgress;

    if (filterType === 'this_gym') {
      filtered = filtered.filter((badge) => badge.badge_type === 'gym');
    } else if (filterType === 'earned') {
      filtered = filtered.filter((badge) => badge.is_earned);
    } else if (filterType === 'locked') {
      filtered = filtered.filter((badge) => !badge.is_earned);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((badge) =>
        badge.name.toLowerCase().includes(query) ||
        (badge.description && badge.description.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allBadgesWithProgress, filterType, searchQuery]);

  // Separate earned and locked for display
  const earnedFiltered = filteredBadges.filter((b) => b.is_earned);
  const lockedFiltered = filteredBadges.filter((b) => !b.is_earned);

  // Stats
  const totalEarned = earnedBadges.length;
  const totalAvailable = allBadgesWithProgress.length;

  const handleBadgePress = (badge: BadgeWithProgress) => {
    if (!badge.is_earned) return;

    const earnedBadge = earnedBadges.find(
      (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type
    );

    if (earnedBadge) {
      setSelectedBadge(earnedBadge);
      setModalVisible(true);
    }
  };

  const renderBadgeItem = (badge: BadgeWithProgress) => {
    const earnedBadge = earnedBadges.find(
      (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type
    );
    return (
      <BadgeCard
        key={`${badge.badge_type}-${badge.id}`}
        badge={earnedBadge || {
          badge_id: badge.id,
          badge_name: badge.name,
          badge_description: badge.description,
          badge_image_url: badge.badge_image_url,
          earned_at: badge.earned_at || '',
          badge_type: badge.badge_type,
          gym_name: badge.gym_name,
        }}
        isLocked={!badge.is_earned}
        progress={badge.progress}
        onPress={() => handleBadgePress(badge)}
        size="medium"
      />
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <BackButton />
        )}
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Summary pill */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={styles.summaryBar}>
          <View style={[styles.summaryPill, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <Ionicons name="trophy" size={15} color={branding.primary} />
            <Text style={[styles.summaryText, { color: branding.primary }]}>
              {totalEarned}
            </Text>
            <Text style={styles.summaryLabel}>
              {t('ofEarned', { total: totalAvailable })}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Filter tabs */}
      <Animated.View entering={FadeInDown.delay(150).duration(400)}>
        <View style={styles.filterRow}>
          {(['all', 'this_gym', 'earned', 'locked'] as const).map((type) => {
            const isActive = filterType === type;
            const labelMap = { all: t('filterAll'), this_gym: t('filterThisGym'), earned: t('filterEarned'), locked: t('filterLocked') };
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterTab,
                  isActive && { backgroundColor: branding.primary },
                ]}
                onPress={() => setFilterType(type)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isActive && { color: branding.onPrimary, ...fontStyles.bodySemiBold },
                  ]}
                >
                  {labelMap[type]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* Search */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <View style={styles.searchWrapper}>
          <View style={[styles.searchBox, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.3)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredBadges.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={56} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>{t('noBadgesFound')}</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? t('tryAdjustingSearch') : t('completeWorkouts')}
            </Text>
          </View>
        ) : (
          <>
            {/* Earned section */}
            {earnedFiltered.length > 0 && (
              <Animated.View entering={FadeInDown.delay(250).duration(400)}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('sectionEarned')}</Text>
                    <View style={[styles.sectionCountPill, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                      <Text style={[styles.sectionCountText, { color: branding.primary }]}>
                        {earnedFiltered.length}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.badgeGrid}>
                    {earnedFiltered.map(renderBadgeItem)}
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Locked section */}
            {lockedFiltered.length > 0 && (
              <Animated.View entering={FadeInDown.delay(350).duration(400)}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('sectionInProgress')}</Text>
                    <View style={styles.sectionCountPill}>
                      <Text style={styles.sectionCountText}>
                        {lockedFiltered.length}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.badgeGrid}>
                    {lockedFiltered.map(renderBadgeItem)}
                  </View>
                </View>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {/* Badge Detail Modal */}
      <BadgeDetailModal
        visible={modalVisible}
        badge={selectedBadge}
        onClose={() => {
          setModalVisible(false);
          setSelectedBadge(null);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    ...fontStyles.heading,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    letterSpacing: 0.3,
    pointerEvents: 'none',
  },
  headerSpacer: {
    width: 40,
  },
  /* Summary pill */
  summaryBar: {
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  summaryText: {
    fontSize: 14,
    ...fontStyles.heading,
  },
  summaryLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
    ...fontStyles.bodyMedium,
  },
  /* Filter row */
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  filterTabText: {
    fontSize: 13,
    ...fontStyles.bodyMedium,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.2,
  },
  /* Search */
  searchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    padding: 0,
  },
  /* Scroll content */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 64,
  },
  /* Sections */
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    ...fontStyles.bodySemiBold,
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.2,
  },
  sectionCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionCountText: {
    fontSize: 12,
    ...fontStyles.bodySemiBold,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  /* Badge grid — 3 columns */
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  /* Empty state */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    ...fontStyles.heading,
    color: theme.colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
});
