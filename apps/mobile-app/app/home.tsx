import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, RefreshControl, Platform } from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { Image } from 'expo-image';
import { localAvatarSource } from '@/lib/avatars';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useDerivedValue,
  withTiming,
  interpolate,
  Easing,
  FadeInDown,
  runOnJS,
} from 'react-native-reanimated';
import { SkeletonShimmer } from '@/components/SkeletonShimmer';
import { PlatformBlur } from '@/components/PlatformBlur';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { useGymData } from '@/hooks/useGymData';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { useBadgeNotifications } from '@/hooks/useBadgeNotifications';
import { theme as appTheme, fontStyles, hexToRgba } from '@/lib/theme';
import { ConfettiEffect } from '@/components/ConfettiEffect';
import type { ActivityRingsHandle } from '@/components/ActivityRings';
import { useDropLimitStatus } from '@/hooks/useDropLimitStatus';
import { useCompeteStats } from '@/hooks/useCompeteStats';
import { useUserBadges } from '@/hooks/useUserBadges';
import { useLeaderboardRewards } from '@/hooks/useLeaderboardRewards';
import { useMyLeaderboardPrizes } from '@/hooks/useMyLeaderboardPrizes';
import { HomeHeroPager, type HomeHeroPagerHandle } from '@/components/home/HomeHeroPager';
import { SheetActivityContent } from '@/components/home/SheetActivityContent';
import { SheetRankContent } from '@/components/home/SheetRankContent';
import { SheetBadgesContent } from '@/components/home/SheetBadgesContent';
import { SheetArenaContent } from '@/components/home/SheetArenaContent';
import { SliderTabs, SliderTabsBar, type SliderTab } from '@/components/SliderTabs';
import type { LeaderboardPeriod } from '@/components/LeaderboardPreview';

import { useHomeStats } from '@/hooks/useHomeStats';
import { useAvailableArenas } from '@/hooks/useAvailableArenas';
import { useUpcomingHappyHours } from '@/hooks/useUpcomingHappyHours';
import { useForegroundRefresh } from '@/hooks/useForegroundRefresh';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { SuggestGymCardWithSheet } from '@/components/SuggestGymCardWithSheet';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARALLAX_SHIFT = 18; // px shift per page
const PARALLAX_EXTRA = PARALLAX_SHIFT * 3 + 10; // total extra width needed
const CARD_MARGIN = 12;
const CARD_PADDING = 16; // Horizontal padding of ScrollView
// Bottom cards row: two cards with gap between them
const BOTTOM_CARDS_GAP = 16;
const BOTTOM_CARD_WIDTH = (SCREEN_WIDTH - (CARD_PADDING * 2) - BOTTOM_CARDS_GAP) / 2;
const SMARTCOACH_CARD_WIDTH = (BOTTOM_CARD_WIDTH * 2) + BOTTOM_CARDS_GAP;
const CHALLENGE_CARD_WIDTH = SMARTCOACH_CARD_WIDTH;
const CHALLENGE_CARD_HEIGHT = 200;
/** Same geometry as `StatsCards` hero / side / action cards */
const SK_CARD_GAP = 10;
const SK_CARD_PAD = 16;
const SK_HERO_W = (SCREEN_WIDTH - SK_CARD_PAD * 2 - SK_CARD_GAP) * 0.58;
const SK_SIDE_W = (SCREEN_WIDTH - SK_CARD_PAD * 2 - SK_CARD_GAP) * 0.42;
const SK_HERO_H = 162;
const SK_SIDE_H = (SK_HERO_H - SK_CARD_GAP) / 2;
const SK_ACTION_W = (SCREEN_WIDTH - SK_CARD_PAD * 2 - SK_CARD_GAP) / 2;
/** ~`ActivityRings` size (290) inside `HomeHeroPager` */
const SK_RING_D = Math.min(280, Math.round(SCREEN_WIDTH * 0.72));

// ═══════════════════════════════════════════════════════════
// COLD-START SKELETON — mirrors fixed header, hero pager, sticky tabs, StatsCards
// ═══════════════════════════════════════════════════════════

function ShimmerBlock({ style, delayMs = 0 }: { style: object; delayMs?: number }) {
  return <SkeletonShimmer style={style} delayMs={delayMs} />;
}

function ColdStartSkeleton({ brandPrimary = '#00E5FF' }: { brandPrimary?: string }) {
  const ringR = SK_RING_D / 2;
  // Match VerificationSheet: semi-transparent on iOS (blur handles look), opaque on Android
  const skSheetBg  = Platform.OS === 'android' ? 'rgba(12,15,24,0.98)' : 'rgba(10,10,20,0.55)';
  const skStickyBg = Platform.OS === 'android' ? 'rgba(12,15,24,0.98)' : 'rgba(10,10,20,0.55)';
  return (
    <ScrollView
      style={sk.skeletonScroll}
      contentContainerStyle={sk.skeletonScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Matches `styles.fixedHeader` ── */}
      <View style={sk.skFixedHeader}>
        <View style={sk.skHeaderLeft}>
          <ShimmerBlock style={sk.skAvatar} />
          <ShimmerBlock style={sk.skUsername} />
        </View>
        <View style={sk.skHeaderActions}>
          <ShimmerBlock style={sk.skHeaderAction} delayMs={40} />
          <ShimmerBlock style={sk.skHeaderAction} delayMs={70} />
        </View>
      </View>

      {/* ── `HomeHeroPager`: ring + dots + `sheetLogoBadge` ── */}
      <View style={sk.skHeroBlock}>
        <ShimmerBlock
          style={[sk.skRing, { width: SK_RING_D, height: SK_RING_D, borderRadius: ringR }]}
        />
        <ShimmerBlock style={sk.skGymBadge} />
      </View>

      {/* ── `stickySection` + `SliderTabsBar` (4 tabs) ── */}
      <View style={[sk.skStickyChrome, { backgroundColor: skStickyBg }]}>
        <View style={sk.skTabBar}>
          {[0, 1, 2, 3].map((i) => (
            <ShimmerBlock key={i} delayMs={i * 35} style={sk.skTabSlot} />
          ))}
        </View>
      </View>

      {/* ── `SheetActivityContent` / `StatsCards` bento ── */}
      <View style={[sk.skSheetBody, { backgroundColor: skSheetBg }]}>
        <View style={sk.skStatsTopRow}>
          <ShimmerBlock style={[sk.skHeroStat, { width: SK_HERO_W, height: SK_HERO_H }]} />
          <View style={[sk.skSideCol, { width: SK_SIDE_W }]}>
            <ShimmerBlock style={[sk.skSideStat, { height: SK_SIDE_H }]} />
            <ShimmerBlock style={[sk.skSideStat, { height: SK_SIDE_H }]} />
          </View>
        </View>
        <View style={sk.skActionsRow}>
          <ShimmerBlock style={[sk.skActionStat, { width: SK_ACTION_W }]} />
          <ShimmerBlock style={[sk.skActionStat, { width: SK_ACTION_W }]} />
        </View>
        <ShimmerBlock style={sk.skRewardRow} />
      </View>
    </ScrollView>
  );
}

