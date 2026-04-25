import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useAllBadgesWithProgress } from '@/hooks/useAllBadgesWithProgress';
import { BadgeCard } from '@/components/BadgeCard';
import { BadgeDetailModal } from '@/components/BadgeDetailModal';
import {
  CATEGORY_ICONS,
  CATEGORY_ACCENT,
  sortBadgesForRow,
  type CategoryKey,
} from '@/lib/badges/categoryMeta';
import type { BadgeWithProgress } from '@/hooks/useAllBadges';
import type { UserBadge } from '@/hooks/useUserBadges';

// AGENT NOTE: [2026-04-25] - mobile-coder
// Per-category drill-down screen reached by tapping "View all" on a
// trophy room row. Pushes onto the trophy-room stack with the standard
// slide-from-right animation, so it feels native instead of the
// previous bottom-sliding modal that the user (correctly) called out
// as inconsistent with the rest of the app.
//
// The screen rebuilds the same BadgeWithProgress[] dataset the trophy
// room uses (via the shared hook) and filters down to the requested
// category — gym badges are scoped to the active gym in the hook itself
// so this screen doesn't need to re-implement that logic.

const VALID_KEYS: CategoryKey[] = [
  'sessions',
  'total_drops',
  'streak',
  'multi_gym',
  'distance',
  'special',
  'gym',
];

export default function TrophyCategoryScreen() {
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const router = useThrottledRouter();
  const { t } = useTranslation('trophyRoom');
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { allBadges, earnedBadges, loading } = useAllBadgesWithProgress();

  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [selectedBadgeLocked, setSelectedBadgeLocked] = useState(false);
  const [selectedBadgeProgress, setSelectedBadgeProgress] = useState(0);
  const [selectedBadgeTier, setSelectedBadgeTier] = useState<BadgeWithProgress['tier']>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const categoryKey = (VALID_KEYS as string[]).includes(rawKey)
    ? (rawKey as CategoryKey)
    : 'special';

  const accent = CATEGORY_ACCENT[categoryKey] ?? branding.primary;
  const icon = CATEGORY_ICONS[categoryKey];

  const labelKey = useMemo(() => {
    switch (categoryKey) {
      case 'sessions':    return 'categorySessions';
      case 'total_drops': return 'categoryTotalDrops';
      case 'streak':      return 'categoryStreak';
      case 'multi_gym':   return 'categoryMultiGym';
      case 'distance':    return 'categoryDistance';
      case 'special':     return 'categorySpecial';
      case 'gym':         return 'categoryGym';
    }
  }, [categoryKey]);
  const label = t(labelKey);

  // Filter the master list down to this category. Gym badges already get
  // scoped to the active gym inside the hook, so we just split by type
  // here. Globals without a category show up under "special".
  const categoryBadges = useMemo<BadgeWithProgress[]>(() => {
    if (categoryKey === 'gym') {
      return allBadges.filter(
        (b) => b.badge_type === 'gym' && (!activeGymId || b.gym_id === activeGymId),
      );
    }
    return allBadges.filter((b) => {
      if (b.badge_type !== 'global') return false;
      if (categoryKey === 'special') return !b.category || b.category === 'special';
      return b.category === categoryKey;
    });
  }, [allBadges, categoryKey, activeGymId]);

  const sortedBadges = useMemo(() => sortBadgesForRow(categoryBadges), [categoryBadges]);

  const earnedCount = categoryBadges.filter((b) => b.is_earned).length;
  const totalCount = categoryBadges.length;
  const completionPct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  const handleBadgePress = useCallback(
    (badge: BadgeWithProgress) => {
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
    },
    [earnedBadges],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingBox}>
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

      {/* Header — same flex layout as the root trophy room screen so the
          back button + centered title align across the stack. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View
            style={[
              styles.headerIconBox,
              { backgroundColor: hexToRgba(accent, 0.14), borderColor: hexToRgba(accent, 0.3) },
            ]}
          >
            <Ionicons name={icon} size={14} color={accent} />
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Stats banner */}
      <Animated.View entering={FadeIn.delay(60).duration(280)} style={styles.statsBanner}>
        <LinearGradient
          colors={[hexToRgba(accent, 0.14), 'rgba(255,255,255,0.03)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.statsRow}>
          <Text style={[styles.statsCount, { color: accent }]}>
            {earnedCount}<Text style={styles.statsCountOf}> / {totalCount}</Text>
          </Text>
          <View style={styles.statsRightInline}>
            <Text style={[styles.statsPct, { color: accent }]}>{completionPct}%</Text>
            <Text style={styles.statsLabel}>{t('badgesEarned')}</Text>
          </View>
        </View>
        <View style={styles.statsBar}>
          <View
            style={[
              styles.statsBarFill,
              { width: `${completionPct}%`, backgroundColor: accent },
            ]}
          />
        </View>
      </Animated.View>

      {/* Grid */}
      <ScrollView
        contentContainerStyle={styles.gridScroll}
        showsVerticalScrollIndicator={false}
      >
        {sortedBadges.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name={icon} size={36} color="rgba(255,255,255,0.18)" />
            </View>
            <Text style={styles.emptyTitle}>{t('noBadgesFound')}</Text>
            <Text style={styles.emptyText}>{t('noBadgesInCategory')}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {sortedBadges.map((b) => (
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 17,
    color: theme.colors.text,
    letterSpacing: 0.8,
    maxWidth: 220,
  },
  headerSpacer: {
    width: 40,
  },

  /* ── Stats banner ── */
  statsBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statsCount: {
    ...fontStyles.heading,
    fontSize: 24,
    letterSpacing: 0.4,
  },
  statsCountOf: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.3)',
  },
  statsRightInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  statsPct: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  statsLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statsBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  statsBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  /* ── Grid ── */
  gridScroll: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 80,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  /* ── Empty state ── */
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...fontStyles.heading,
    fontSize: 16,
    color: theme.colors.text,
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 19,
  },
});
