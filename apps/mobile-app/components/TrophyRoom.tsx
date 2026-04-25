import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { UserBadge } from '@/hooks/useUserBadges';
import { BadgeWithProgress } from '@/hooks/useAllBadges';
import { useAllBadgesWithProgress } from '@/hooks/useAllBadgesWithProgress';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import {
  buildCategoryGroups,
  sortBadgesForRow,
  type CategoryGroup,
  type CategoryKey,
} from '@/lib/badges/categoryMeta';
import BackButton from './BackButton';
import { SliderTabs } from './SliderTabs';
import { BadgeCard } from './BadgeCard';
import { BadgeDetailModal } from './BadgeDetailModal';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

interface TrophyRoomProps {
  userId?: string;
  onClose?: () => void;
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ userId, onClose }) => {
  const { t } = useTranslation('trophyRoom');
  const branding = useBranding();
  const router = useThrottledRouter();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { allBadges: allBadgesWithProgress, earnedBadges, loading } = useAllBadgesWithProgress(userId);
  const [filterType, setFilterType] = useState<'all' | 'this_gym'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected badge — drives BadgeDetailModal
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [selectedBadgeLocked, setSelectedBadgeLocked] = useState(false);
  const [selectedBadgeProgress, setSelectedBadgeProgress] = useState(0);
  const [selectedBadgeTier, setSelectedBadgeTier] = useState<BadgeWithProgress['tier']>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const totalEarned = allBadgesWithProgress.filter((b) => b.is_earned).length;
  const totalAvailable = allBadgesWithProgress.length;
  const completionPct = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

  const labelFor = useCallback(
    (key: CategoryKey): string => {
      switch (key) {
        case 'sessions':    return t('categorySessions');
        case 'total_drops': return t('categoryTotalDrops');
        case 'streak':      return t('categoryStreak');
        case 'multi_gym':   return t('categoryMultiGym');
        case 'distance':    return t('categoryDistance');
        case 'special':     return t('categorySpecial');
        case 'gym':         return t('categoryGym');
      }
    },
    [t],
  );

  const handleBadgePress = useCallback((badge: BadgeWithProgress) => {
    const earnedBadge = earnedBadges.find(
      (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type,
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

  // "View all" pushes to the category drill-down screen on the trophy
  // room's own stack — same iOS-style slide-from-right transition the
  // rest of the app uses, instead of the previous modal that
  // (correctly) felt out of place.
  const handleViewAll = useCallback(
    (group: CategoryGroup) => {
      router.push({
        pathname: '/trophy-room/category/[key]',
        params: { key: group.key },
      });
    },
    [router],
  );

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

  // Earned/Locked tabs were removed — every category row already shows
  // earned + locked badges mixed (earned first, locked tail), so a
  // global "earned only" filter just produced ratios like
  // "1/1 2/2 3/3" that read as redundant noise. The "All" + "This Gym"
  // split is what users actually need: one focused view per badge scope.
  const FILTERS: { key: 'all' | 'this_gym'; labelKey: string }[] = [
    { key: 'all',      labelKey: 'filterAll' },
    { key: 'this_gym', labelKey: 'filterThisGym' },
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

      {/* Filter tabs + swipeable pages.
          - "All" page: per-category horizontal carousels (gym category
            included, since the user expects every category to use the
            same scroll affordance instead of one-off grids).
          - "This Gym" page: a single flat grid of every gym badge —
            this tab IS the "view all gym badges" affordance, so no
            inner row chrome is needed. */}
      <Animated.View entering={FadeInDown.delay(220).duration(400)} style={styles.tabsWrapper}>
        <SliderTabs
          tabs={FILTERS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
          activeKey={filterType}
          onChange={(key) => setFilterType(key as typeof filterType)}
          accentColor={branding.primary}
          barStyle={styles.tabBar}
        >
          {FILTERS.map(({ key }) => {
            const filteredBadges = (() => {
              let filtered = allBadgesWithProgress;
              const gymOk = (b: BadgeWithProgress) =>
                b.badge_type === 'global' || (b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId));

              if (key === 'this_gym') {
                filtered = filtered.filter(
                  (b) => b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId),
                );
              } else {
                filtered = filtered.filter(gymOk);
              }

              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                filtered = filtered.filter(
                  (b) =>
                    b.name.toLowerCase().includes(q) ||
                    (b.description && b.description.toLowerCase().includes(q)),
                );
              }
              return filtered;
            })();

            // "This Gym" — flat grid, no category headers. Sorting still
            // earned-first / progress-desc so the tab opens with the
            // user's wins on top and the next-up locked badges below.
            if (key === 'this_gym') {
              const sorted = sortBadgesForRow(filteredBadges);
              return (
                <ScrollView
                  key={key}
                  contentContainerStyle={styles.gridScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {sorted.length === 0 ? (
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
                    <View style={styles.flatGrid}>
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
                          onPress={() => handleBadgePress(b)}
                          size="medium"
                          tier={b.tier}
                        />
                      ))}
                    </View>
                  )}
                </ScrollView>
              );
            }

            // "All" — per-category rows, every row a carousel.
            const groups = buildCategoryGroups(filteredBadges, labelFor, branding.primary);

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
                      onViewAll={() => handleViewAll(group)}
                      t={t}
                    />
                  ))
                )}
              </ScrollView>
            );
          })}
        </SliderTabs>
      </Animated.View>

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
//
// Every category — including "This Gym" inside the All tab — uses this
// same carousel. The user explicitly asked for the gym row to scroll
// horizontally too so the All view reads as a consistent stack of rows.
// ---------------------------------------------------------------------------

const CategoryRow: React.FC<{
  group: CategoryGroup;
  index: number;
  onBadgePress: (b: BadgeWithProgress) => void;
  onViewAll: () => void;
  t: (k: string) => string;
}> = ({ group, index, onBadgePress, onViewAll, t }) => {
  const sorted = useMemo(() => sortBadgesForRow(group.badges), [group.badges]);

  const earnedCount = group.badges.filter((b) => b.is_earned).length;
  const totalCount = group.badges.length;

  // Show "View all" once a category has more badges than fit on screen
  // (~3 large carousel cards). Below that the chevron is just noise.
  const showViewAll = totalCount > 3;

  return (
    <Animated.View
      entering={FadeInDown.delay(60 * index).duration(360)}
      style={styles.row}
    >
      <TouchableOpacity
        onPress={showViewAll ? onViewAll : undefined}
        disabled={!showViewAll}
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
  gridScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 80,
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
    gap: 8,
  },

  /* ── This-gym flat grid ── */
  flatGrid: {
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
