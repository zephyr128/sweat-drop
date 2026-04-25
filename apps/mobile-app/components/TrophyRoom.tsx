import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useUserBadges, UserBadge } from '@/hooks/useUserBadges';
import { useAllBadges, BadgeWithProgress, AchievementCategory } from '@/hooks/useAllBadges';
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

const CATEGORY_ORDER: AchievementCategory[] = [
  'sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special',
];

// Below this badge count we drop per-category sub-headers and render the
// section as a single flat grid ("Trophy Showcase" mode). Sub-section
// headers feel like wasted whitespace when each category has only 1-2
// badges; once the section grows past this threshold, categorising starts
// helping the user navigate and we switch back to the grouped layout.
const COMPACT_THRESHOLD = 12;

const TIER_RANK: Record<string, number> = {
  bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4,
};

const CATEGORY_ICONS: Record<AchievementCategory, React.ComponentProps<typeof Ionicons>['name']> = {
  sessions: 'barbell-outline',
  total_drops: 'water-outline',
  streak: 'flame-outline',
  multi_gym: 'map-outline',
  distance: 'bicycle-outline',
  special: 'star-outline',
};

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
        category: achievement.category,
        tier: achievement.tier,
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
        tier={badge.tier}
      />
    );
  };

  const CATEGORY_LABELS: Record<AchievementCategory, string> = {
    sessions: t('categorySessions'),
    total_drops: t('categoryTotalDrops'),
    streak: t('categoryStreak'),
    multi_gym: t('categoryMultiGym'),
    distance: t('categoryDistance'),
    special: t('categorySpecial'),
  };

  const renderBadgesByCategory = (
    badges: BadgeWithProgress[],
    sectionTitle: string,
    dotColor: string,
    options?: { compact?: boolean },
  ) => {
    const globalCategorized = badges.filter((b) => b.badge_type === 'global' && b.category);
    const gymBadges = badges.filter((b) => b.badge_type === 'gym');
    const other = badges.filter((b) => b.badge_type !== 'gym' && (b.badge_type !== 'global' || !b.category));

    const buckets: Partial<Record<AchievementCategory, BadgeWithProgress[]>> = {};
    globalCategorized.forEach((b) => {
      const cat = b.category!;
      if (!buckets[cat]) buckets[cat] = [];
      buckets[cat]!.push(b);
    });
    for (const cat of Object.keys(buckets) as AchievementCategory[]) {
      buckets[cat]!.sort(
        (a, b) => (TIER_RANK[a.tier ?? ''] ?? 99) - (TIER_RANK[b.tier ?? ''] ?? 99),
      );
    }

    const hasGlobalSections = CATEGORY_ORDER.some((cat) => buckets[cat]?.length);
    const hasAnything = hasGlobalSections || gymBadges.length > 0 || other.length > 0;
    if (!hasAnything) return null;

    const isAccent = dotColor !== 'rgba(255,255,255,0.2)';
    const compact = options?.compact ?? false;

    const header = (
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: dotColor }]} />
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <View style={[
          styles.sectionCountPill,
          isAccent && { backgroundColor: hexToRgba(dotColor, 0.14), borderColor: hexToRgba(dotColor, 0.2) },
        ]}>
          <Text style={[styles.sectionCountText, isAccent && { color: dotColor }]}>
            {badges.length}
          </Text>
        </View>
      </View>
    );

    // "Trophy Showcase" mode — when the section is sparse, drop the
    // per-category sub-headers and render everything as one flat grid.
    // We preserve the same logical order (global → gym → other; categories
    // in CATEGORY_ORDER, sorted by tier within) so that crossing the
    // COMPACT_THRESHOLD doesn't reshuffle the visual.
    if (compact) {
      const flat: BadgeWithProgress[] = [];
      CATEGORY_ORDER.forEach((cat) => {
        if (buckets[cat]?.length) flat.push(...buckets[cat]!);
      });
      flat.push(...gymBadges);
      flat.push(...other);

      return (
        <View style={styles.section}>
          {header}
          <View style={styles.badgeGrid}>{flat.map(renderBadgeItem)}</View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        {header}

        {CATEGORY_ORDER.map((cat) => {
          const group = buckets[cat];
          if (!group || group.length === 0) return null;
          return (
            <View key={cat} style={styles.categorySubSection}>
              <View style={styles.categorySubHeader}>
                <Ionicons name={CATEGORY_ICONS[cat]} size={13} color={hexToRgba(branding.primary, 0.7)} />
                <Text style={styles.categorySubTitle}>{CATEGORY_LABELS[cat]}</Text>
              </View>
              <View style={styles.badgeGrid}>
                {group.map(renderBadgeItem)}
              </View>
            </View>
          );
        })}

        {gymBadges.length > 0 && (
          <View style={styles.categorySubSection}>
            <View style={styles.categorySubHeader}>
              <Ionicons name="fitness-outline" size={13} color={hexToRgba(branding.primary, 0.7)} />
              <Text style={styles.categorySubTitle}>{t('categoryGym')}</Text>
            </View>
            <View style={styles.badgeGrid}>
              {gymBadges.map(renderBadgeItem)}
            </View>
          </View>
        )}

        {other.length > 0 && (
          <View style={(hasGlobalSections || gymBadges.length > 0) ? styles.categorySubSection : undefined}>
            <View style={styles.badgeGrid}>
              {other.map(renderBadgeItem)}
            </View>
          </View>
        )}
      </View>
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
        <View pointerEvents="none" style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('title')}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </Animated.View>

      {/* Hero Stats Banner */}
      <Animated.View entering={FadeInDown.delay(80).duration(400)}>
        <View style={styles.heroBanner}>
          <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[hexToRgba(branding.primary, 0.18), 'rgba(255,255,255,0.04)']}
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
          <View style={[styles.searchBox, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <Ionicons name="search" size={15} color="rgba(255,255,255,0.45)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.35)"
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
                    {earnedPage.length > 0 && renderBadgesByCategory(
                      earnedPage,
                      t('sectionEarned'),
                      branding.primary,
                      { compact: earnedPage.length < COMPACT_THRESHOLD },
                    )}
                    {lockedPage.length > 0 && renderBadgesByCategory(
                      lockedPage,
                      t('sectionInProgress'),
                      'rgba(255,255,255,0.2)',
                      { compact: lockedPage.length < COMPACT_THRESHOLD },
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
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    ...fontStyles.heading,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 1,
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
    borderColor: 'rgba(255,255,255,0.15)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    color: 'rgba(255,255,255,0.5)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
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
  },
  tabBar: {
    marginBottom: 10,
    marginHorizontal: 16,
  },

  /* ── Scroll ── */
  scrollContent: {
    paddingHorizontal: 16,
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

  /* ── Category sub-sections (In Progress → All tab) ── */
  categorySubSection: {
    marginTop: 16,
  },
  categorySubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingLeft: 2,
  },
  categorySubTitle: {
    fontSize: 11,
    ...fontStyles.heading,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 1.5,
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