const sk = StyleSheet.create({
  skeletonScroll: { flex: 1 },
  skeletonScrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  skFixedHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 2,
  },
  skHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  skAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skUsername: {
    width: 128,
    height: 15,
    borderRadius: 8,
    flexShrink: 0,
  },
  skHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skHeaderAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  skHeroBlock: {
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 6,
  },
  skRing: {
    overflow: 'hidden',
  },
  skGymBadge: {
    width: 94,
    height: 34,
    borderRadius: 17,
    marginTop: 10,
  },
  skStickyChrome: {
    marginTop: 10,
    marginHorizontal: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 10,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  skTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  skTabSlot: {
    flex: 1,
    height: 38,
    borderRadius: 12,
  },
  skSheetBody: {
    paddingHorizontal: SK_CARD_PAD,
    paddingTop: 8,
    paddingBottom: 100,
  },
  skStatsTopRow: {
    flexDirection: 'row',
    gap: SK_CARD_GAP,
    height: SK_HERO_H,
    marginBottom: SK_CARD_GAP,
  },
  skHeroStat: {
    borderRadius: 18,
  },
  skSideCol: {
    gap: SK_CARD_GAP,
  },
  skSideStat: {
    width: '100%',
    borderRadius: 16,
  },
  skActionsRow: {
    flexDirection: 'row',
    gap: SK_CARD_GAP,
    marginBottom: SK_CARD_GAP,
  },
  skActionStat: {
    minHeight: 64,
    borderRadius: 16,
  },
  skRewardRow: {
    height: 92,
    borderRadius: 18,
    marginBottom: 12,
  },
});

