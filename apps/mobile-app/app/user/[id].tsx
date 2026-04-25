import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { localAvatarSource } from '@/lib/avatars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatMonthYear } from '@/lib/utils/formatDate';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { computeBestStreak } from '@/lib/streak/computeBestStreak';
import { useSession } from '@/hooks/useSession';
import { type UserBadge } from '@/hooks/useUserBadges';
import { useAllBadgesWithProgress } from '@/hooks/useAllBadgesWithProgress';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { BadgeCard } from '@/components/BadgeCard';
import { BadgeDetailModal } from '@/components/BadgeDetailModal';
import { TIER_RANK } from '@/lib/badges/categoryMeta';
import type { AchievementTier, BadgeWithProgress } from '@/hooks/useAllBadges';

// Member-profile badge grid is a flat 4-column showcase (no category
// grouping — that lives in the user's own Trophy Room). Sized so cards
// pack neatly inside the panel chrome without horizontal overflow.
const SCREEN_WIDTH = Dimensions.get('window').width;
const BADGE_COLUMNS = 4;
const BADGE_GAP = 8;
const PANEL_OUTER_PADDING = 16;     // ScrollView padding
const PANEL_INNER_PADDING = 16;     // badgesSection padding
const BADGE_AVAILABLE_WIDTH =
  SCREEN_WIDTH - PANEL_OUTER_PADDING * 2 - PANEL_INNER_PADDING * 2 - BADGE_GAP * (BADGE_COLUMNS - 1);
const BADGE_CELL_SIZE = Math.floor(BADGE_AVAILABLE_WIDTH / BADGE_COLUMNS);

interface PublicProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  total_drops: number;
  streak_days: number;
  created_at: string;
  is_newcomer: boolean;
}

// AGENT NOTE: [2026-04-25] - mobile-coder
// Member profile screen mirrors the Trophy Room visual language: badges
// render through `BadgeCard` (coin/ring/check), tier + category come from
// the `get_user_badges` RPC (migration 20260425220000), and the all-time
// best streak comes from `get_user_best_streak` (migration 20260425230000).
//
// Grid is a flat 4-column showcase — no category grouping. The user
// explicitly asked for a clean grid here ("ne treba kategorije, po 4 u
// redu"). Tier-sort puts the strongest globals first, then the rest.
// `BadgeDetailModal` is opened in `canShare={false}` mode unless the
// viewer is looking at their own profile, since you can't share another
// user's badge as your own accomplishment.

