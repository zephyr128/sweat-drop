import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, RefreshControl } from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing, FadeInDown } from 'react-native-reanimated';
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
import { getNumberStyle, theme as appTheme, fontStyles, hexToRgba} from '@/lib/theme';
import { ConfettiEffect } from '@/components/ConfettiEffect';
import { LockedOverlay } from '@/components/LockedOverlay';
import { ProgressWidget } from '@/components/ProgressWidget';
import { PressableCard } from '@/components/PressableCard';
import { ActivityRings, type ActivityRingsHandle } from '@/components/ActivityRings';
import { StatsCards } from '@/components/StatsCards';
import { LeaderboardPreview } from '@/components/LeaderboardPreview';
import { useDropLimitStatus } from '@/hooks/useDropLimitStatus';
import { useUserRank } from '@/hooks/useUserRank';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { useHomeStats } from '@/hooks/useHomeStats';
import { useAvailableArenas } from '@/hooks/useAvailableArenas';
import { useUpcomingHappyHours } from '@/hooks/useUpcomingHappyHours';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { WaitlistBottomSheet } from '@/components/WaitlistBottomSheet';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_MARGIN = 12;
const CARD_PADDING = 16; // Horizontal padding of ScrollView
// Bottom cards row: two cards with gap between them
const BOTTOM_CARDS_GAP = 16;
const BOTTOM_CARD_WIDTH = (SCREEN_WIDTH - (CARD_PADDING * 2) - BOTTOM_CARDS_GAP) / 2;
const SMARTCOACH_CARD_WIDTH = (BOTTOM_CARD_WIDTH * 2) + BOTTOM_CARDS_GAP;
const CHALLENGE_CARD_WIDTH = SMARTCOACH_CARD_WIDTH;
const CHALLENGE_CARD_HEIGHT = 200;
const SNAP_INTERVAL = CHALLENGE_CARD_WIDTH + CARD_MARGIN;

// ═══════════════════════════════════════════════════════════
// COLD-START SKELETON — shown only on first mount while data loads
// ═══════════════════════════════════════════════════════════

function ShimmerBlock({ style }: { style: any }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.06, 0.12]),
  }));

  return <Animated.View style={[style, { backgroundColor: '#fff' }, animatedStyle]} />;
}

