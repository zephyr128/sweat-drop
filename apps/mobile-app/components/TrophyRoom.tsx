import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
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
import { BadgeCategoryModal } from './BadgeCategoryModal';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

const CATEGORY_ORDER: AchievementCategory[] = [
  'sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special',
];

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

// Per-category accent colors. Used as a subtle tint on the row icon, the
// "X / Y" pill and the View-All chevron, so each row reads at a glance
// (Workouts = blue, Streak = orange, Drops = green, etc.). These match the
// colour cues we already use elsewhere (drop balance is green, streak is
// orange, etc.) and tier colours still drive the badge cards themselves.
const CATEGORY_ACCENT: Record<string, string> = {
  sessions: '#5AC8FA',
  total_drops: '#30D158',
  streak: '#FF9500',
  multi_gym: '#BF5AF2',
  distance: '#64D2FF',
  special: '#FFD60A',
  gym: '#FF6482',
};

// A "category group" is one row in the trophy room: an icon, a label, an
// accent colour, and the badges (earned + locked, mixed) that belong to it.
// Built once per page from the big BadgeWithProgress[] list so the rows know
// nothing about the global/gym distinction beyond rendering.
type CategoryGroup = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  badges: BadgeWithProgress[];
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

  // Selected badge — drives BadgeDetailModal
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [selectedBadgeLocked, setSelectedBadgeLocked] = useState(false);
  const [selectedBadgeProgress, setSelectedBadgeProgress] = useState(0);
  const [selectedBadgeTier, setSelectedBadgeTier] = useState<BadgeWithProgress['tier']>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Category modal — drives BadgeCategoryModal (View All)
  const [categoryModalGroup, setCategoryModalGroup] = useState<CategoryGroup | null>(null);

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

  const CATEGORY_LABELS: Record<AchievementCategory, string> = useMemo(() => ({
    sessions: t('categorySessions'),
    total_drops: t('categoryTotalDrops'),
    streak: t('categoryStreak'),
    multi_gym: t('categoryMultiGym'),
    distance: t('categoryDistance'),
    special: t('categorySpecial'),
  }), [t]);

  const handleBadgePress = useCallback((badge: BadgeWithProgress) => {
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
    setSelectedBadgeTier(badge.tier ?? null);
    setDetailVisible(true);
  }, [earnedBadges]);

  // Build category groups — one row per category, in CATEGORY_ORDER, plus
  // a final "This Gym" row for gym badges and a fallback "Special" group
  // for any global achievement that's missing a category in the DB. Empty
  // groups (after filtering by tab + search) are filtered out by the caller.
  const buildCategoryGroups = useCallback((badges: BadgeWithProgress[]): CategoryGroup[] => {
    const groups: CategoryGroup[] = [];
    const buckets: Partial<Record<AchievementCategory, BadgeWithProgress[]>> = {};
    const orphanGlobals: BadgeWithProgress[] = [];
    const gymBadges: BadgeWithProgress[] = [];

    badges.forEach((b) => {
      if (b.badge_type === 'gym') {
        gymBadges.push(b);
        return;
      }
      if (b.category) {
        if (!buckets[b.category]) buckets[b.category] = [];
        buckets[b.category]!.push(b);
      } else {
        orphanGlobals.push(b);
      }
    });

    CATEGORY_ORDER.forEach((cat) => {
      const items = buckets[cat] ?? [];
      if (cat === 'special' && orphanGlobals.length > 0) {
        items.push(...orphanGlobals);
      }
      if (items.length === 0) return;
      groups.push({
        key: cat,
        label: CATEGORY_LABELS[cat],
        icon: CATEGORY_ICONS[cat],
        accent: CATEGORY_ACCENT[cat] ?? branding.primary,
        badges: items,
      });
    });

    if (gymBadges.length > 0) {
      groups.push({
        key: 'gym',
        label: t('categoryGym'),
        icon: 'fitness-outline',
        accent: CATEGORY_ACCENT.gym ?? branding.primary,
        badges: gymBadges,
      });
    }

    return groups;
  }, [CATEGORY_LABELS, t, branding.primary]);

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
            // Build the page-level filtered list (gym scoping + tab filter +
            // search). The category-row filtering ("Earned"/"Locked" tabs)
            // runs separately so a row stays visible as long as it has at
            // least one badge after filtering.
            const pageBadges = (() => {
              let filtered = allBadgesWithProgress;
              const gymOk = (b: BadgeWithProgress) =>
                b.badge_type === 'global' || (b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId));

              if (key === 'this_gym') {
                filtered = filtered.filter((b) => b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId));
              } else if (key === 'all') {
                filtered = filtered.filter(gymOk);
              } else if (key === 'earned') {
                filtered = filtered.filter((b) => b.is_earned && gymOk(b));
              } else if (key === 'locked') {
                filtered = filtered.filter((b) => !b.is_earned && gymOk(b));
              }

              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                filtered = filtered.filter(
                  (b) => b.name.toLowerCase().includes(q) || (b.description && b.description.toLowerCase().includes(q)),
                );
              }
              return filtered;
            })();

            const groups = buildCategoryGroups(pageBadges);

            return (
              <ScrollView
                key={key}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {groups.length === 0 ? (
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
                  groups.map((group, idx) => (
                    <CategoryRow
                      key={group.key}
                      group={group}
                      index={idx}
                      onBadgePress={handleBadgePress}
                      onViewAll={() => setCategoryModalGroup(group)}
                      t={t}
                    />
                  ))
                )}
              </ScrollView>
            );
          })}
        </SliderTabs>
      </Animated.View>

      <BadgeCategoryModal
        visible={categoryModalGroup !== null}
        group={categoryModalGroup}
        onClose={() => setCategoryModalGroup(null)}
        onBadgePress={(b) => {
          handleBadgePress(b);
        }}
      />

      <BadgeDetailModal
        visible={detailVisible}
        badge={selectedBadge}
        isLocked={selectedBadgeLocked}
        progress={selectedBadgeProgress}
        tier={selectedBadgeTier}
        onClose={() => {
          setDetailVisible(false);
          setSelectedBadge(null);
          setSelectedBadgeLocked(false);
          setSelectedBadgeProgress(0);
          setSelectedBadgeTier(null);
        }}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// CategoryRow — one row per category. Header (icon + label + earned/total