function formatDate(iso: string): string {
  return formatMonthYear(iso);
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('memberProfile');
  const branding = useBranding();
  const { session } = useSession();
  const isOwnProfile = !!session?.user?.id && session.user.id === id;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [bestStreak, setBestStreak] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // AGENT NOTE: [2026-04-25] - mobile-coder
  // Single source of truth for the badge ledger — same hook the Trophy
  // Room uses, so the "earned" count never disagrees between surfaces.
  // For the *own* profile this includes any global achievement whose
  // criteria has been met (even before `evaluate_badges()` writes the
  // user_badges row), eliminating the off-by-3 the user saw between
  // Trophy Room (22) and Profile (19). For other-user views,
  // `useUserProgress` returns an empty list under RLS so the count
  // collapses back to the actual `user_badges` rows the RPC returns —
  // which is the only thing we can know about another user.
  const { allBadges, earnedBadges, loading: badgesLoading } = useAllBadgesWithProgress(id);

  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [selectedTier, setSelectedTier] = useState<AchievementTier | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Client-side fallback for the best-streak compute when the dedicated
  // RPC is unavailable (e.g. the migration hasn't been applied to this
  // environment yet) AND the viewer is looking at their own profile —
  // because `get_my_sessions` / `get_my_checkins` are auth.uid()-scoped
  // and can't be used to read another user's history. Uses the shared
  // `computeBestStreak` helper that buckets days in Europe/Belgrade,
  // identical to the SQL RPC, so the value is consistent regardless of
  // which path is taken.
  const computeOwnBestStreak = useCallback(async (): Promise<number | null> => {
    try {
      const [sessionsRes, checkinsRes] = await Promise.all([
        supabase.rpc('get_my_sessions', {
          p_gym_id: null,
          p_active_only: false,
          p_since: null,
          p_limit: 5000,
        }),
        supabase.rpc('get_my_checkins', {
          p_gym_id: null,
          p_since: null,
          p_limit: 5000,
        }),
      ]);

      return computeBestStreak(sessionsRes.data ?? [], checkinsRes.data ?? []);
    } catch (err) {
      log.error('[UserProfile] computeOwnBestStreak failed:', err);
      return null;
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    try {
      // Profile fields + best-streak-ever fetched in parallel. The streak
      // stat card surfaces the all-time max (per migration
      // 20260425230000) instead of the live counter, which resets the
      // first day a user skips.
      const [profileRes, streakRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, avatar_url, total_drops, streak_days, created_at, is_newcomer')
          .eq('id', id)
          .single(),
        supabase.rpc('get_user_best_streak', { p_user_id: id }),
      ]);

      if (!profileRes.error && profileRes.data) {
        setProfile(profileRes.data);
      }

      // RPC path: returns the all-time best streak (INTEGER scalar).
      // We trust the RPC result whenever it succeeds — including 0,
      // because that genuinely means "no completed sessions or check-ins
      // ever", which is a real state for brand-new accounts.
      if (!streakRes.error && streakRes.data !== null && streakRes.data !== undefined) {
        const val = typeof streakRes.data === 'number' ? streakRes.data : Number(streakRes.data);
        if (Number.isFinite(val)) {
          setBestStreak(val);
          return;
        }
      }

      // RPC unavailable (most likely the migration hasn't been applied
      // yet) — log the reason so the developer can spot it, and fall
      // back to the client-side compute when looking at our own profile.
      if (streakRes.error) {
        log.error('[UserProfile] get_user_best_streak RPC failed:', streakRes.error);
      }
      if (isOwnProfile) {
        const fallback = await computeOwnBestStreak();
        if (fallback !== null) setBestStreak(fallback);
      }
    } catch (err) {
      log.error('[UserProfile] loadProfile error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, isOwnProfile, computeOwnBestStreak]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfile();
  }, [loadProfile]);

  // Flat list, sorted: globals first by tier-rank descending (diamond →
  // bronze → null), then gym challenges in earned-order. Keeps the most
  // impressive achievements in the top row of the grid.
  const earnedBadgesAll = useMemo<BadgeWithProgress[]>(
    () => allBadges.filter((b) => b.is_earned),
    [allBadges],
  );

  const sortedBadges = useMemo<BadgeWithProgress[]>(() => {
    const tierWeight = (b: BadgeWithProgress): number =>
      b.badge_type === 'global' ? (TIER_RANK[b.tier ?? ''] ?? -1) : -2;
    return [...earnedBadgesAll].sort((a, b) => tierWeight(b) - tierWeight(a));
  }, [earnedBadgesAll]);

  // Maps a `BadgeWithProgress` (catalog shape) onto the `UserBadge`
  // shape the detail modal expects. Mirrors what TrophyRoom does — when
  // the user really has a row in `user_badges` we use that (so
  // `earned_at` and the canonical id are real); otherwise we synthesise
  // a stand-in record so the modal still renders without a network round
  // trip. The "stand-in" path only matters for a viewer's own profile
  // where progress-completed achievements show up before the badge row
  // is written.
  const handleBadgePress = useCallback(
    (badge: BadgeWithProgress) => {
      const earned = earnedBadges.find(
        (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type,
      );
      const badgeForModal: UserBadge = earned || {
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
      setSelectedTier(badge.tier ?? null);
      setDetailVisible(true);
    },
    [earnedBadges],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title={t('title')} insetHandled />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title={t('title')} insetHandled />
        <View style={styles.center}>
          <Ionicons name="person-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('userNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderAvatar = () => {
    if (profile.avatar_url && profile.avatar_url.startsWith('http')) {
      return <Image source={localAvatarSource(profile.avatar_url)} style={styles.avatarImage} transition={200} />;
    }
    if (profile.avatar_url) {
      return <Text style={styles.avatarEmoji}>{profile.avatar_url}</Text>;
    }
    return (
      <Text style={styles.avatarInitial}>
        {(profile.username || 'U').charAt(0).toUpperCase()}
      </Text>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={t('title')} insetHandled />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={branding.primary} />}
      >
        {/* Hero section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={[styles.heroCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.heroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroGradient}
              >
                <View style={styles.avatarContainer}>
                  {renderAvatar()}
                </View>

                <Text style={styles.username}>{profile.username}</Text>

                {profile.is_newcomer && (
                  <View style={[styles.newcomerBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Ionicons name="sparkles" size={12} color={branding.primary} />
                    <Text style={[styles.newcomerText, { color: branding.primary }]}>{t('newcomer')}</Text>
                  </View>
                )}

                <Text style={styles.memberSince}>
                  {t('memberSince', { date: formatDate(profile.created_at) })}
                </Text>
              </LinearGradient>
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="water" size={20} color={branding.primary} />
                <Text style={[styles.statValue, getNumberStyle(20), { color: branding.primary }]}>
                  {profile.total_drops.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>{t('totalDrops')}</Text>
              </PlatformBlur>
            </View>

            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="flame" size={20} color="#FF6B35" />
                <Text style={[styles.statValue, getNumberStyle(20)]}>
                  {/*
                    Floor by `profile.streak_days` — the "best ever"
                    must always be at least the current active streak,
                    same logic My Stats already applies. Without this,
                    a profile with current_streak = 10 and historical
                    runs of <= 9 would show 9 here while My Stats shows
                    10 (regression caught 2026-04-25).
                  */}
                  {bestStreak !== null
                    ? Math.max(bestStreak, profile.streak_days)
                    : (profile.streak_days || '—')}
                </Text>
                <Text style={styles.statLabel}>{t('bestStreak')}</Text>
              </PlatformBlur>
            </View>

            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="ribbon" size={20} color="#FFD700" />
                <Text style={[styles.statValue, getNumberStyle(20)]}>
                  {earnedBadgesAll.length}
                </Text>
                <Text style={styles.statLabel}>{t('badges')}</Text>
              </PlatformBlur>
            </View>
          </View>
        </Animated.View>

        {/* Badges — grouped by Trophy Room category */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <View style={[styles.badgesSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.badgesSectionBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={styles.badgesSectionHeader}>
                <Ionicons name="trophy" size={18} color={branding.primary} />
                <Text style={[styles.badgesSectionTitle, { color: branding.primary }]}>
                  {t('earnedBadges')}
                </Text>
                <Text style={styles.badgesCount}>
                  {earnedBadgesAll.length}
                </Text>
              </View>

              {badgesLoading ? (
                <ActivityIndicator size="small" color={branding.primary} style={{ padding: 20 }} />
              ) : sortedBadges.length === 0 ? (
                <View style={styles.noBadges}>
                  <Ionicons name="trophy-outline" size={32} color={theme.colors.textTertiary} />
                  <Text style={styles.noBadgesText}>{t('noBadgesYet')}</Text>
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
                      isLocked={false}
                      onPress={() => handleBadgePress(b)}
                      tier={b.tier ?? null}
                      customSize={BADGE_CELL_SIZE}
                    />
                  ))}
                </View>
              )}
            </PlatformBlur>
          </View>
        </Animated.View>
      </ScrollView>

      <BadgeDetailModal
        visible={detailVisible}
        badge={selectedBadge}
        isLocked={false}
        progress={100}
        tier={selectedTier}
        canShare={isOwnProfile}
        onClose={() => {
          setDetailVisible(false);
          setSelectedBadge(null);
          setSelectedTier(null);
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },

  // Hero
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroGradient: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  avatarContainer: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarEmoji: {
    fontSize: 40,
  },
  avatarInitial: {
    ...fontStyles.heading,
    fontSize: 32,
    color: theme.colors.textSecondary,
  },
  username: {
    ...fontStyles.heading,
    fontSize: 24,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  newcomerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  newcomerText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  memberSince: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    color: theme.colors.text,
  },
  statLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  // Badges section
  badgesSection: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  badgesSectionBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 16,
  },
  badgesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  badgesSectionTitle: {
    ...fontStyles.heading,
    fontSize: 16,
    flex: 1,
  },
  badgesCount: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  noBadges: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  noBadgesText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  // Flat 4-column badge grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: BADGE_GAP,
    rowGap: 4,
  },
});