export default function HomeScreen() {
  const router = useThrottledRouter();
  const { t } = useTranslation('home');
  const showModal = useAppModal((s) => s.showModal);
  const { session } = useSession();
  const { activeGym, isUnlocked } = useTheme();
  const branding = useBranding();
  const { getActiveGymId, homeGymId, previewGymId } = useGymStore();
  const { updateHomeGym, loadActiveGym } = useGymData();
  const activeGymId = getActiveGymId();
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  const unreadNotifCount = useUnreadNotificationCount();

  // Fade-in animation for smooth transition from splash
  const fadeOpacity = useSharedValue(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  /** 0 = cold-start skeleton overlay visible; 1 = real dashboard revealed (crossfade + scale). */
  const coldStartReveal = useSharedValue(0);
  const [bootOverlayMounted, setBootOverlayMounted] = useState(true);
  const bootRevealStartedRef = useRef(false);

  const fadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  /** Dashboard shell: combines focus fade + cold-start handoff from skeleton. */
  const dashboardShellStyle = useAnimatedStyle(() => {
    const reveal = coldStartReveal.value;
    const fade = fadeOpacity.value;
    return {
      opacity: reveal * fade,
      transform: [
        { scale: interpolate(reveal, [0, 0.35, 1], [0.96, 0.985, 1]) },
      ],
    };
  });

  const bootSkeletonLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(coldStartReveal.value, [0, 0.55, 1], [1, 0.25, 0]),
    transform: [{ translateY: interpolate(coldStartReveal.value, [0, 1], [0, -6]) }],
  }));
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetLogoLoadFailed, setSheetLogoLoadFailed] = useState(false);
  const activityRingsRef = useRef<ActivityRingsHandle>(null);
  const insets = useSafeAreaInsets();

  // Pager state for swipeable ring hub
  const [activePage, setActivePage] = useState(0);
  const heroPagerScrollPosition = useSharedValue(0);
  const heroPagerRef = useRef<HomeHeroPagerHandle>(null);

  // ── Single scroll shared value — drives all collapse animations ──
  const scrollY = useSharedValue(0);
  // Measured hero block height (set via onLayout)
  const heroH = useSharedValue(230);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollY.value = e.contentOffset.y;
    },
  });

  // collapseProgress: 0 = hero fully visible, 1 = hero scrolled away
  const collapseProgress = useDerivedValue(() =>
    Math.min(Math.max(scrollY.value / (heroH.value || 230), 0), 1)
  );

  // Hero fades as it scrolls away (the ScrollView natively moves it up — no translateY needed)
  const heroAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress.value, [0, 0.5, 1], [1, 0.6, 0]),
  }));

  useEffect(() => {
    setSheetLogoLoadFailed(false);
  }, [activeGym?.logo_url]);

  const TAB_KEYS = ['activity', 'compete', 'challenges', 'arenas'] as const;
  const TAB_ACCENTS: Record<string, string> = {
    activity: branding.primary,
    compete: '#EAB308',
    challenges: '#FF9F4A',
    arenas: '#22D3EE',
  };

  // Badge data for earned badge count — filtered to active gym + global badges
  const { badges: allEarnedBadges, refresh: refreshBadges } = useUserBadges();
  const earnedBadges = useMemo(() => {
    if (!activeGymId) return allEarnedBadges;
    return allEarnedBadges.filter(
      (b) => b.badge_type === 'global' || b.gym_id === activeGymId,
    );
  }, [allEarnedBadges, activeGymId]);

  // ── New stats hook (streak, todayDrops, lastWorkout, closestReward, weeklyActivity) ──
  const { stats: homeStats, checkinStatus: homeCheckinStatus, refresh: refreshStats } = useHomeStats(activeGymId);

  // Available arenas
  const { arenas: availableArenas, refresh: refreshArenas } = useAvailableArenas();
  const activeArenas = availableArenas ? availableArenas.filter(a => a.arena_status !== 'ended') : [];

  // Happy Hour — upcoming windows card
  const upcomingHH = useUpcomingHappyHours(activeGymId);

  // Drop limits for activity rings
  const dropLimits = useDropLimitStatus(activeGymId);

  const competeStats = useCompeteStats(activeGymId);
  const { rewards: weeklyRankRewards } = useLeaderboardRewards(activeGymId, 'weekly');
  const { rewards: monthlyRankRewards } = useLeaderboardRewards(activeGymId, 'monthly');
  const { pending: pendingPrizes } = useMyLeaderboardPrizes(activeGymId);
  // Gauge rank uses weekly first, then monthly, then all_time as fallback.
  // Period label in gauge must match the source period to avoid mismatched text.
  const rankForGauge = useMemo(() => {
    const ws = competeStats.stats.weekly;
    if (ws.rank > 0) {
      return {
        rank: ws.rank,
        totalMembers: ws.totalMembers,
        period: 'weekly' as LeaderboardPeriod,
        dropsToFirst: ws.dropsToFirst,
      };
    }
    const ms = competeStats.stats.monthly;
    if (ms.rank > 0) {
      return {
        rank: ms.rank,
        totalMembers: ms.totalMembers,
        period: 'monthly' as LeaderboardPeriod,
        dropsToFirst: ms.dropsToFirst,
      };
    }
    const at = competeStats.stats.allTime;
    if (at.rank > 0) {
      return {
        rank: at.rank,
        totalMembers: at.totalMembers,
        period: 'all_time' as LeaderboardPeriod,
        dropsToFirst: at.dropsToFirst,
      };
    }
    return {
      rank: 0,
      totalMembers: ws.totalMembers || ms.totalMembers || at.totalMembers,
      period: 'weekly' as LeaderboardPeriod,
      dropsToFirst: 0,
    };
  }, [competeStats.stats.weekly, competeStats.stats.monthly, competeStats.stats.allTime]);
  const gaugeRewardText = useMemo(() => {
    if (rankForGauge.rank <= 0) return null;
    const rewardPool =
      rankForGauge.period === 'monthly'
        ? monthlyRankRewards
        : rankForGauge.period === 'weekly'
          ? weeklyRankRewards
          : [];
    const reward = rewardPool.find((r) => r.rank_position === rankForGauge.rank);
    if (!reward) return null;
    const rewardLabel = reward.value ? `${reward.value} ${reward.reward_name}` : reward.reward_name;
    return t('prizes.gaugeReward', { reward: rewardLabel, rank: rankForGauge.rank });
  }, [rankForGauge, weeklyRankRewards, monthlyRankRewards, t]);

  // AGENT NOTE: [2026-04-23] - mobile-coder
  // Replaced useRealtimeRefresh({ table: 'drops_transactions', ... }) with
  // useForegroundRefresh. Rationale: drops_transactions was dropped from the
  // supabase_realtime publication (migration 20260423210000_trim_realtime_hot_tables.sql)
  // because its per-row WAL broadcast was stalling the Realtime decoder by up
  // to 10 s on prod, causing all authenticated requests to time out. The
  // focus-based refresh in the useFocusEffect below handles in-app navigation;
  // the hook below handles background→foreground transitions.
  useForegroundRefresh({
    enabled: !!session?.user,
    onForeground: useCallback(() => {
      refreshStats?.();
      refreshLocalDrops();
      dropLimits.refresh();
      competeStats.refresh();
      refreshBadges();
    }, [refreshStats, refreshLocalDrops, dropLimits.refresh, competeStats.refresh, refreshBadges]),
  });

  // Navigate to invite-friend when a deep-link referral code is pending.
  // invite-friend.tsx captures + clears the store code on mount so
  // returning here won't re-trigger.
  const pendingReferralCode = usePendingReferralStore((s) => s.pendingCode);

  // AGENT NOTE: [2026-04-23] - mobile-coder
  // checkinStatus now comes from useHomeStats (get_home_dashboard RPC) instead
  // of a separate rpc('get_checkin_status') call. Migration
  // 20260423220000_get_home_dashboard_rpc.sql folded it into the combined
  // dashboard payload, eliminating one round-trip per home-screen mount/focus.
  const checkinStatus = homeCheckinStatus;

  const loadData = useCallback(async (silent = false) => {
    if (!session?.user) return;

    if (!silent && !hasLoadedOnce.current) {
      setLoading(true);
    }

    try {
      const { data: profileData } = await supabase.rpc('get_my_profile');

      if (profileData) {
        setProfile(profileData);
      }
      hasLoadedOnce.current = true;
    } catch (error) {
      log.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  /** Crossfade + scale from cold-start skeleton → real dashboard once profile exists or first fetch finishes. */
  useEffect(() => {
    if (!homeGymId || !session?.user) return;
    if (bootRevealStartedRef.current) return;

    const ready = !!profile?.id || (!loading && hasLoadedOnce.current);
    if (!ready) return;

    bootRevealStartedRef.current = true;
    coldStartReveal.value = withTiming(
      1,
      {
        duration: profile?.id ? 620 : 400,
        easing: Easing.bezier(0.33, 1, 0.32, 1),
      },
      (finished) => {
        if (finished) runOnJS(setBootOverlayMounted)(false);
      },
    );
  }, [homeGymId, session?.user, profile?.id, loading]);

  // Badge notifications with confetti
  const { clearNewBadge } = useBadgeNotifications({
    onBadgeEarned: (badge) => {
      log.debug('Badge earned!', badge);
      // Keep home challenge gauge/cards in sync with newly awarded badges.
      refreshBadges();
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        clearNewBadge();
      }, 3000);
    },
  });

  // Load challenge progress for all machine types
  const { challenges: allChallenges, loading: challengesLoading, refresh: refreshChallenges } = useChallengeProgress(activeGymId, null);
  
  // Parallax background shift — driven continuously by onPageScroll offset
  // Image is PARALLAX_EXTRA wider and starts offset by -half so we have buffer in both directions
  const bgParallaxStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          heroPagerScrollPosition.value,
          [0, 1, 2, 3],
          [0, -PARALLAX_SHIFT, -PARALLAX_SHIFT * 2, -PARALLAX_SHIFT * 3],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        ),
      },
    ],
  }));

  // Cumulative challenge progress for BadgeRing
  const challengeRingData = useMemo(() => {
    const total = allChallenges.length;
    const completed = allChallenges.filter((c) => c.is_completed).length;
    return { completedCount: completed, totalCount: total, earnedBadgeCount: earnedBadges.length };
  }, [allChallenges, earnedBadges]);

  // Tab bar definitions for SliderTabs inside the bottom sheet
  const sheetTabs: SliderTab[] = useMemo(() => [
    { key: 'activity', label: t('pagerTabs.activity'), icon: 'pulse-outline' },
    { key: 'compete', label: t('pagerTabs.compete'), icon: 'podium-outline' },
    { key: 'challenges', label: t('pagerTabs.challenges'), icon: 'flame-outline' },
    { key: 'arenas', label: t('pagerTabs.arenas'), icon: 'shield-outline' },
  ], [t]);

  const activeTabKey = TAB_KEYS[activePage] ?? 'activity';

  // Hero pager -> tab bar
  const handleHeroPagerChange = useCallback((page: number) => {
    setActivePage(page);
  }, []);

  // Tab bar -> hero pager
  const handleTabChange = useCallback((key: string) => {
    const idx = TAB_KEYS.indexOf(key as typeof TAB_KEYS[number]);
    if (idx >= 0 && idx !== activePage) {
      setActivePage(idx);
      heroPagerRef.current?.setPage(idx);
    }
  }, [activePage]);

  // Load data when session or active gym changes
  // First load shows spinner, subsequent gym switches refresh silently
  useEffect(() => {
    if (session?.user) {
      loadData(hasLoadedOnce.current); // silent if already loaded once
      refreshLocalDrops();
    }
  }, [session, homeGymId, previewGymId, activeGymId]);

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated) {
        fadeOpacity.value = withTiming(1, {
          duration: 400,
          easing: Easing.out(Easing.ease),
        });
        setHasAnimated(true);
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (pendingReferralCode && session?.user) {
        timer = setTimeout(() => {
          router.push('/invite-friend');
        }, 600);
      }

      if (!session?.user) {
        return () => {
          if (timer) clearTimeout(timer);
        };
      }

      refreshLocalDrops();
      void Promise.all([
        loadData(true),
        // refreshStats now also refreshes checkin_status (see useHomeStats).
        ...(activeGymId
          ? [
              refreshChallenges?.() ?? Promise.resolve(),
              refreshStats?.() ?? Promise.resolve(),
              refreshArenas?.() ?? Promise.resolve(),
              dropLimits.refresh(),
              competeStats.refresh(),
              refreshBadges(),
            ]
          : []),
      ]);

      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [
      hasAnimated,
      fadeOpacity,
      pendingReferralCode,
      session?.user,
      activeGymId,
      router,
      loadData,
      refreshLocalDrops,
      refreshChallenges,
      refreshStats,
      refreshArenas,
      dropLimits.refresh,
      competeStats.refresh,
      refreshBadges,
    ])
  );

  useFocusEffect(
    useCallback(() => {
      activityRingsRef.current?.replay();
    }, [])
  );

  // ── Available gyms (for empty state) ──
  const [availableGyms, setAvailableGyms] = useState<{id: string; name: string; city: string | null; address: string | null; logo_url: string | null; primary_color: string | null}[]>([]);

  useEffect(() => {
    if (homeGymId) return;

    const loadGyms = async () => {
      try {
        const { data: gymsData, error } = await supabase
          .from('gyms')
          .select('id, name, city, address, owner_id, is_active, is_mobile_listed')
          .eq('is_active', true)
          .eq('is_mobile_listed', true)
          .order('name')
          .limit(10);

        if (error) {
          log.warn('[Home] Gyms query failed, trying fallback:', error.message);
          const { data: fallbackData } = await supabase
            .from('gyms')
            .select('id, name, city, address, owner_id')
            .eq('is_active', true)
            .limit(10);
          if (fallbackData) {
            setAvailableGyms(fallbackData.map(g => ({ ...g, logo_url: null, primary_color: null })));
          }
          return;
        }

        if (!gymsData?.length) {
          if (__DEV__) log.debug('[Home] No available gyms found');
          return;
        }

        // Fetch logo + brand color from owner_branding for gyms that have an owner
        const ownerIds = [...new Set(gymsData.filter(g => g.owner_id).map(g => g.owner_id!))];
        let logoMap: Record<string, string> = {};
        let colorMap: Record<string, string> = {};
        if (ownerIds.length > 0) {
          const { data: brandingData } = await supabase
            .from('owner_branding')
            .select('owner_id, logo_url, primary_color')
            .in('owner_id', ownerIds);
          if (brandingData) {
            logoMap = Object.fromEntries(brandingData.map(b => [b.owner_id, b.logo_url]));
            colorMap = Object.fromEntries(
              brandingData
                .filter(b => b.primary_color)
                .map(b => [b.owner_id, b.primary_color!])
            );
          }
        }

        const gymsWithBranding = gymsData.map(g => ({
          ...g,
          logo_url: (g.owner_id && logoMap[g.owner_id]) || null,
          primary_color: (g.owner_id && colorMap[g.owner_id]) || null,
        }));

        if (__DEV__) log.debug('[Home] Available gyms:', gymsWithBranding.length);
        setAvailableGyms(gymsWithBranding);
      } catch (e) {
        log.warn('[Home] Unexpected error loading gyms:', e);
      }
    };

    loadGyms();
  }, [homeGymId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadData(true),
        activeGymId ? loadActiveGym(activeGymId) : Promise.resolve(),
        refreshLocalDrops(),
        // refreshStats now also refreshes checkin_status (see useHomeStats).
        ...(activeGymId
          ? [
              refreshChallenges?.() ?? Promise.resolve(),
              refreshStats?.() ?? Promise.resolve(),
              refreshArenas?.() ?? Promise.resolve(),
              dropLimits.refresh(),
              competeStats.refresh(),
              refreshBadges(),
            ]
          : []),
      ]);
    } catch (error) {
      log.error('Pull-to-refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeGymId, loadData, loadActiveGym, refreshLocalDrops, refreshChallenges, refreshStats, refreshArenas, dropLimits.refresh, competeStats.refresh, refreshBadges]);


  const handleQRPress = useCallback(() => {
    router.push('/scan');
  }, [router]);

  // Stable navigation callbacks for sheet content (avoids breaking React.memo)
  const navToScan = handleQRPress;
  const navToHappyHours = useCallback(() => router.push('/happy-hours' as any), [router]);
  const navToWorkoutHistory = useCallback(() => router.push('/workout-history'), [router]);
  const navToStatsToday = useCallback(() => router.push('/stats?period=today' as any), [router]);
  const navToStatsWeek = useCallback(() => router.push('/stats?period=week' as any), [router]);
  const navToStore = useCallback(() => router.push('/store'), [router]);
  const navToLeaderboard = useCallback(
    (period: string) => router.push(`/leaderboard?period=${encodeURIComponent(period)}` as any),
    [router],
  );
  const navToInviteFriend = useCallback(() => router.push('/invite-friend'), [router]);
  const navToSmartCoach = useCallback(() => { if (isUnlocked) router.push('/smartcoach'); }, [router, isUnlocked]);
  const navToChallenge = useCallback((id: string) => router.push({ pathname: '/challenge-detail', params: { challengeId: id, gymId: activeGymId || '' } }), [router, activeGymId]);
  const navToActiveChallenges = useCallback(() => { if (isUnlocked) router.push({ pathname: '/challenges', params: { tab: 'active' } } as any); }, [router, isUnlocked]);
  const navToCompletedChallenges = useCallback(() => { if (isUnlocked) router.push({ pathname: '/challenges', params: { tab: 'completed' } } as any); }, [router, isUnlocked]);
  const navToTrophyRoom = useCallback(() => router.push('/trophy-room'), [router]);
  const navToArena = useCallback((id: string) => router.push({ pathname: '/arena/[id]', params: { id } }), [router]);
  const navToAllArenas = useCallback(() => router.push('/arenas'), [router]);

  const handleSetAsHomeGym = async () => {
    if (!activeGym) return;
    showModal({
      title: t('setAsHomeGym'),
      body: t('setAsHomeGymMsg', { name: activeGym.name }),
      buttons: [
        { label: t('common:cancel'), style: 'cancel' },
        {
          label: t('setAsHome'),
          onPress: async () => {
            try {
              await updateHomeGym(activeGym.id);
            } catch {
              showModal({ title: t('common:error'), body: t('failedToUpdateGym') });
            }
          },
        },
      ],
    });
  };

  // ── Empty state for users with no home gym ──
  if (!homeGymId) {
    return (
      <Animated.View style={[{ flex: 1, backgroundColor: '#000000' }, fadeAnimatedStyle]}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <LinearGradient
            colors={['#000000', '#0A0E1A', '#000000'] as any}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* ─── SECTION 1 — HEADER (fixed) ─── */}
          <View style={es.header}>
            <TouchableOpacity
              style={es.headerLeft}
              onPress={() => router.push('/profile')}
              activeOpacity={0.7}
            >
              <View style={es.avatarCircle}>
                {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
                  <Image source={localAvatarSource(profile.avatar_url)} style={es.avatarImage} transition={200} />
                ) : (
                  <Text style={es.avatarText}>
                    {profile?.avatar_url || profile?.username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                )}
              </View>
              <Text style={es.username}>{profile?.username || t('common:user')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={branding.primary}
                colors={[branding.primary]}
                progressBackgroundColor="transparent"
              />
            }
          >
            {/* ─── SECTION 2 — DROPS HERO (dimmed preview) ─── */}
            <Animated.View entering={FadeInDown.delay(0).duration(500)}>
              <View style={es.dropsHero}>
                <View style={es.dropsRing}>
                  {/* Dashed outer ring */}
                  <View style={es.dropsRingDashed} />
                  {/* Center content */}
                  <View style={es.dropsCenter}>
                    <Text style={es.dropsNumber}>0</Text>
                    <Text style={es.dropsLabel}>{t('drops')}</Text>
                    <View style={es.dropsDivider} />
                    <View style={es.lockRow}>
                      <Ionicons name="lock-closed-outline" size={14} color="rgba(255,255,255,0.30)" />
                      <Text style={es.lockText}>{t('scanToUnlock')}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* ─── SECTION 3 — QUICK STATS PREVIEW (locked) ─── */}
            <Animated.View entering={FadeInDown.delay(100).duration(500)}>
              <View style={es.statsRow}>
                {[
                  { icon: 'flame-outline' as const, label: t('statsStreak') },
                  { icon: 'water-outline' as const, label: t('statsToday') },
                  { icon: 'time-outline' as const, label: t('statsLast') },
                ].map((item, i) => (
                  <View key={i} style={es.statPill}>
                    <PlatformBlur intensity={30} tint="dark" style={es.statPillBlur} androidColor="rgba(20,20,30,0.95)">
                      <Ionicons name={item.icon} size={18} color="rgba(255,255,255,0.15)" />
                      <Text style={es.statPillValue}>—</Text>
                      <Text style={es.statPillLabel}>{item.label}</Text>
                    </PlatformBlur>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ─── SECTION 4 — MAIN CTA CARD ─── */}
            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
              <View style={es.ctaCardOuter}>
                <PlatformBlur intensity={50} tint="dark" style={es.ctaCardBlur} androidColor="rgba(20,20,30,0.97)">
                  {/* QR icon with glow */}
                  <View style={es.ctaIconWrapper}>
                    <View style={es.ctaIconGlow} />
                    <View style={es.ctaIconCircle}>
                      <Ionicons name="qr-code-outline" size={32} color={appTheme.colors.primary} />
                    </View>
                  </View>

                  <Text style={es.ctaTitle}>{t('scanQrCode')}</Text>
                  <Text style={es.ctaSubtitle}>
                    {t('scanQrSubtitle')}
                  </Text>

                  {/* How it works — 3 inline steps */}
                  <View style={es.stepsRow}>
                    <View style={es.step}>
                      <View style={es.stepCircle}>
                        <Text style={es.stepNum}>1</Text>
                      </View>
                      <Text style={es.stepLabel}>{t('step1')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.15)" style={es.stepArrow} />
                    <View style={es.step}>
                      <View style={es.stepCircle}>
                        <Text style={es.stepNum}>2</Text>
                      </View>
                      <Text style={es.stepLabel}>{t('step2')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.15)" style={es.stepArrow} />
                    <View style={es.step}>
                      <View style={es.stepCircle}>
                        <Text style={es.stepNum}>3</Text>
                      </View>
                      <Text style={es.stepLabel}>{t('step3')}</Text>
                    </View>
                  </View>
                </PlatformBlur>
              </View>
            </Animated.View>

            {/* ─── SECTION 4b — REFERRAL CODE BANNER ─── */}
            <Animated.View entering={FadeInDown.delay(250).duration(500)}>
              <TouchableOpacity
                style={[es.referralBanner, { borderColor: hexToRgba(branding.primary, 0.18) }]}
                onPress={() => router.push('/invite-friend')}
                activeOpacity={0.7}
              >
                <PlatformBlur intensity={35} tint="dark" style={es.referralBannerBlur} androidColor="rgba(14,15,26,0.96)">
                  <View style={[es.referralIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                    <Ionicons name="ticket-outline" size={20} color={branding.primary} />
                  </View>
                  <View style={es.referralTextBlock}>
                    <Text style={es.referralTitle}>{t('referralBanner.title')}</Text>
                    <Text style={es.referralSub}>{t('referralBanner.subtitle')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                </PlatformBlur>
              </TouchableOpacity>
            </Animated.View>

            {/* ─── SECTION 5 — AVAILABLE GYMS + SUGGEST ─── */}
            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
              <View style={es.gymsSection}>
                {availableGyms.length > 0 && (
                  <>
                    <View style={es.gymsSectionHeader}>
                      <Text style={es.gymsSectionTitle}>{t('availableGyms')}</Text>
                      <Text style={es.gymsSectionCount}>{t('gymsCount', { count: availableGyms.length })}</Text>
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={es.gymScrollContent}
                    >
                      {availableGyms.map((gym) => {
                        const gymColor = gym.primary_color || branding.primary;
                        return (
                          <TouchableOpacity
                            key={gym.id}
                            activeOpacity={0.75}
                            onPress={() => router.push({ pathname: '/gym-detail', params: { gymId: gym.id } })}
                          >
                            <PlatformBlur intensity={50} tint="dark" style={[es.gymCard, { borderColor: hexToRgba(gymColor, 0.18) }]} androidColor="rgba(14,14,24,0.97)">
                              {/* Top accent line */}
                              <View style={[es.gymCardAccent, { backgroundColor: hexToRgba(gymColor, 0.5) }]} />
                              <View style={es.gymCardInner}>
                                {/* Logo */}
                                <View style={es.gymLogoWrap}>
                                  {gym.logo_url ? (
                                    <Image source={gym.logo_url} style={es.gymLogo} contentFit="contain" transition={200} />
                                  ) : (
                                    <View style={[es.gymLogoPlaceholder, { borderColor: hexToRgba(gymColor, 0.3), backgroundColor: hexToRgba(gymColor, 0.1) }]}>
                                      <Ionicons name="fitness" size={24} color={gymColor} />
                                    </View>
                                  )}
                                </View>
                                {/* Info */}
                                <View style={es.gymInfo}>
                                  <Text style={es.gymName} numberOfLines={2}>{gym.name}</Text>
                                  {(gym.city || gym.address) && (
                                    <View style={es.gymLocationRow}>
                                      <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.3)" />
                                      <Text style={es.gymCity} numberOfLines={1}>{gym.city || gym.address}</Text>
                                    </View>
                                  )}
                                </View>
                                {/* CTA */}
                                <View style={[es.gymSelectBtn, { borderColor: hexToRgba(gymColor, 0.35), backgroundColor: hexToRgba(gymColor, 0.1) }]}>
                                  <Text style={[es.gymSelectBtnText, { color: gymColor }]}>{t('viewGym')}</Text>
                                </View>
                              </View>
                            </PlatformBlur>
                          </TouchableOpacity>
                        );
                      })}

                      <SuggestGymCardWithSheet variant="homeCarousel" brandColor={branding.primary} />
                    </ScrollView>
                  </>
                )}

                {availableGyms.length === 0 && (
                  <>
                    <View style={es.emptyGymsIntro}>
                      <Text style={es.gymsSectionTitle}>{t('suggestGym')}</Text>
                      <Text style={es.emptyGymsIntroSub}>{t('suggestGymSub')}</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={es.gymScrollContent}
                    >
                      <SuggestGymCardWithSheet variant="homeCarousel" brandColor={branding.primary} />
                    </ScrollView>
                  </>
                )}
              </View>
            </Animated.View>

            {/* ─── SECTION 6 — PREVIEW CARDS (locked features) ─── */}
            <Animated.View entering={FadeInDown.delay(400).duration(500)}>
              <View style={es.previewSection}>
                <Text style={es.previewTitle}>{t('whatsWaiting')}</Text>
                <View style={es.previewGrid}>
                  <View style={es.previewRow}>
                    <PlatformBlur intensity={30} tint="dark" style={es.previewCard} androidColor="rgba(20,20,30,0.95)">
                      <Ionicons name="podium-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('leaderboard')}</Text>
                      <Text style={es.previewCardSub}>{t('leaderboardSub')}</Text>
                    </PlatformBlur>
                    <PlatformBlur intensity={30} tint="dark" style={es.previewCard} androidColor="rgba(20,20,30,0.95)">
                      <Ionicons name="gift-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('rewards')}</Text>
                      <Text style={es.previewCardSub}>{t('rewardsSub')}</Text>
                    </PlatformBlur>
                  </View>
                  <View style={es.previewRow}>
                    <PlatformBlur intensity={30} tint="dark" style={es.previewCard} androidColor="rgba(20,20,30,0.95)">
                      <Ionicons name="flame-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('challengesLabel')}</Text>
                      <Text style={es.previewCardSub}>{t('challengesSub')}</Text>
                    </PlatformBlur>
                    <PlatformBlur intensity={30} tint="dark" style={es.previewCard} androidColor="rgba(20,20,30,0.95)">
                      <Ionicons name="trophy-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('arenasLabel')}</Text>
                      <Text style={es.previewCardSub}>{t('arenasSub')}</Text>
                    </PlatformBlur>
                  </View>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          <View style={[styles.startWorkoutWrap, { bottom: Math.max(insets.bottom + 10, 16) }]}>
            <TouchableOpacity style={[styles.startWorkoutButton, { shadowColor: branding.primary }]} onPress={handleQRPress} activeOpacity={0.88}>
              <LinearGradient
                colors={[hexToRgba(branding.primaryDark, 0.95), hexToRgba(branding.primary, 0.95)]}
                style={styles.startWorkoutGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.startWorkoutContent}>
                  <Ionicons name="qr-code" size={20} color={branding.onPrimary} />
                  <Text style={[styles.startWorkoutText, { color: branding.onPrimary }]}>{t('startWorkout')}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </SafeAreaView>
      </Animated.View>
    );
  }

  const tabAccent = TAB_ACCENTS[activeTabKey] ?? branding.primary;

  // Sheet backgrounds — same recipe as VerificationSheet:
  //   iOS: semi-transparent base so PlatformBlur provides the frosted-glass look
  //   Android: fully opaque dark base (no system blur)
  //   Branding is injected via the LinearGradient overlay inside the blur layer
  const SHEET_BG_SOLID   = 'rgba(12,15,24,0.98)' as const;  // androidColor + content area
  const SHEET_BG_BLUR_iOS = 'rgba(10,10,20,0.55)' as const; // iOS blur base (same as VerificationSheet)
  const sheetBgSolid = Platform.OS === 'android' ? SHEET_BG_SOLID : SHEET_BG_BLUR_iOS;

  const sheetBackdropColors = Platform.OS === 'android'
    ? (['rgba(12,15,24,0.00)', 'rgba(12,15,24,0.10)', 'rgba(12,15,24,0.18)', 'rgba(12,15,24,0.24)'] as const)
    : (['rgba(10,10,20,0.00)', 'rgba(10,10,20,0.62)', 'rgba(10,10,20,0.93)', 'rgba(10,10,20,0.97)'] as const);
  const fabBottomMaskColors = Platform.OS === 'android'
    ? (['rgba(12,15,24,0.00)', 'rgba(12,15,24,0.74)', 'rgba(12,15,24,0.96)'] as const)
    : (['rgba(10,10,20,0.00)', 'rgba(10,10,20,0.58)', 'rgba(10,10,20,0.90)'] as const);
  const HEADER_H = 56;
  const TAB_BAR_H = 48;
  // Reserve space for sticky section (tab bar only)
  const sheetMinHeight = SCREEN_HEIGHT - insets.top - HEADER_H - TAB_BAR_H;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Animated.View style={[{ flex: 1, backgroundColor: '#000000' }, dashboardShellStyle]}>
        <SafeAreaView style={styles.container} edges={['top']}>

        {/* ── Background — always fills screen ── */}
        {activeGym?.background_url ? (
          <View style={StyleSheet.absoluteFillObject}>
            <Animated.View style={[styles.parallaxBg, bgParallaxStyle]}>
              <Image
                source={activeGym.background_url}
                style={styles.parallaxImg}
                contentFit="cover"
                transition={200}
              />
            </Animated.View>
            <LinearGradient
              colors={['rgba(0,0,0,0.30)', 'rgba(8,8,8,0.50)', 'rgba(0,0,0,0.65)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        ) : (
          <LinearGradient
            colors={['#080808', '#0A0E1A', '#080808'] as any}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* ── Fixed header — sits above the scroll, always visible ── */}
        <View style={styles.fixedHeader}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
          >
            <View style={styles.avatarContainer}>
              {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
                <Image source={localAvatarSource(profile.avatar_url)} style={styles.avatarImage} transition={200} />
              ) : (
                <Text style={styles.avatarText}>
                  {profile?.avatar_url || profile?.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              )}
            </View>
            <Text style={styles.username}>{profile?.username || t('common:user')}</Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerActionButton, { borderColor: hexToRgba(branding.primary, 0.25) }]}
              onPress={() => router.push('/store')}
              activeOpacity={0.75}
            >
              <PlatformBlur intensity={20} tint="dark" style={styles.headerActionBlur} androidColor="rgba(255,255,255,0.05)">
                <Ionicons name="storefront-outline" size={18} color={hexToRgba(branding.primary, 0.9)} />
              </PlatformBlur>
            </TouchableOpacity>
            <View style={styles.headerActionWrap}>
              <TouchableOpacity
                style={[styles.headerActionButton, { borderColor: hexToRgba(branding.primary, 0.25) }]}
                onPress={() => router.push('/notifications')}
                activeOpacity={0.75}
              >
                <PlatformBlur intensity={20} tint="dark" style={styles.headerActionBlur} androidColor="rgba(255,255,255,0.05)">
                  <Ionicons name="notifications-outline" size={18} color={hexToRgba(branding.primary, 0.9)} />
                </PlatformBlur>
              </TouchableOpacity>
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Static sheet backdrop: stays fixed while content scrolls above it */}
        <View pointerEvents="none" style={styles.sheetStaticBackdrop}>
          <LinearGradient
            colors={sheetBackdropColors}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* ── Single unified scroll — the entire screen below the fixed header ── */}
        <Animated.ScrollView
          style={styles.outerScroll}
          contentContainerStyle={styles.outerScrollContent}
          stickyHeaderIndices={[1]}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          scrollIndicatorInsets={{ top: 0, left: 0, bottom: 0, right: 0 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          bounces
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={branding.primary}
              colors={[branding.primary]}
            />
          }
        >
          {/* ── [0] Hero block — scrolls away naturally ── */}
          <Animated.View
            style={heroAnimStyle}
            onLayout={(e) => { heroH.value = e.nativeEvent.layout.height; }}
          >
            <HomeHeroPager
              ref={heroPagerRef}
              activityRingsRef={activityRingsRef}
              streakDays={homeStats.streak}
              todayDrops={homeStats.todayCappedDrops}
              todayBonusDrops={homeStats.todayBonusDrops}
              dailyCap={dropLimits.maxDropsPerDay}
              totalGymDrops={localDrops}
              onActivityRingPress={() => router.push('/wallet')}
              onCompeteRingPress={() => router.push('/leaderboard')}
              onChallengesRingPress={() => router.push('/challenges')}
              onArenasRingPress={() => router.push('/arenas')}
              totalMembers={rankForGauge.totalMembers}
              rank={rankForGauge.rank}
              rankPeriod={rankForGauge.period}
              rankDropsToFirst={rankForGauge.dropsToFirst}
              rankRewardText={gaugeRewardText}
              challengeCompletedCount={challengeRingData.completedCount}
              challengeTotalCount={challengeRingData.totalCount}
              earnedBadgeCount={challengeRingData.earnedBadgeCount}
              activeArenas={availableArenas ?? []}
              activePage={activePage}
              onPageChange={handleHeroPagerChange}
              scrollPosition={heroPagerScrollPosition}
            />

            {/* Gym logo badge */}
            <View style={styles.sheetLogoBadgeWrap} pointerEvents="none">
              <View style={[styles.sheetLogoBadge, { borderColor: hexToRgba(branding.primary, 0.55) }]}>
                {activeGym?.logo_url && !sheetLogoLoadFailed ? (
                  <Image
                    source={{ uri: activeGym.logo_url }}
                    style={styles.sheetLogoBadgeImage}
                    contentFit="cover"
                    transition={180}
                    cachePolicy="memory-disk"
                    onError={() => setSheetLogoLoadFailed(true)}
                  />
                ) : (
                  <Ionicons name="fitness-outline" size={16} color="rgba(255,255,255,0.70)" />
                )}
              </View>
            </View>
          </Animated.View>

          {/* ── [1] Sticky section — tab bar ── */}
          <View style={[styles.stickySection, styles.dashboardSheetBackground, { backgroundColor: sheetBgSolid }]}>
            <PlatformBlur
              intensity={55}
              tint="dark"
              style={[styles.stickySectionBlur, { backgroundColor: sheetBgSolid }]}
              androidColor={SHEET_BG_SOLID}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.10)', hexToRgba(branding.primary, 0.06), 'rgba(12,12,22,0.0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <SliderTabsBar
                tabs={sheetTabs}
                activeKey={activeTabKey}
                onChange={handleTabChange}
                accentColor={tabAccent}
                barStyle={styles.sheetTabBar}
              />
            </PlatformBlur>
          </View>

          {/* ── [2] Sheet content — tab pager with horizontal swipe ── */}
          <View style={[styles.sheetContent, { backgroundColor: SHEET_BG_SOLID }]}>
            <SliderTabs
              tabs={sheetTabs}
              activeKey={activeTabKey}
              onChange={handleTabChange}
              accentColor={tabAccent}
              pageHeight={sheetMinHeight}
              style={styles.sheetPagerClip}
              hideBar
            >
              <SheetActivityContent
                homeStats={homeStats}
                dropLimits={dropLimits}
                checkinStatus={checkinStatus}
                upcomingHH={upcomingHH}
                isHappyHourActive={!!upcomingHH.liveWindow}
                gymName={activeGym?.name ?? ''}
                onCheckinPress={navToScan}
                onHappyHourPress={navToHappyHours}
                onStreakPress={navToWorkoutHistory}
                onTodayPress={navToStatsToday}
                onWeeklyPress={navToStatsWeek}
                onRewardPress={navToStore}
                localDropsBalance={localDrops}
                isUnlocked={isUnlocked}
                onSetAsHomeGym={handleSetAsHomeGym}
                liquidActive={activePage === 0}
              />
              <SheetRankContent
                gymId={activeGymId}
                isUnlocked={isUnlocked}
                hasSession={!!session?.user}
                smartcoachEnabled={!!activeGym?.smartcoach_enabled}
                weekly={competeStats.stats.weekly}
                monthly={competeStats.stats.monthly}
                allTime={competeStats.stats.allTime}
                weeklyRewards={weeklyRankRewards}
                monthlyRewards={monthlyRankRewards}
                pendingLeaderboardPrizes={pendingPrizes}
                onLeaderboardPress={navToLeaderboard}
                onInviteFriend={navToInviteFriend}
                onSmartCoachPress={navToSmartCoach}
              />
              <SheetBadgesContent
                isUnlocked={isUnlocked}
                challenges={allChallenges}
                challengesLoading={challengesLoading}
                gymId={activeGymId}
                earnedBadges={earnedBadges}
                onChallengePress={navToChallenge}
                onViewActiveChallenges={navToActiveChallenges}
                onViewCompletedChallenges={navToCompletedChallenges}
                onTrophyRoomPress={navToTrophyRoom}
              />
              <SheetArenaContent
                isUnlocked={isUnlocked}
                hasSession={!!session?.user}
                activeArenas={activeArenas}
                pendingArenaPrizes={pendingPrizes}
                onArenaPress={navToArena}
                onViewAllArenas={navToAllArenas}
              />
            </SliderTabs>
          </View>
        </Animated.ScrollView>

        {/* Bottom dimming mask — hides sheet content behind FAB area */}
        <View
          pointerEvents="none"
          style={[styles.fabBottomMask, { height: Math.max(insets.bottom + 120, 132) }]}
        >
          <LinearGradient
            colors={fabBottomMaskColors}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* FAB — absolute overlay, always visible */}
        <View style={[styles.startWorkoutWrap, { bottom: Math.max(insets.bottom + 10, 16) }]}>
          <TouchableOpacity style={[styles.startWorkoutButton, { shadowColor: branding.primary }]} onPress={handleQRPress} activeOpacity={0.88}>
            <LinearGradient
              colors={[hexToRgba(branding.primaryDark, 0.95), hexToRgba(branding.primary, 0.95)]}
              style={styles.startWorkoutGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.startWorkoutContent}>
                <Ionicons name="qr-code" size={20} color={branding.onPrimary} />
                <Text style={[styles.startWorkoutText, { color: branding.onPrimary }]}>{t('startWorkout')}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Confetti Effect for Badge Earned */}
        {showConfetti && (
          <ConfettiEffect
            visible={showConfetti}
            onComplete={() => {
              setShowConfetti(false);
              clearNewBadge();
            }}
          />
        )}
      </SafeAreaView>
      </Animated.View>

      {bootOverlayMounted && homeGymId ? (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.bootSkeletonWrap, bootSkeletonLayerStyle]}
          pointerEvents="auto"
        >
          <LinearGradient
            colors={['#080808', '#0A0E1A', '#080808'] as any}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView style={styles.container} edges={['top']}>
            <ColdStartSkeleton brandPrimary={branding.primary} />
          </SafeAreaView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* ─── Layout ────────────────────────────── */
  bootSkeletonWrap: {
    zIndex: 100,
    elevation: 24,
  },
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080808',
  },
  fixedHeader: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    zIndex: 30,
  },
  outerScroll: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
    elevation: 2,
  },
  sheetStaticBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.74,
    zIndex: 1,
    elevation: 0,
  },
  outerScrollContent: {
    flexGrow: 1,
  },
  stickySection: {
    zIndex: 10,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 10,
  },
  stickySectionBlur: {
    overflow: 'hidden',
  },
  sheetContent: {
    overflow: 'hidden',
  },
  sheetPagerClip: {
    overflow: 'hidden',
  },
  tabPager: {
    flex: 1,
  },
  sheetLogoBadgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 12,
  },
  sheetLogoBadge: {
    height: 34,
    width: 94,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: 'rgba(43, 50, 68, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    padding: 2,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  sheetLogoBadgeImage: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
  },
  sheetTabBar: {
    paddingHorizontal: 4,
  },
  parallaxBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH + PARALLAX_EXTRA,
  },
  parallaxImg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH + PARALLAX_EXTRA,
  },
  dashboardSheetBackground: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftColor: 'rgba(255,255,255,0.06)',
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  inviteCta: {
    borderRadius: 18,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden' as const,
    marginBottom: 24,
  },
  inviteCtaBlur: {
    backgroundColor: 'rgba(12, 12, 22, 0.38)',
  },
  inviteCtaGradient: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    gap: 12,
  },
  inviteCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  inviteCtaTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: appTheme.colors.text,
  },
  inviteCtaSub: {
    ...fontStyles.body,
    fontSize: 12,
    marginTop: 2,
  },

  /* ─── Header ────────────────────────────── */
  stickyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 16,
  },
  username: {
    ...fontStyles.heading,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerActionButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  headerActionWrap: {
    width: 38,
    height: 38,
    position: 'relative',
    overflow: 'visible',
    flexShrink: 0,
  },
  headerActionBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 0.75,
    borderColor: '#000',
  },
  notifBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#FFFFFF',
    lineHeight: 13,
  },
  /* ─── Hero Section ──────────────────────── */
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 8,
  },
  heroPanel: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    gap: 10,
  },
  heroMetaBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  heroGymName: {
    ...fontStyles.heading,
    fontSize: 15,
    letterSpacing: 0.6,
  },

  /* ─── Cards Container ───────────────────── */
  cardsContainer: {
    position: 'relative',
    zIndex: 1,
  },
  cardsOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'auto',
  },

  /* ─── Section Headers ───────────────────── */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionCardIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCardLabel: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 19,
  },
  viewAllLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },

  /* ─── Challenges ────────────────────────── */
  challengesSection: {
    marginBottom: 0,
  },
  challengesScrollView: {
    marginHorizontal: -16,
    maxHeight: 204,
  },
  challengesScrollContent: {
    paddingHorizontal: 16,
    paddingRight: 28,
  },
  challengeCardWrapper: {
    marginRight: 12,
    height: 200,
  },
  challengeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    height: '100%',
    width: '100%',
    backgroundColor: 'rgba(12, 12, 22, 0.42)',
  },
  challengeBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    height: '100%',
    width: '100%',
  },
  challengeCardSkeleton: {
    width: '100%',
    height: CHALLENGE_CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    opacity: 0.6,
    borderWidth: 1,
    backgroundColor: 'rgba(12, 12, 22, 0.42)',
  },
  challengeGradient: {
    borderRadius: 16,
    height: '100%',
    width: '100%',
  },
  challengeContent: {
    padding: 16,
    height: '100%',
    justifyContent: 'space-between',
  },
  challengeHeader: {
    marginBottom: 12,
  },
  challengeHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
  challengeType: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 1,
  },
  challengeTimeBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  challengeTimeBadgeText: {
    ...fontStyles.body,
    fontSize: 10,
    color: appTheme.colors.textSecondary,
  },
  challengeName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    lineHeight: 18,
  },
  challengeProgress: {
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    ...fontStyles.body,
    fontSize: 11,
    color: '#B0B0B0',
    letterSpacing: 0.3,
  },
  challengeReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  challengeRewardText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  skeletonBadge: {
    width: 60,
    height: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonTitle: {
    width: '80%',
    height: 16,
    borderRadius: 4,
    marginBottom: 4,
  },
  skeletonProgressText: {
    width: '60%',
    height: 12,
    borderRadius: 4,
    marginTop: 8,
  },
  skeletonReward: {
    width: '50%',
    height: 14,
    borderRadius: 4,
    marginTop: 12,
  },
  seeAllText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  arenaComingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  arenaComingSoonText: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1,
  },
  arenaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  arenaSponsorLogo: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  arenaSponsorPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arenaHomeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  arenaHomeStat: {
    ...fontStyles.body,
    fontSize: 11,
    color: '#B0B0B0',
    letterSpacing: 0.2,
  },
  arenaRankLabel: {
    ...fontStyles.number,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  arenaEmptyState: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(12, 12, 22, 0.42)',
  },
  arenaEmptyBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  arenaEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arenaEmptyTextContainer: {
    flex: 1,
  },
  arenaEmptyTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  arenaEmptySubtitle: {
    ...fontStyles.body,
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 15,
  },

  /* ─── Empty Challenges Banner (slim) ─────── */
  emptyChallengesBanner: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 24,
  },
  emptyChallengesBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  emptyChallengesText: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#808080',
    letterSpacing: 0.2,
    flex: 1,
  },

  /* ─── SmartCoach ────────────────────────── */
  smartCoachSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  smartCoachCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    height: 120,
  },
  smartCoachBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    height: '100%',
    width: '100%',
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  smartCoachGradient: {
    borderRadius: 16,
    height: '100%',
    width: '100%',
  },
  smartCoachContent: {
    padding: 16,
    height: '100%',
    justifyContent: 'center',
  },
  smartCoachHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  smartCoachIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smartCoachTextContainer: {
    flex: 1,
    gap: 4,
  },
  smartCoachTitle: {
    ...fontStyles.heading,
    fontSize: 22,
  },
  smartCoachSubtitle: {
    ...fontStyles.body,
    fontSize: 14,
    letterSpacing: 0.3,
    lineHeight: 18,
  },

  /* ─── Bottom Bento Grid ─────────────────── */
  bottomCardsRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
    position: 'relative',
  },
  featureCardWrapper: {
    flex: 1,
    position: 'relative',
    height: 170,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 1,
  },
  featureCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
    height: '100%',
  },
  featureCardBlur: {
    borderRadius: 20,
    padding: 16,
    flex: 1,
    justifyContent: 'space-between',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 12, 22, 0.38)',
  },
  cardHeader: {
    marginBottom: 8,
    flex: 1,
    justifyContent: 'flex-start',
  },
  cardTitle: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardSubtitle: {
    ...fontStyles.body,
    fontSize: 12,
    color: '#B0B0B0',
    letterSpacing: 0.3,
    lineHeight: 16,
    minHeight: 32,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardAction: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },

  startWorkoutWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
  },
  fabBottomMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 6,
  },
  startWorkoutButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  startWorkoutGradient: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  startWorkoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  startWorkoutText: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 0.3,
  },


});

