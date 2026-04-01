import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useUserBadges, UserBadge } from '@/hooks/useUserBadges';
import { useAllBadges, BadgeWithProgress } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import BackButton from './BackButton';
import { SliderTabs } from './SliderTabs';
import { BadgeCard } from './BadgeCard';
import { BadgeDetailModal } from './BadgeDetailModal';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TrophyRoomProps {
  userId?: string;
  onClose?: () => void;
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ userId, onClose }) => {
  const { t } = useTranslation('trophyRoom');
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { badges: earnedBadges, loading: badgesLoading } = useUserBadges(userId);
  const { globalAchievements, gymChallenges, loading: allBadgesLoading } = useAllBadges();
  const { progress: userProgress } = useUserProgress(userId);
  const [filterType, setFilterType] = useState<'all' | 'this_gym' | 'earned' | 'locked'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [selectedBadgeLocked, setSelectedBadgeLocked] = useState(false);
  const [selectedBadgeProgress, setSelectedBadgeProgress] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);

  const loading = badgesLoading || allBadgesLoading;

  const allBadgesWithProgress = useMemo((): BadgeWithProgress[] => {
    const badges: BadgeWithProgress[] = [];

    globalAchievements.forEach((achievement) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'global' && b.badge_name === achievement.name
      );
      const prog = userProgress.find((p) => p.global_achievement_id === achievement.id);
      const earned = !!earnedBadge || prog?.is_completed === true;

      badges.push({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        badge_image_url: achievement.badge_image_url,
        badge_type: 'global',
        gym_name: null,
        gym_id: null,
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
      const earned = !!earnedBadge || prog?.is_completed === true;

      badges.push({
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        badge_image_url: challenge.badge_image_url,
        badge_type: 'gym',
        gym_name: challenge.gym_name,
        gym_id: challenge.gym_id,
        is_earned: earned,
        earned_at: earnedBadge?.earned_at || null,
        progress: earned ? 100 : (prog?.progress_percent ?? 0),
        progress_data: prog?.progress_data,
      });
    });

    const coveredGymBadgeNames = new Set(gymChallenges.map((c) => c.name));
    earnedBadges
      .filter((b) => b.badge_type === 'gym' && !coveredGymBadgeNames.has(b.badge_name))
      .filter((b) => !activeGymId || b.gym_id === activeGymId)
      .forEach((b) => {
        badges.push({
          id: b.badge_id,
          name: b.badge_name,
          description: b.badge_description,
          badge_image_url: b.badge_image_url,
          badge_type: 'gym',
          gym_name: b.gym_name,
          gym_id: b.gym_id,
          is_earned: true,
          earned_at: b.earned_at,
          progress: 100,
        });
      });

    return badges;
  }, [globalAchievements, gymChallenges, earnedBadges, userProgress, activeGymId]);

  const filteredBadges = useMemo(() => {
    let filtered = allBadgesWithProgress;

    if (filterType === 'this_gym') {
      filtered = filtered.filter((badge) =>
        badge.badge_type === 'gym' &&
        (!activeGymId || badge.gym_id === activeGymId)
      );
    } else if (filterType === 'all') {
      filtered = filtered.filter((badge) =>
        badge.badge_type === 'global' ||
        (badge.badge_type === 'gym' && (!activeGymId || badge.gym_id === activeGymId))
      );
    } else if (filterType === 'earned') {
      filtered = filtered.filter((badge) =>
        badge.is_earned &&
        (badge.badge_type === 'global' ||
          (badge.badge_type === 'gym' && (!activeGymId || badge.gym_id === activeGymId)))
      );
    } else if (filterType === 'locked') {
      filtered = filtered.filter((badge) =>
        !badge.is_earned &&
        (badge.badge_type === 'global' ||
          (badge.badge_type === 'gym' && (!activeGymId || badge.gym_id === activeGymId)))
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((badge) =>
        badge.name.toLowerCase().includes(query) ||
        (badge.description && badge.description.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allBadgesWithProgress, filterType, searchQuery, activeGymId]);

  const earnedFiltered = filteredBadges.filter((b) => b.is_earned);
  const lockedFiltered = filteredBadges.filter((b) => !b.is_earned);

  const totalEarned = allBadgesWithProgress.filter((b) => b.is_earned).length;
  const totalAvailable = allBadgesWithProgress.length;
  const completionPct = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

  const handleBadgePress = (badge: BadgeWithProgress) => {
    const earnedBadge = earnedBadges.find(
      (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type
    );

    const badgeForModal: UserBadge = earnedBadge || {
      badge_id: badge.id,
      badge_name: badge.name,
      badge_description: badge.description,
      badge_image_url: badge.badge_image_url,
      earned_at: badge.earned_at || '',
      badge_type: badge.badge_type,
      gym_name: badge.gym_name,
      gym_id: badge.gym_id || null,
    };

    setSelectedBadge(badgeForModal);
    setSelectedBadgeLocked(!badge.is_earned);
    setSelectedBadgeProgress(badge.progress);
    setModalVisible(true);
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
          gym_id: badge.gym_id || null,
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

  const FILTERS: { key: 'all' | 'this_gym' | 'earned' | 'locked'; labelKey: string }[] = [
    { key: 'all',      labelKey: 'filterAll' },
    { key: 'this_gym', labelKey: 'filterThisGym' },
    { key: 'earned',   labelKey: 'filterEarned' },
    { key: 'locked',   labelKey: 'filterLocked' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <Animated.View entering={FadeIn.delay(0).duration(350)} style={styles.header}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <BackButton />
        )}
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </Animated.View>

      {/* Hero Stats Banner */}
      <Animated.View entering={FadeInDown.delay(80).duration(400)}>
        <View style={styles.heroBanner}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[hexToRgba(branding.primary, 0.10), 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroLeft}>
            <View style={[styles.heroTrophyBox, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
              <Ionicons name="trophy" size={26} color={branding.primary} />
            </View>
            <View>
              <Text style={[styles.heroCount, { color: branding.primary }]}>
                {totalEarned}
                <Text style={styles.heroCountOf}> / {totalAvailable}</Text>
              </Text>
              <Text style={styles.heroLabel}>{t('badgesEarned')}</Text>
            </View>
          </View>
          <View style={styles.heroRight}>
            <Text style={[styles.heroPct, { color: branding.primary }]}>{completionPct}%</Text>
            <Text style={styles.heroLabel}>{t('completion')}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Search */}
      <Animated.View entering={FadeInDown.delay(160).duration(400)}>
        <View style={styles.searchWrapper}>
          <View style={[styles.searchBox, { borderColor: hexToRgba(branding.primary, 0.1) }]}>
            <Ionicons name="search" size={15} color="rgba(255,255,255,0.25)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Filter tabs + swipeable pages */}
      <Animated.View entering={FadeInDown.delay(220).duration(400)} style={styles.tabsWrapper}>
        <SliderTabs
          tabs={FILTERS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
          activeKey={filterType}
          onChange={(key) => setFilterType(key as typeof filterType)}
          accentColor={branding.primary}
          barStyle={styles.tabBar}
        >
          {FILTERS.map(({ key }) => {
            // Each page recomputes filtered badges for its own filter key
            const pageBadges = (() => {
              let filtered = allBadgesWithProgress;
              if (key === 'this_gym') {
                filtered = filtered.filter((b) => b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId));
              } else if (key === 'all') {
                filtered = filtered.filter((b) => b.badge_type === 'global' || (b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId)));
              } else if (key === 'earned') {
                filtered = filtered.filter((b) => b.is_earned && (b.badge_type === 'global' || (b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId))));
              } else if (key === 'locked') {
                filtered = filtered.filter((b) => !b.is_earned && (b.badge_type === 'global' || (b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId))));
              }
              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                filtered = filtered.filter((b) => b.name.toLowerCase().includes(q) || (b.description && b.description.toLowerCase().includes(q)));
              }
              return filtered;
            })();
            const earnedPage = pageBadges.filter((b) => b.is_earned);
            const lockedPage = pageBadges.filter((b) => !b.is_earned);
            return (
              <ScrollView
                key={key}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {pageBadges.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconBox}>
                      <Ionicons name="trophy-outline" size={40} color="rgba(255,255,255,0.15)" />
                    </View>
                    <Text style={styles.emptyTitle}>{t('noBadgesFound')}</Text>
                    <Text style={styles.emptyText}>
                      {searchQuery ? t('tryAdjustingSearch') : t('completeWorkouts')}
                    </Text>
                  </View>
                ) : (
                  <>
                    {earnedPage.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                          <View style={[styles.sectionDot, { backgroundColor: branding.primary }]} />
                          <Text style={styles.sectionTitle}>{t('sectionEarned')}</Text>
                          <View style={[styles.sectionCountPill, { backgroundColor: hexToRgba(branding.primary, 0.14), borderColor: hexToRgba(branding.primary, 0.2) }]}>
                            <Text style={[styles.sectionCountText, { color: branding.primary }]}>{earnedPage.length}</Text>
                          </View>
                        </View>
                        <View style={styles.badgeGrid}>
                          {earnedPage.map(renderBadgeItem)}
                        </View>
                      </View>
                    )}
                    {lockedPage.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                          <View style={[styles.sectionDot, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                          <Text style={styles.sectionTitle}>{t('sectionInProgress')}</Text>
                          <View style={styles.sectionCountPill}>
                            <Text style={styles.sectionCountText}>{lockedPage.length}</Text>
                          </View>
                        </View>
                        <View style={styles.badgeGrid}>
                          {lockedPage.map(renderBadgeItem)}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            );
          })}
        </SliderTabs>
      </Animated.View>

      <BadgeDetailModal
        visible={modalVisible}
        badge={selectedBadge}
        isLocked={selectedBadgeLocked}
        progress={selectedBadgeProgress}
        onClose={() => {
          setModalVisible(false);
          setSelectedBadge(null);
          setSelectedBadgeLocked(false);
          setSelectedBadgeProgress(0);
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

  /* ── Header ── */
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
    letterSpacing: 1,
    pointerEvents: 'none',
  },
  headerSpacer: {
    width: 40,
  },

  /* ── Hero stats banner ── */
  heroBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroTrophyBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCount: {
    ...fontStyles.heading,
    fontSize: 26,
    letterSpacing: 0.5,
  },
  heroCountOf: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
  },
  heroLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  heroRight: {
    alignItems: 'flex-end',
  },
  heroPct: {
    ...fontStyles.heading,
    fontSize: 30,
    letterSpacing: 0.5,
  },


  /* ── Search ── */
  searchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    padding: 0,
    ...fontStyles.body,
  },

  /* ── Tabs + Pages wrapper ── */
  tabsWrapper: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tabBar: {
    marginBottom: 10,
  },

  /* ── Scroll ── */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 64,
  },

  /* ── Sections ── */
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 13,
    ...fontStyles.heading,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 2,
    flex: 1,
  },
  sectionCountPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionCountText: {
    fontSize: 11,
    ...fontStyles.bodySemiBold,
    color: 'rgba(255, 255, 255, 0.35)',
  },

  /* ── Badge grid ── */
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  /* ── Empty state ── */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 14,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    ...fontStyles.heading,
    color: theme.colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    ...fontStyles.body,
    lineHeight: 20,
    paddingHorizontal: 32,
  },
});