function ColdStartSkeleton({ branding }: { branding: ReturnType<typeof useBranding> }) {
  return (
    <View style={sk.root}>
      {/* Header row */}
      <View style={sk.header}>
        <View style={sk.headerLeft}>
          <ShimmerBlock style={sk.avatar} />
          <ShimmerBlock style={sk.username} />
        </View>
        <ShimmerBlock style={sk.gymLogo} />
      </View>

      {/* Activity rings placeholder */}
      <View style={sk.ringsWrap}>
        <ShimmerBlock style={sk.ringsCircle} />
      </View>

      {/* Stats cards row */}
      <View style={sk.statsRow}>
        <ShimmerBlock style={sk.statCard} />
        <ShimmerBlock style={sk.statCard} />
        <ShimmerBlock style={sk.statCard} />
      </View>

      {/* Weekly chart placeholder */}
      <ShimmerBlock style={sk.chartBlock} />

      {/* Section header */}
      <View style={sk.sectionRow}>
        <ShimmerBlock style={sk.sectionTitle} />
        <ShimmerBlock style={sk.sectionLink} />
      </View>

      {/* Challenge cards row */}
      <View style={sk.cardsRow}>
        <ShimmerBlock style={sk.challengeCard} />
        <ShimmerBlock style={sk.challengeCardPartial} />
      </View>

      {/* Second section header */}
      <View style={[sk.sectionRow, { marginTop: 28 }]}>
        <ShimmerBlock style={sk.sectionTitle} />
      </View>

      {/* Bento grid */}
      <View style={sk.bentoRow}>
        <ShimmerBlock style={sk.bentoCard} />
        <ShimmerBlock style={sk.bentoCard} />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  username: {
    width: 100,
    height: 14,
    borderRadius: 7,
  },
  gymLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  ringsWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ringsCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    height: 80,
    borderRadius: 16,
  },
  chartBlock: {
    height: 100,
    borderRadius: 16,
    marginBottom: 28,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    width: 140,
    height: 16,
    borderRadius: 8,
  },
  sectionLink: {
    width: 50,
    height: 12,
    borderRadius: 6,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  challengeCard: {
    width: SCREEN_WIDTH * 0.7,
    height: 180,
    borderRadius: 16,
  },
  challengeCardPartial: {
    width: SCREEN_WIDTH * 0.3,
    height: 180,
    borderRadius: 16,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 16,
  },
  bentoCard: {
    flex: 1,
    height: 160,
    borderRadius: 20,
  },
});

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation('home');
  const showModal = useAppModal((s) => s.showModal);
  const { session } = useSession();
  const { theme, activeGym, isUnlocked } = useTheme();
  const branding = useBranding();
  const { getActiveGymId, homeGymId, previewGymId } = useGymStore();
  const { updateHomeGym, loadActiveGym } = useGymData();
  const activeGymId = getActiveGymId();
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  
  // Fade-in animation for smooth transition from splash
  const fadeOpacity = useSharedValue(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  
  const fadeAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: fadeOpacity.value,
    };
  });
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const activityRingsRef = useRef<ActivityRingsHandle>(null);

  // ── New stats hook (streak, todayDrops, lastWorkout, closestReward, weeklyActivity) ──
  const { stats: homeStats, refresh: refreshStats } = useHomeStats(activeGymId);

  // Available arenas
  const { arenas: availableArenas, refresh: refreshArenas } = useAvailableArenas();
  const activeArenas = availableArenas ? availableArenas.filter(a => a.arena_status !== 'ended') : [];

  // Happy Hour — upcoming windows card
  const upcomingHH = useUpcomingHappyHours(activeGymId);

  // Drop limits for activity rings
  const dropLimits = useDropLimitStatus(activeGymId);

  // User's leaderboard rank
  const userRank = useUserRank(activeGymId);

  // Realtime: refresh stats when drops_transactions change
  useRealtimeRefresh({
    table: 'drops_transactions',
    filterColumn: 'user_id',
    filterValue: session?.user?.id ?? null,
    onEvent: useCallback(() => {
      refreshStats?.();
      refreshLocalDrops();
      dropLimits.refresh();
    }, [refreshStats, refreshLocalDrops, dropLimits.refresh]),
    enabled: !!session?.user,
  });

  // Navigate to invite-friend when a deep-link referral code is pending.
  // invite-friend.tsx captures + clears the store code on mount so
  // returning here won't re-trigger.
  const pendingReferralCode = usePendingReferralStore((s) => s.pendingCode);

  // Check-in status
  const [checkinStatus, setCheckinStatus] = useState<{
    already_checked_in: boolean;
    checkin_drops: number;
    gym_name: string;
    total_checkins: number;
  } | null>(null);

  const loadCheckinStatus = useCallback(async () => {
    if (!session?.user || !homeGymId) return;
    try {
      const { data, error } = await supabase.rpc('get_checkin_status', { p_gym_id: homeGymId });
      if (!error && data) setCheckinStatus(data as any);
    } catch {
      // Non-critical
    }
  }, [session?.user, homeGymId]);

  const loadData = useCallback(async (silent = false) => {
    if (!session?.user) return;

    if (!silent && !hasLoadedOnce.current) {
      setLoading(true);
    }

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

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

  // Badge notifications with confetti
  const { newBadge, clearNewBadge } = useBadgeNotifications({
    onBadgeEarned: (badge) => {
      log.debug('Badge earned!', badge);
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        clearNewBadge();
      }, 3000);
    },
  });

  // Load challenge progress for all machine types
  const { challenges: allChallenges, loading: challengesLoading, refresh: refreshChallenges } = useChallengeProgress(activeGymId, null);
  const activeChallenges = allChallenges.filter(c => !c.is_completed);
  const displayedChallenges = activeChallenges.slice(0, 3);
  
  // Glow animation for QR button
  const glowAnim = useSharedValue(0);

  useEffect(() => {
    glowAnim.value = withRepeat(
      withTiming(1, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowAnim.value, [0, 1], [0.4, 0.8]);
    return { opacity };
  });

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
        loadCheckinStatus(),
        ...(activeGymId
          ? [
              refreshChallenges?.() ?? Promise.resolve(),
              refreshStats?.() ?? Promise.resolve(),
              refreshArenas?.() ?? Promise.resolve(),
              userRank.refresh(),
              dropLimits.refresh(),
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
      loadCheckinStatus,
      refreshChallenges,
      refreshStats,
      refreshArenas,
      userRank,
      dropLimits.refresh,
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
        loadCheckinStatus(),
        ...(activeGymId
          ? [
              refreshChallenges?.() ?? Promise.resolve(),
              refreshStats?.() ?? Promise.resolve(),
              refreshArenas?.() ?? Promise.resolve(),
              userRank.refresh(),
              dropLimits.refresh(),
            ]
          : []),
      ]);
    } catch (error) {
      log.error('Pull-to-refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeGymId, loadData, loadActiveGym, refreshLocalDrops, loadCheckinStatus, refreshChallenges, refreshStats, refreshArenas, userRank, dropLimits]);

  const handleQRPress = async () => {
    router.push('/scan');
  };

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
            } catch (error) {
              showModal({ title: t('common:error'), body: t('failedToUpdateGym') });
            }
          },
        },
      ],
    });
  };

  // ── Cold-start redacted skeleton (first load only) ──
  if (!hasLoadedOnce.current && !profile && homeGymId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <LinearGradient
            colors={['#080808', '#0A0E1A', '#080808'] as any}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <ColdStartSkeleton branding={branding} />
        </SafeAreaView>
      </View>
    );
  }

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
              <View style={[es.avatarCircle, { borderColor: hexToRgba(branding.primary, 0.3), backgroundColor: 'rgba(0,229,255,0.08)' }]}>
                {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
                  <Image source={profile.avatar_url} style={es.avatarImage} transition={200} />
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

            {/* ─── SECTION 5 — AVAILABLE GYMS ─── */}
            {availableGyms.length > 0 && (
              <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                <View style={es.gymsSection}>
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

                    {/* Suggest gym card */}
                    <TouchableOpacity
                      style={[es.gymPlaceholderCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                      onPress={() => setShowWaitlist(true)}
                      activeOpacity={0.7}
                    >
                      <View style={[es.gymPlaceholderIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.08), borderColor: hexToRgba(branding.primary, 0.2) }]}>
                        <Ionicons name="add" size={22} color={hexToRgba(branding.primary, 0.7)} />
                      </View>
                      <Text style={[es.gymPlaceholderText, { color: 'rgba(255,255,255,0.5)' }]}>{t('notYourGym')}</Text>
                      <Text style={[es.gymPlaceholderSub, { color: hexToRgba(branding.primary, 0.55) }]}>{t('suggestGym')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </Animated.View>
            )}

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
                      <Text style={es.previewCardTitle}>{t('challenges')}</Text>
                      <Text style={es.previewCardSub}>{t('challengesSub')}</Text>
                    </PlatformBlur>
                    <PlatformBlur intensity={30} tint="dark" style={es.previewCard} androidColor="rgba(20,20,30,0.95)">
                      <Ionicons name="trophy-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('arenas')}</Text>
                      <Text style={es.previewCardSub}>{t('arenasSub')}</Text>
                    </PlatformBlur>
                  </View>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          {/* QR Scanner FAB */}
          <View style={styles.fabContainer}>
            <Animated.View style={[styles.fabGlow, glowStyle, { backgroundColor: branding.primary }]} />
            <TouchableOpacity
              style={[styles.fab, { shadowColor: branding.primary }]}
              onPress={handleQRPress}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[branding.primary, branding.primaryDark]}
                style={styles.fabGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="qr-code" size={48} color={branding.onPrimary} />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <WaitlistBottomSheet
            visible={showWaitlist}
            onClose={() => setShowWaitlist(false)}
            brandColor={branding.primary}
          />
        </SafeAreaView>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#000000' }, fadeAnimatedStyle]}>
      <SafeAreaView style={styles.container} edges={['top']}>
      {/* Dynamic background */}
      {activeGym?.background_url ? (
        <View style={StyleSheet.absoluteFillObject}>
          <Image
            source={activeGym.background_url}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
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

      {/* ═══════════════════════════════════════════ */}
      {/* DYNAMIC HEADER (fixed, does not scroll)      */}
      {/* ═══════════════════════════════════════════ */}
      <View style={styles.stickyHeader}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => router.push('/profile')}
          activeOpacity={0.7}
        >
          <View style={[styles.avatarContainer, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
            {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
              <Image source={profile.avatar_url} style={styles.avatarImage} transition={200} />
            ) : (
              <Text style={styles.avatarText}>
                {profile?.avatar_url || profile?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            )}
          </View>
          <Text style={styles.username}>{profile?.username || t('common:user')}</Text>
        </TouchableOpacity>

        {/* Gym logo — top right */}
        <View style={[styles.gymLogoContainer, { borderColor: hexToRgba(branding.primary, 0.25) }]}>
          {activeGym?.logo_url ? (
            <Image source={activeGym.logo_url} style={styles.gymLogoImage} contentFit="contain" transition={200} />
          ) : (
            <Ionicons name="fitness" size={20} color={hexToRgba(branding.primary, 0.7)} />
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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
        {/* ═══════════════════════════════════════════ */}
        {/* ACTIVITY RINGS (Apple-style)                 */}
        {/* ═══════════════════════════════════════════ */}
        <View style={styles.heroSection}>
          <ActivityRings
            ref={activityRingsRef}
            streakDays={homeStats.streak}
            todayDrops={homeStats.todayDrops}
            todayBonusDrops={homeStats.todayBonusDrops}
            dailyCap={dropLimits.maxDropsPerDay}
            weeklyDrops={dropLimits.mintedWeek}
            weeklyCap={dropLimits.maxDropsPerWeek}
            totalGymDrops={localDrops}
            size={290}
            onPress={() => router.push('/wallet')}
          />
          {activeGym && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/gym-detail', params: { gymId: activeGymId } })}
            >
              <Text style={[styles.heroGymName, { color: hexToRgba(branding.primary, 0.6) }]}>
                {activeGym.name}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══════════════════════════════════════════ */}
        {/* STATS CARDS + REWARD + HAPPY HOUR            */}
        {/* ═══════════════════════════════════════════ */}
        <StatsCards
          streakDays={homeStats.streak}
          todayDrops={homeStats.todayDrops}
          todayBonusDrops={homeStats.todayBonusDrops}
          dailyCap={dropLimits.maxDropsPerDay}
          weeklyDrops={dropLimits.mintedWeek}
          weeklyCap={dropLimits.maxDropsPerWeek}
          primaryColor={branding.primary}
          isCheckedIn={checkinStatus?.already_checked_in ?? false}
          gymName={activeGym?.name ?? ''}
          onCheckinPress={() => router.push('/scan')}
          nextRewardName={homeStats.closestReward?.name ?? null}
          nextRewardImageUrl={homeStats.closestReward?.imageUrl ?? null}
          nextRewardPriceDrops={homeStats.closestReward?.priceDrops ?? 0}
          localDropsBalance={localDrops}
          dropsToNextReward={homeStats.closestReward?.dropsAway ?? 0}
          onRewardPress={() => router.push('/store')}
          nextHappyHour={(() => {
            const slot = upcomingHH.liveWindow ?? upcomingHH.windows[0] ?? null;
            if (!slot) return null;
            const fmt = (iso: string) => {
              try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
              catch { return '--:--'; }
            };
            return {
              label: slot.label,
              time: fmt(slot.startAt),
              endTime: fmt(slot.endAt),
              multiplier: slot.multiplier,
              inMinutes: slot.minutesUntilStart,
              isToday: slot.isToday,
            };
          })()}
          isHappyHourActive={!!upcomingHH.liveWindow}
          onHappyHourPress={() => router.push('/happy-hours' as any)}
          onStreakPress={() => router.push('/workout-history')}
          onTodayPress={() => router.push('/stats?period=today' as any)}
          onWeeklyPress={() => router.push('/stats?period=week' as any)}
        />

        {/* ═══════════════════════════════════════════ */}
        {/* WEEKLY ACTIVITY CHART                        */}
        {/* ═══════════════════════════════════════════ */}
        {homeStats.weeklyActivity.length > 0 && (
          <WeeklyActivityChart
            data={homeStats.weeklyActivity}
            activeDays={homeStats.activeDaysThisWeek}
            brandPrimary={branding.primary}
            onPress={() => router.push('/workout-history')}
          />
        )}

        {/* Cards Container with Overlay */}
        <View style={styles.cardsContainer}>
          {/* Locked Overlay (preview mode) */}
          {!isUnlocked && (
            <View style={styles.cardsOverlayContainer}>
              <LockedOverlay onSetAsHomeGym={handleSetAsHomeGym} />
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* LEADERBOARD PREVIEW                         */}
          {/* ═══════════════════════════════════════════ */}
          <LeaderboardPreview gymId={activeGymId} isUnlocked={isUnlocked} />

          {/* ═══════════════════════════════════════════ */}
          {/* INVITE FRIEND CTA                            */}
          {/* ═══════════════════════════════════════════ */}
          {session?.user && isUnlocked && (
            <PressableCard
              style={styles.inviteCta}
              onPress={() => router.push('/invite-friend')}
            >
              <PlatformBlur intensity={50} tint="dark" style={styles.inviteCtaBlur} androidColor="rgba(12,12,22,0.97)">
                <LinearGradient
                  colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.inviteCtaGradient}
                >
                  <View style={[styles.inviteCtaIcon, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Ionicons name="person-add" size={20} color={branding.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inviteCtaTitle}>{t('friendsQuick.inviteTitle')}</Text>
                    <Text style={[styles.inviteCtaSub, { color: branding.primary }]}>
                      {t('friendsQuick.inviteReward')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={hexToRgba(branding.primary, 0.5)} />
                </LinearGradient>
              </PlatformBlur>
            </PressableCard>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* ACTIVE CHALLENGES - Horizontal Scroll       */}
          {/* ═══════════════════════════════════════════ */}
          {challengesLoading && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('activeChallenges')}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.challengesScrollContent}
                style={styles.challengesScrollView}
                scrollEnabled={false}
              >
                {[1, 2].map((index) => (
                  <View
                    key={`skeleton-${index}`}
                    style={[styles.challengeCardWrapper, { width: CHALLENGE_CARD_WIDTH }]}
                  >
                    <View style={[styles.challengeCardSkeleton, {
                      borderTopColor: hexToRgba(branding.primary, 0.22),
                      borderLeftColor: hexToRgba(branding.primary, 0.10),
                      borderRightColor: hexToRgba(branding.primary, 0.06),
                      borderBottomColor: hexToRgba(branding.primary, 0.04),
                    }]}>
                      <LinearGradient
                        colors={['rgba(255,255,255,0.08)', hexToRgba(branding.primary, 0.05), 'rgba(12,12,22,0.0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.challengeGradient}
                      >
                        <View style={styles.challengeContent}>
                          <View style={styles.challengeHeader}>
                            <View style={[styles.skeletonBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]} />
                            <View style={[styles.skeletonTitle, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />
                          </View>
                          <View style={styles.challengeProgress}>
                            <View style={[styles.progressBar, { backgroundColor: hexToRgba(branding.primary, 0.08) }]} />
                            <View style={[styles.skeletonProgressText, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />
                          </View>
                          <View style={[styles.skeletonReward, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />
                        </View>
                      </LinearGradient>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {!challengesLoading && displayedChallenges.length > 0 && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('activeChallenges')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!isUnlocked) return;
                    router.push('/challenges');
                  }}
                  activeOpacity={0.7}
                  disabled={!isUnlocked}
                >
                  <Text style={[styles.seeAllText, { color: branding.primary }]}>{t('viewAll')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.challengesScrollContent}
                style={styles.challengesScrollView}
                snapToInterval={SNAP_INTERVAL}
                snapToAlignment="start"
                decelerationRate="fast"
                pagingEnabled={false}
              >
                {displayedChallenges.map((challenge) => {
                  const progressRatio = challenge.progress_percentage / 100 || 0;
                  
                  const getChallengeTypeLabel = () => {
                    switch (challenge.challenge_type) {
                      case 'daily': return t('daily');
                      case 'weekly': return t('weekly');
                      case 'monthly': return t('monthly');
                      case 'streak': return t('streak');
                      case 'milestone': return t('milestone');
                      case 'checkin_streak': return t('checkinStreak');
                      case 'checkin_count': return t('checkinCount');
                      default: return t('challenge');
                    }
                  };

                  const getProgressLabel = () => {
                    if (challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak') {
                      return { current: challenge.current_streak_days, target: challenge.target_drops, unit: t('unitDays') };
                    } else if (challenge.challenge_type === 'checkin_count') {
                      return { current: challenge.current_drops, target: challenge.target_drops, unit: t('unitCheckins') };
                    } else {
                      return { current: challenge.current_drops, target: challenge.target_drops, unit: 'drops' };
                    }
                  };

                  const getTimeUntilMidnight = (): string => {
                    const now = new Date();
                    const midnight = new Date(now);
                    midnight.setHours(24, 0, 0, 0);
                    const diff = midnight.getTime() - now.getTime();
                    const h = Math.floor(diff / (1000 * 60 * 60));
                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    return `${h}h ${m}m`;
                  };

                  const getTimeUntilSunday = (): string => {
                    const now = new Date();
                    const dayOfWeek = now.getDay();
                    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
                    const sunday = new Date(now);
                    sunday.setDate(sunday.getDate() + daysUntilSunday);
                    sunday.setHours(0, 0, 0, 0);
                    const diff = sunday.getTime() - now.getTime();
                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    if (d > 0) return `${d}d ${h}h`;
                    return `${h}h`;
                  };

                  const getChallengeTimeInfo = (): { text: string; style: 'countdown' | 'recurring' | 'permanent' | 'completed' } | null => {
                    if (challenge.is_completed) {
                      if (challenge.challenge_type === 'daily') {
                        return { text: t('completedResetsIn', { time: getTimeUntilMidnight() }), style: 'completed' };
                      }
                      if (challenge.challenge_type === 'weekly') {
                        return { text: t('completedResetsSunday', { time: getTimeUntilSunday() }), style: 'completed' };
                      }
                      return { text: t('completedLabel'), style: 'completed' };
                    }

                    if (challenge.challenge_type === 'milestone') {
                      return { text: t('ongoing'), style: 'permanent' };
                    }

                    if (!challenge.end_date) {
                      return { text: t('ongoing'), style: 'permanent' };
                    }

                    const end = new Date(challenge.end_date + 'T23:59:59');
                    const diff = end.getTime() - Date.now();
                    if (diff <= 0) return { text: t('ended'), style: 'countdown' };

                    if (challenge.challenge_type === 'daily') {
                      return { text: t('resetsIn', { time: getTimeUntilMidnight() }), style: 'recurring' };
                    }
                    if (challenge.challenge_type === 'weekly') {
                      return { text: t('resetsIn', { time: getTimeUntilSunday() }), style: 'recurring' };
                    }

                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    if (days > 0) return { text: t('timeLeft', { days, hours }), style: 'countdown' };
                    if (hours > 0) return { text: t('hoursLeft', { hours }), style: 'countdown' };
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    return { text: t('minutesLeft', { minutes }), style: 'countdown' };
                  };

                  const progressLabel = getProgressLabel();
                  const timeInfo = getChallengeTimeInfo();
                  
                  return (
                    <View
                      key={challenge.challenge_id}
                      style={[styles.challengeCardWrapper, { width: CHALLENGE_CARD_WIDTH }]}
                    >
                      <PressableCard
                        style={[
                          styles.challengeCard,
                          {
                            borderTopColor: hexToRgba(branding.primary, 0.30),
                            borderLeftColor: hexToRgba(branding.primary, 0.14),
                            borderRightColor: hexToRgba(branding.primary, 0.08),
                            borderBottomColor: hexToRgba(branding.primary, 0.06),
                          },
                        ]}
                        onPress={() => {
                          if (!isUnlocked) return;
                          router.push({
                            pathname: '/challenge-detail',
                            params: { challengeId: challenge.challenge_id, gymId: activeGymId || '' },
                          });
                        }}
                        disabled={!isUnlocked}
                      >
                        <PlatformBlur intensity={40} tint="dark" style={styles.challengeBlur} androidColor="rgba(12,12,22,0.97)">
                          <LinearGradient
                            colors={['rgba(255,255,255,0.10)', hexToRgba(branding.primary, 0.07), 'rgba(12,12,22,0.0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.challengeGradient}
                          >
                            <View style={styles.challengeContent}>
                              <View style={styles.challengeHeader}>
                                <View style={styles.challengeHeaderRow}>
                                  <Text style={[styles.challengeType, { color: branding.primary }]}>
                                    {getChallengeTypeLabel()}
                                  </Text>
                                  {timeInfo && (
                                    <View style={[
                                      styles.challengeTimeBadge,
                                      { backgroundColor: timeInfo.style === 'completed'
                                        ? 'rgba(74, 222, 128, 0.1)'
                                        : timeInfo.style === 'recurring'
                                          ? 'rgba(96, 165, 250, 0.1)'
                                          : timeInfo.style === 'permanent'
                                            ? 'rgba(255, 255, 255, 0.03)'
                                            : hexToRgba(branding.primary, 0.1)
                                      },
                                    ]}>
                                      <Ionicons
                                        name={
                                          timeInfo.style === 'completed' ? 'checkmark-circle' :
                                          timeInfo.style === 'permanent' ? 'infinite' :
                                          timeInfo.style === 'recurring' ? 'refresh' :
                                          'time-outline'
                                        }
                                        size={10}
                                        color={timeInfo.style === 'completed' ? '#4ade80' : theme.colors.textSecondary}
                                      />
                                      <Text style={[
                                        styles.challengeTimeBadgeText,
                                        timeInfo.style === 'completed' && { color: '#4ade80' },
                                      ]}>
                                        {timeInfo.text}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.challengeName} numberOfLines={2}>
                                  {challenge.challenge_name}
                                </Text>
                              </View>

                              <View style={styles.challengeProgress}>
                                <View style={[styles.progressBar, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                                  <View
                                    style={[
                                      styles.progressBarFill,
                                      {
                                        width: `${Math.min(progressRatio * 100, 100)}%`,
                                        backgroundColor: challenge.is_completed
                                          ? theme.colors.secondary
                                          : branding.primary,
                                      },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.progressText}>
                                  <Text style={[getNumberStyle(12), { color: branding.primary }]}>
                                    {progressLabel.current}
                                  </Text>
                                  {' / '}
                                  <Text style={[getNumberStyle(12), { color: branding.primary }]}>
                                    {progressLabel.target}
                                  </Text>
                                  {' '}
                                  <Text style={[getNumberStyle(12), { color: branding.primary }]}>
                                    {progressLabel.unit}
                                  </Text>
                                </Text>
                              </View>

                              <View style={styles.challengeReward}>
                                <Ionicons name="water" size={14} color={branding.primary} />
                                <Text style={[styles.challengeRewardText, { color: branding.primary }]}>
                                  {challenge.reward_drops} drops
                                </Text>
                              </View>
                            </View>
                          </LinearGradient>
                        </PlatformBlur>
                      </PressableCard>
                    </View>
                  );
                })}

              </ScrollView>
            </View>
          )}

          {/* No Active Challenges — slim empty state */}
          {!challengesLoading && displayedChallenges.length === 0 && activeGymId && (
            <View style={styles.emptyChallengesBanner}>
              <PlatformBlur intensity={50} tint="dark" style={styles.emptyChallengesBlur} androidColor="rgba(18,18,28,0.97)">
                <Ionicons name="trophy-outline" size={20} color={hexToRgba(branding.primary, 0.5)} />
                <Text style={styles.emptyChallengesText}>
                  {t('noChallenges')}
                </Text>
              </PlatformBlur>
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* NEXT BADGE — motivational hook               */}
          {/* ═══════════════════════════════════════════ */}
          {isUnlocked && <ProgressWidget />}

          {/* ═══════════════════════════════════════════ */}
          {/* SWEAT ARENAS CAROUSEL                       */}
          {/* ═══════════════════════════════════════════ */}
          {isUnlocked && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('arenas')}</Text>
                {activeArenas.length > 0 && (
                  <TouchableOpacity onPress={() => router.push('/arenas')} activeOpacity={0.7}>
                    <Text style={[styles.seeAllText, { color: branding.primary }]}>{t('viewAll')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {activeArenas.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.challengesScrollContent}
                  style={styles.challengesScrollView}
                  snapToInterval={SNAP_INTERVAL}
                  snapToAlignment="start"
                  decelerationRate="fast"
                >
                  {activeArenas.slice(0, 5).map((arena) => {
                    const isUpcoming = arena.arena_status === 'upcoming';
                    const targetDate = isUpcoming ? new Date(arena.start_date) : new Date(arena.end_date);
                    const daysLeft = Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    const ARENA_SCORING_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
                      total_drops: 'water',
                      days_visited: 'calendar-outline',
                      variety_score: 'barbell-outline',
                      streak_days: 'flame-outline',
                    };
                    const scoringIcon = ARENA_SCORING_ICONS[arena.scoring_model] ?? 'water';

                    // Custom branding per arena
                    const arenaPrimary = arena.card_color || branding.primary;
                    const arenaText = arena.card_text_color || theme.colors.text;
                    const arenaGradientEnd = arena.card_gradient_end || 'rgba(20, 20, 35, 0.9)';

                    return (
                      <View key={arena.arena_id} style={[styles.challengeCardWrapper, { width: CHALLENGE_CARD_WIDTH }]}>
                        <PressableCard
                          style={[
                            styles.challengeCard,
                            {
                              borderTopColor: hexToRgba(arenaPrimary, isUpcoming ? 0.38 : 0.28),
                              borderLeftColor: hexToRgba(arenaPrimary, 0.14),
                              borderRightColor: hexToRgba(arenaPrimary, 0.08),
                              borderBottomColor: hexToRgba(arenaPrimary, 0.06),
                            },
                          ]}
                          onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                        >
                          <PlatformBlur intensity={40} tint="dark" style={styles.challengeBlur} androidColor="rgba(12,12,22,0.97)">
                            <LinearGradient
                              colors={['rgba(255,255,255,0.10)', hexToRgba(arenaPrimary, 0.10), arenaGradientEnd]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={styles.challengeGradient}
                            >
                              <View style={styles.challengeContent}>
                                {/* Coming Soon badge for upcoming arenas */}
                                {isUpcoming && (
                                  <View style={[styles.arenaComingSoonBadge, { backgroundColor: hexToRgba(arenaPrimary, 0.2), borderColor: hexToRgba(arenaPrimary, 0.3) }]}>
                                    <Ionicons name="time-outline" size={10} color={arenaPrimary} />
                                    <Text style={[styles.arenaComingSoonText, { color: arenaPrimary }]}>{t('comingSoon')}</Text>
                                  </View>
                                )}

                                {/* Arena Header */}
                                <View style={styles.challengeHeader}>
                                  <View style={styles.arenaHeaderRow}>
                                    {arena.sponsor_logo ? (
                                      <Image source={arena.sponsor_logo} style={styles.arenaSponsorLogo} contentFit="contain" transition={200} />
                                    ) : (
                                      <View style={[styles.arenaSponsorPlaceholder, { backgroundColor: hexToRgba(arenaPrimary, 0.15) }]}>
                                        <Ionicons name="trophy" size={14} color={arenaPrimary} />
                                      </View>
                                    )}
                                    <Text style={[styles.challengeType, { color: arenaPrimary }]}>{arena.sponsor_name}</Text>
                                    <Ionicons name={scoringIcon} size={14} color={arenaPrimary} />
                                  </View>
                                  <Text style={[styles.challengeName, { color: arenaText }]} numberOfLines={2}>{arena.name}</Text>
                                </View>

                                {/* Arena Stats */}
                                <View style={styles.arenaHomeStats}>
                                  <Text style={styles.arenaHomeStat}>{arena.participant_count} {t('participants')}</Text>
                                  {isUpcoming ? (
                                    <Text style={[styles.arenaHomeStat, { color: arenaPrimary }]}>
                                      {t('startsIn', { days: daysLeft })}
                                    </Text>
                                  ) : (
                                    <Text style={[styles.arenaHomeStat, daysLeft <= 3 && { color: theme.colors.secondary }]}>
                                      {daysLeft} {t('daysLeft')}
                                    </Text>
                                  )}
                                </View>

                                {/* User rank or Join CTA */}
                                <View style={[styles.challengeReward, { borderTopColor: hexToRgba(arenaPrimary, 0.08) }]}>
                                  {arena.user_opted_in ? (
                                    <>
                                      <Text style={[styles.arenaRankLabel, { color: arenaPrimary }]}>
                                        {t('yourRank', { rank: arena.user_rank ?? '—' })}
                                      </Text>
                                    </>
                                  ) : isUpcoming ? (
                                    <>
                                      <Ionicons name="time-outline" size={16} color={arenaPrimary} />
                                      <Text style={[styles.challengeRewardText, { color: arenaPrimary }]}>{t('joinArena')}</Text>
                                    </>
                                  ) : (
                                    <>
                                      <Ionicons name="add-circle-outline" size={16} color={arenaPrimary} />
                                      <Text style={[styles.challengeRewardText, { color: arenaPrimary }]}>{t('joinArena')}</Text>
                                    </>
                                  )}
                                </View>
                              </View>
                            </LinearGradient>
                          </PlatformBlur>
                        </PressableCard>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <PressableCard
                  style={[
                    styles.arenaEmptyState,
                    {
                      borderTopColor: hexToRgba(branding.primary, 0.30),
                      borderLeftColor: hexToRgba(branding.primary, 0.12),
                      borderRightColor: hexToRgba(branding.primary, 0.08),
                      borderBottomColor: hexToRgba(branding.primary, 0.06),
                    },
                  ]}
                  onPress={() => router.push('/arenas')}
                >
                  <PlatformBlur intensity={40} tint="dark" style={styles.arenaEmptyBlur} androidColor="rgba(12,12,22,0.97)">
                    <LinearGradient
                      colors={['rgba(255,255,255,0.10)', hexToRgba(branding.primary, 0.07), 'rgba(12,12,22,0.0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <View style={[styles.arenaEmptyIcon, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                      <Ionicons name="trophy-outline" size={28} color={branding.primary} />
                    </View>
                    <View style={styles.arenaEmptyTextContainer}>
                      <Text style={styles.arenaEmptyTitle}>{t('noArenas')}</Text>
                      <Text style={styles.arenaEmptySubtitle}>
                        {t('noArenasSubtitle')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={hexToRgba(branding.primary, 0.5)} />
                  </PlatformBlur>
                </PressableCard>
              )}
            </View>
          )}


          {/* ═══════════════════════════════════════════ */}
          {/* SMARTCOACH CARD (Conditional)               */}
          {/* ═══════════════════════════════════════════ */}
          {activeGym?.smartcoach_enabled && (
            <View style={styles.smartCoachSection}>
              <TouchableOpacity
                style={[
                  styles.smartCoachCard, 
                  { 
                    width: SMARTCOACH_CARD_WIDTH,
                    borderColor: hexToRgba(branding.primary, 0.3),
                  }
                ]}
                onPress={() => {
                  if (!isUnlocked) return;
                  router.push('/smartcoach');
                }}
                activeOpacity={isUnlocked ? 0.9 : 1}
                disabled={!isUnlocked}
              >
                <PlatformBlur intensity={50} tint="dark" style={styles.smartCoachBlur} androidColor="rgba(18,18,28,0.97)">
                  <LinearGradient
                    colors={[hexToRgba(branding.primary, 0.1), hexToRgba(branding.primary, 0.05), hexToRgba(branding.primary, 0.08)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.smartCoachGradient}
                  >
                    <View style={styles.smartCoachContent}>
                      <View style={styles.smartCoachHeaderRow}>
                        <View style={[styles.smartCoachIconContainer, { backgroundColor: hexToRgba(branding.primary, 0.2) }]}>
                          <Ionicons name="fitness" size={32} color={branding.primary} />
                        </View>
                        <View style={styles.smartCoachTextContainer}>
                          <Text style={[styles.smartCoachTitle, { color: branding.primary }]}>SmartCoach</Text>
                          <Text style={[styles.smartCoachSubtitle, { color: hexToRgba(branding.primary, 0.7) }]} numberOfLines={2}>
                            {t('smartCoachSubtitle')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[{ backgroundColor: branding.primary, borderRadius: 20, padding: 4 }]}
                        >
                          <Ionicons name="arrow-forward-circle" size={28} color={branding.onPrimary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </LinearGradient>
                </PlatformBlur>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* BENTO GRID - Bottom Cards Row              */}
          {/* ═══════════════════════════════════════════ */}
          <View style={styles.bottomCardsRow}>
            {/* Rewards Store Card */}
            <View style={styles.featureCardWrapper}>
              <PressableCard
                style={styles.featureCard}
                onPress={() => router.push('/store')}
                disabled={!isUnlocked}
              >
                <PlatformBlur intensity={50} tint="dark" style={styles.featureCardBlur} androidColor="rgba(12,12,22,0.97)">
                  <LinearGradient
                    colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
                  />
                  <View style={styles.cardHeader}>
                    <Ionicons name="gift-outline" size={22} color={branding.primary} style={{ marginBottom: 6 }} />
                    <Text style={styles.cardTitle}>{t('rewardsStore')}</Text>
                    <Text 
                      style={styles.cardSubtitle}
                      numberOfLines={2}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.8}
                    >
                      {t('rewardsStoreSubtitle')}
                    </Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardAction, { color: branding.primary }]}>{t('viewStore')}</Text>
                    <Ionicons name="arrow-forward" size={16} color={branding.primary} />
                  </View>
                </PlatformBlur>
              </PressableCard>
            </View>

            {/* Trophy Room Card */}
            <View style={styles.featureCardWrapper}>
              <PressableCard
                style={styles.featureCard}
                onPress={() => router.push('/trophy-room')}
                disabled={!isUnlocked}
              >
                <PlatformBlur intensity={50} tint="dark" style={styles.featureCardBlur} androidColor="rgba(12,12,22,0.97)">
                  <LinearGradient
                    colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
                  />
                  <View style={styles.cardHeader}>
                    <Ionicons name="trophy-outline" size={22} color={branding.primary} style={{ marginBottom: 6 }} />
                    <Text style={styles.cardTitle}>{t('trophyRoom')}</Text>
                    <Text 
                      style={styles.cardSubtitle}
                      numberOfLines={2}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.8}
                    >
                      {t('trophyRoomSubtitle')}
                    </Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardAction, { color: branding.primary }]}>{t('viewBadges')}</Text>
                    <Ionicons name="arrow-forward" size={16} color={branding.primary} />
                  </View>
                </PlatformBlur>
              </PressableCard>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* QR Scanner FAB with Glow */}
      <View style={styles.fabContainer}>
        <Animated.View style={[styles.fabGlow, glowStyle, { backgroundColor: branding.primary }]} />
        <TouchableOpacity
          style={[styles.fab, { shadowColor: branding.primary }]}
          onPress={handleQRPress}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[branding.primary, branding.primaryDark]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="qr-code" size={48} color={branding.onPrimary} />
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
  );
}

const styles = StyleSheet.create({
  /* ─── Layout ────────────────────────────── */
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080808',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
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
  gymLogoContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  gymLogoImage: {
    width: '100%',
    height: '100%',
  },
  /* ─── Hero Section ──────────────────────── */
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 8,
  },
  heroGymName: {
    ...fontStyles.heading,
    fontSize: 14,
    marginTop: 8,
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
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#FFFFFF',
  },
  viewAllLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },

  /* ─── Challenges ────────────────────────── */
  challengesSection: {
    marginBottom: 24,
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

  /* ─── QR FAB ────────────────────────────── */
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  fabGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.4,
  },
  fab: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
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
  gymPlaceholderCard: {
    width: 220,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(14,14,24,0.50)',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  gymPlaceholderIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymPlaceholderText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  gymPlaceholderSub: {
    ...fontStyles.body,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
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