// pill + "View All" affordance) and a horizontally-scrolling carousel of
// small badge cards. Earned badges come first (sorted by tier rank); locked
// badges follow, sorted by progress descending so the "almost there" ones
// surface near the front of the carousel where they nudge the user.
// ---------------------------------------------------------------------------

const CategoryRow: React.FC<{
  group: CategoryGroup;
  index: number;
  onBadgePress: (b: BadgeWithProgress) => void;
  onViewAll: () => void;
  t: (k: string) => string;
}> = ({ group, index, onBadgePress, onViewAll, t }) => {
  const sorted = useMemo(() => {
    const earned = group.badges
      .filter((b) => b.is_earned)
      .sort((a, b) => (TIER_RANK[a.tier ?? ''] ?? 99) - (TIER_RANK[b.tier ?? ''] ?? 99));
    const locked = group.badges
      .filter((b) => !b.is_earned)
      .sort((a, b) => b.progress - a.progress);
    return [...earned, ...locked];
  }, [group.badges]);

  const earnedCount = group.badges.filter((b) => b.is_earned).length;
  const totalCount = group.badges.length;

  // Show "View All" affordance once a category has more badges than fit
  // on screen (~4 small cards). Below that the user can already see them
  // all, and the chevron just adds noise.
  const showViewAll = totalCount > 4;

  return (
    <Animated.View
      entering={FadeInDown.delay(60 * index).duration(360)}
      style={styles.row}
    >
      <TouchableOpacity
        onPress={onViewAll}
        activeOpacity={0.7}
        accessibilityRole="button"
        style={styles.rowHeader}
      >
        <View style={[styles.rowIconBox, { backgroundColor: hexToRgba(group.accent, 0.12), borderColor: hexToRgba(group.accent, 0.25) }]}>
          <Ionicons name={group.icon} size={14} color={group.accent} />
        </View>
        <Text style={styles.rowTitle}>{group.label}</Text>
        <View style={[styles.rowCountPill, { backgroundColor: hexToRgba(group.accent, 0.14), borderColor: hexToRgba(group.accent, 0.22) }]}>
          <Text style={[styles.rowCountText, { color: group.accent }]}>
            {earnedCount}<Text style={styles.rowCountTotal}>/{totalCount}</Text>
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {showViewAll ? (
          <View style={styles.rowViewAll}>
            <Text style={[styles.rowViewAllText, { color: group.accent }]}>{t('viewAll')}</Text>
            <Ionicons name="chevron-forward" size={13} color={group.accent} style={{ marginLeft: 1 }} />
          </View>
        ) : null}
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
      >
        {sorted.map((b) => (
          <BadgeCard
            key={`${b.badge_type}-${b.id}`}
            badge={{
              badge_id: b.id,
              badge_name: b.name,
              badge_description: b.description,
              badge_image_url: b.badge_image_url,
              earned_at: b.earned_at || '',
              badge_type: b.badge_type,
              gym_name: b.gym_name,
              gym_id: b.gym_id || null,
            }}
            isLocked={!b.is_earned}
            progress={b.progress}
            onPress={() => onBadgePress(b)}
            size="small"
            tier={b.tier}
          />
        ))}
      </ScrollView>
    </Animated.View>
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
    marginBottom: 6,
    marginHorizontal: 16,
  },

  /* ── Scroll ── */
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 64,
  },

  /* ── Category row ── */
  row: {
    marginBottom: 18,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  rowCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowCountText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  rowCountTotal: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  rowViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  rowViewAllText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  carouselContent: {
    paddingHorizontal: 16,
    gap: 6,
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