// ═══════════════════════════════════════════════════════════
// EMPTY STATE STYLES
// ═══════════════════════════════════════════════════════════
const es = StyleSheet.create({
  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 20,
  },
  username: {
    ...fontStyles.number,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  /* ── Drops Hero (dimmed preview) ── */
  dropsHero: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  dropsRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dropsRingDashed: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 110,
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.10)',
    borderStyle: 'dashed',
  },
  dropsCenter: {
    alignItems: 'center',
    gap: 4,
  },
  dropsNumber: {
    ...fontStyles.number,
    fontSize: 64,
    color: 'rgba(255,255,255,0.15)',
  },
  dropsLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.20)',
  },
  dropsDivider: {
    height: 1,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockText: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.30)',
  },

  /* ── Quick Stats Preview (locked) ── */
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statPill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  statPillBlur: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(20,20,30,0.5)',
    overflow: 'hidden',
  },
  statPillValue: {
    ...fontStyles.number,
    fontSize: 18,
    color: 'rgba(255,255,255,0.15)',
  },
  statPillLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.20)',
  },

  /* ── Main CTA Card ── */
  ctaCardOuter: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
    overflow: 'hidden',
  },
  ctaCardBlur: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,30,0.80)',
    overflow: 'hidden',
  },
  ctaIconWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  ctaIconGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,229,255,0.10)',
    top: -8,
    left: -8,
    shadowColor: '#00E5FF',
    shadowRadius: 20,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
  },
  ctaSubtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNum: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#00E5FF',
    letterSpacing: 0,
  },
  stepLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: '#B0B0B0',
    textAlign: 'center',
  },
  stepArrow: {
    alignSelf: 'center',
    marginTop: -12,
  },

  /* ── Available Gyms ── */
  gymsSection: {
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  gymsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gymsSectionTitle: {
    ...fontStyles.heading,
    fontSize: 19,
    color: '#FFFFFF',
  },
  gymsSectionCount: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#B0B0B0',
  },
  emptyGymsIntro: {
    marginBottom: 12,
    gap: 6,
  },
  emptyGymsIntroSub: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#B0B0B0',
    lineHeight: 18,
  },
  gymScrollContent: {
    gap: 10,
    paddingRight: 16,
  },
  gymCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    width: 220,
    backgroundColor: 'rgba(14,14,24,0.82)',
  },
  gymCardAccent: {
    height: 2,
    width: '100%',
  },
  gymCardInner: {
    padding: 14,
    gap: 12,
  },
  gymLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gymLogo: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  gymLogoPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymInfo: {
    gap: 5,
  },
  gymName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  gymLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  gymCity: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  gymSelectBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gymSelectBtnText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  /* ── Preview Cards (locked features) ── */
  referralBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  referralBannerBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  referralIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  referralTextBlock: {
    flex: 1,
  },
  referralTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },
  referralSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  previewSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  previewTitle: {
    ...fontStyles.heading,
    fontSize: 19,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  previewGrid: {
    gap: 8,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewCard: {
    flex: 1,
    height: 90,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: 'rgba(20,20,30,0.50)',
  },
  previewCardTitle: {
    ...fontStyles.heading,
    fontSize: 14,
    color: 'rgba(255,255,255,0.30)',
    textAlign: 'center',
  },
  previewCardSub: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.20)',
    textAlign: 'center',
  },
});
