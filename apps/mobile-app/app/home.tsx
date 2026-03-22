import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, ImageBackground, Image, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { useGymData } from '@/hooks/useGymData';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { useBadgeNotifications } from '@/hooks/useBadgeNotifications';
import { getNumberStyle, theme as appTheme, fontStyles } from '@/lib/theme';
import { ConfettiEffect } from '@/components/ConfettiEffect';
import { LockedOverlay } from '@/components/LockedOverlay';
import { UserSettingsSheet } from '@/components/UserSettingsSheet';
import { ProgressWidget } from '@/components/ProgressWidget';
import { HeroDropsRing } from '@/components/HeroDropsRing';
import { LeaderboardPreview } from '@/components/LeaderboardPreview';
import { QuickStatsRow } from '@/components/QuickStatsRow';
import { ClosestRewardBanner } from '@/components/ClosestRewardBanner';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { useHomeStats } from '@/hooks/useHomeStats';
import { useAvailableArenas } from '@/hooks/useAvailableArenas';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 12;
const CARD_PADDING = 16; // Horizontal padding of ScrollView

// Helper function to add alpha to hex color
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// Bottom cards row: two cards with gap between them
const BOTTOM_CARDS_GAP = 16;
const BOTTOM_CARD_WIDTH = (SCREEN_WIDTH - (CARD_PADDING * 2) - BOTTOM_CARDS_GAP) / 2;
const SMARTCOACH_CARD_WIDTH = (BOTTOM_CARD_WIDTH * 2) + BOTTOM_CARDS_GAP;
const CHALLENGE_CARD_WIDTH = SMARTCOACH_CARD_WIDTH;
const CHALLENGE_CARD_HEIGHT = 200;
const SNAP_INTERVAL = CHALLENGE_CARD_WIDTH + CARD_MARGIN;

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation('home');
  const { t: tCheckin } = useTranslation('checkin');
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
  
  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated) {
        fadeOpacity.value = withTiming(1, {
          duration: 400,
          easing: Easing.out(Easing.ease),
        });
        setHasAnimated(true);
      }
    }, [hasAnimated, fadeOpacity])
  );
  
  const fadeAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: fadeOpacity.value,
    };
  });
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── New stats hook (streak, todayDrops, lastWorkout, closestReward, weeklyActivity) ──
  const { stats: homeStats, refresh: refreshStats } = useHomeStats(activeGymId, localDrops);

  // Available arenas
  const { arenas: availableArenas, refresh: refreshArenas } = useAvailableArenas();

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

  // Badge notifications with confetti
  const { newBadge, clearNewBadge } = useBadgeNotifications({
    onBadgeEarned: (badge) => {
      console.log('Badge earned!', badge);
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
  
  // Debug log
  useEffect(() => {
    if (__DEV__) {
      console.log('[Home] Challenges state:', {
        activeGymId,
        challengesLoading,
        allChallengesCount: allChallenges.length,
      });
    }
  }, [activeGymId, challengesLoading, allChallenges]);

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

  // Refresh ALL data when screen is focused (including profile drops)
  // CRITICAL: Use silent=true to avoid showing the full-screen loader and resetting scroll position
  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        loadData(true); // silent refresh — no loader, no scroll reset
        refreshLocalDrops();
        loadCheckinStatus();
        if (activeGymId) {
          refreshChallenges?.();
          refreshStats?.();
          refreshArenas?.();
        }
      }
    }, [activeGymId, session?.user])
  );

  // ── Available gyms (for empty state) ──
  const [availableGyms, setAvailableGyms] = useState<{id: string; name: string; city: string | null; address: string | null; logo_url: string | null}[]>([]);

  useEffect(() => {
    if (homeGymId) return;

    supabase
      .from('gyms')
      .select('id, name, city, address, logo_url, is_active')
      .eq('is_active', true)
      .order('name')
      .limit(10)
      .then(({ data }) => {
        if (data) setAvailableGyms(data);
      });
  }, [homeGymId]);

  const loadData = async (silent = false) => {
    if (!session?.user) return;

    // Only show full-screen loader on the very first load
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
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadData(true),
        activeGymId ? loadActiveGym(activeGymId) : Promise.resolve(),
      ]);
      refreshLocalDrops();
      loadCheckinStatus();
      if (activeGymId) {
        refreshChallenges?.();
        refreshStats?.();
        refreshArenas?.();
      }
    } catch (error) {
      console.error('Pull-to-refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeGymId, loadCheckinStatus]);

  const handleQRPress = async () => {
    router.push('/scan');
  };

  const handleSetAsHomeGym = async () => {
    if (!activeGym) return;
    Alert.alert(
      t('setAsHomeGym'),
      t('setAsHomeGymMsg', { name: activeGym.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('setAsHome'),
          onPress: async () => {
            try {
              await updateHomeGym(activeGym.id);
            } catch (error) {
              Alert.alert(t('common:error'), t('failedToUpdateGym'));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty state for users with no home gym ──
  if (!homeGymId) {
    return (
      <Animated.View style={[{ flex: 1 }, fadeAnimatedStyle]}>
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
                  <Image source={{ uri: profile.avatar_url }} style={es.avatarImage} />
                ) : (
                  <Text style={es.avatarText}>
                    {profile?.avatar_url || profile?.username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                )}
              </View>
              <Text style={es.username}>{profile?.username || 'User'}</Text>
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
                    <BlurView intensity={30} tint="dark" style={es.statPillBlur}>
                      <Ionicons name={item.icon} size={18} color="rgba(255,255,255,0.15)" />
                      <Text style={es.statPillValue}>—</Text>
                      <Text style={es.statPillLabel}>{item.label}</Text>
                    </BlurView>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ─── SECTION 4 — MAIN CTA CARD ─── */}
            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
              <View style={es.ctaCardOuter}>
                <BlurView intensity={50} tint="dark" style={es.ctaCardBlur}>
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
                </BlurView>
              </View>
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
                    {availableGyms.map((gym) => (
                      <TouchableOpacity
                        key={gym.id}
                        activeOpacity={0.8}
                        onPress={() =>
                          Alert.alert(
                            gym.name,
                            t('gymJoinPrompt'),
                            [{ text: t('close') }],
                          )
                        }
                      >
                        <BlurView intensity={40} tint="dark" style={es.gymCard}>
                          <View style={es.gymCardInner}>
                            {gym.logo_url ? (
                              <Image source={{ uri: gym.logo_url }} style={es.gymLogo} resizeMode="contain" />
                            ) : (
                              <View style={es.gymLogoPlaceholder}>
                                <Ionicons name="fitness" size={22} color={appTheme.colors.primary} />
                              </View>
                            )}
                            <View style={es.gymInfo}>
                              <Text style={es.gymName} numberOfLines={1}>{gym.name}</Text>
                              {(gym.city || gym.address) && (
                                <Text style={es.gymCity} numberOfLines={1}>{gym.city || gym.address}</Text>
                              )}
                            </View>
                          </View>
                        </BlurView>
                      </TouchableOpacity>
                    ))}

                    {/* Placeholder card */}
                    <View style={es.gymPlaceholderCard}>
                      <Ionicons name="add-circle-outline" size={28} color="rgba(255,255,255,0.20)" />
                      <Text style={es.gymPlaceholderText}>{t('notYourGym')}</Text>
                    </View>
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
                    <BlurView intensity={30} tint="dark" style={es.previewCard}>
                      <Ionicons name="podium-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('leaderboard')}</Text>
                      <Text style={es.previewCardSub}>{t('leaderboardSub')}</Text>
                    </BlurView>
                    <BlurView intensity={30} tint="dark" style={es.previewCard}>
                      <Ionicons name="gift-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('rewards')}</Text>
                      <Text style={es.previewCardSub}>{t('rewardsSub')}</Text>
                    </BlurView>
                  </View>
                  <View style={es.previewRow}>
                    <BlurView intensity={30} tint="dark" style={es.previewCard}>
                      <Ionicons name="flame-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('challenges')}</Text>
                      <Text style={es.previewCardSub}>{t('challengesSub')}</Text>
                    </BlurView>
                    <BlurView intensity={30} tint="dark" style={es.previewCard}>
                      <Ionicons name="trophy-outline" size={24} color="rgba(255,255,255,0.25)" />
                      <Text style={es.previewCardTitle}>{t('arenas')}</Text>
                      <Text style={es.previewCardSub}>{t('arenasSub')}</Text>
                    </BlurView>
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
        </SafeAreaView>
      </Animated.View>
    );
  }

  // Drops
  const totalDrops = profile?.total_drops || 0;
  // Global progress: cap at 10 000 for a full ring (tunable)
  const globalProgress = totalDrops > 0 ? Math.min(totalDrops / 10000, 1) : 0;
  // Local progress: local / total ratio
  const localProgressRatio =
    totalDrops > 0 ? Math.min(localDrops / Math.max(totalDrops, 1), 1) : 0;

  return (
    <Animated.View style={[{ flex: 1 }, fadeAnimatedStyle]}>
      <SafeAreaView style={styles.container} edges={['top']}>
      {/* Dynamic background */}
      {activeGym?.background_url ? (
        <ImageBackground
          source={{ uri: activeGym.background_url }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(8,8,8,0.70)', 'rgba(0,0,0,0.80)']}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
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
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {profile?.avatar_url || profile?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            )}
          </View>
          <Text style={styles.username}>{profile?.username || 'User'}</Text>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {activeGym && (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={styles.gymNameBadge}
            >
              <Text style={styles.gymNameText} numberOfLines={1}>
                {activeGym.name}
              </Text>
            </Animated.View>
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
        {/* DUAL-PROGRESS HERO SECTION                  */}
        {/* ═══════════════════════════════════════════ */}
        <View style={styles.heroSection}>
          <HeroDropsRing
            localDrops={localDrops}
            totalDrops={totalDrops}
            globalProgress={globalProgress}
            localProgress={localProgressRatio}
            size={240}
            onPress={() => router.push('/wallet')}
          />
          {/* Gym name under hero */}
          <Text style={[styles.heroGymName, { color: hexToRgba(branding.primary, 0.6) }]}>
            {activeGym?.name || ''}
          </Text>
        </View>

        {/* ═══════════════════════════════════════════ */}
        {/* QUICK STATS ROW                              */}
        {/* ═══════════════════════════════════════════ */}
        <QuickStatsRow
          streak={homeStats.streak}
          todayDrops={homeStats.todayDrops}
          lastWorkout={homeStats.lastWorkout}
          brandPrimary={branding.primary}
          onStreakPress={() => router.push('/workout-history')}
        />

        {/* ═══════════════════════════════════════════ */}
        {/* CHECK-IN CARD                                */}
        {/* ═══════════════════════════════════════════ */}
        {checkinStatus && checkinStatus.checkin_drops > 0 && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            {checkinStatus.already_checked_in ? (
              <View style={[styles.checkinCard, { borderColor: 'rgba(76, 175, 80, 0.2)' }]}>
                <BlurView intensity={40} tint="dark" style={[styles.checkinCardBlur, { backgroundColor: 'rgba(20, 30, 20, 0.7)' }]}>
                  <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.checkinCardTitle, { color: '#4CAF50' }]}>
                      ✅ {tCheckin('homeCardDone')}
                    </Text>
                    <Text style={styles.checkinCardSub}>{checkinStatus.gym_name}</Text>
                  </View>
                </BlurView>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.checkinCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}
                onPress={() => router.push('/scan')}
                activeOpacity={0.8}
              >
                <BlurView intensity={40} tint="dark" style={[styles.checkinCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                  <View style={[styles.checkinIconCircle, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                    <Ionicons name="qr-code-outline" size={22} color={branding.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkinCardTitle}>{tCheckin('homeCardTitle')}</Text>
                    <Text style={[styles.checkinCardDrops, { color: branding.primary }]}>
                      {tCheckin('homeCardDrops', { drops: checkinStatus.checkin_drops })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </BlurView>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

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

        {/* ═══════════════════════════════════════════ */}
        {/* CLOSEST REWARD BANNER                        */}
        {/* ═══════════════════════════════════════════ */}
        {homeStats.closestReward && isUnlocked && (
          <ClosestRewardBanner
            reward={homeStats.closestReward}
            brandPrimary={branding.primary}
            onPress={() => router.push('/store')}
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
                    <View style={[styles.challengeCardSkeleton, { borderColor: hexToRgba(branding.primary, 0.1) }]}>
                      <LinearGradient
                        colors={[hexToRgba(branding.primary, 0.04), hexToRgba(branding.primary, 0.02), 'rgba(15, 15, 30, 1)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
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
                      <TouchableOpacity
                        style={[styles.challengeCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                        onPress={() => {
                          if (!isUnlocked) return;
                          router.push({
                            pathname: '/challenge-detail',
                            params: { challengeId: challenge.challenge_id, gymId: activeGymId || '' },
                          });
                        }}
                        activeOpacity={isUnlocked ? 0.9 : 1}
                        disabled={!isUnlocked}
                      >
                        <BlurView intensity={50} tint="dark" style={styles.challengeBlur}>
                          <LinearGradient
                            colors={[hexToRgba(branding.primary, 0.06), 'rgba(20, 20, 35, 0.9)', hexToRgba(branding.primary, 0.03)]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
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
                        </BlurView>
                      </TouchableOpacity>
                    </View>
                  );
                })}

              </ScrollView>
            </View>
          )}

          {/* No Active Challenges — slim empty state */}
          {!challengesLoading && displayedChallenges.length === 0 && activeGymId && (
            <View style={styles.emptyChallengesBanner}>
              <BlurView intensity={50} tint="dark" style={styles.emptyChallengesBlur}>
                <Ionicons name="trophy-outline" size={20} color={hexToRgba(branding.primary, 0.5)} />
                <Text style={styles.emptyChallengesText}>
                  {t('noChallenges')}
                </Text>
              </BlurView>
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* SWEAT ARENAS CAROUSEL                       */}
          {/* ═══════════════════════════════════════════ */}
          {isUnlocked && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('arenas')}</Text>
                {availableArenas && availableArenas.length > 0 && (
                  <TouchableOpacity onPress={() => router.push('/arenas')} activeOpacity={0.7}>
                    <Text style={[styles.seeAllText, { color: branding.primary }]}>{t('viewAll')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {availableArenas && availableArenas.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.challengesScrollContent}
                  style={styles.challengesScrollView}
                  snapToInterval={SNAP_INTERVAL}
                  snapToAlignment="start"
                  decelerationRate="fast"
                >
                  {availableArenas.slice(0, 5).map((arena) => {
                    const isUpcoming = arena.arena_status === 'upcoming';
                    const targetDate = isUpcoming ? new Date(arena.start_date) : new Date(arena.end_date);
                    const daysLeft = Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    const scoringIcons: Record<string, string> = { total_drops: '💧', days_visited: '📅', variety_score: '🏋️', streak_days: '🔥' };
                    const scoringIcon = scoringIcons[arena.scoring_model] || '💧';

                    // Custom branding per arena
                    const arenaPrimary = arena.card_color || branding.primary;
                    const arenaText = arena.card_text_color || theme.colors.text;
                    const arenaGradientEnd = arena.card_gradient_end || 'rgba(20, 20, 35, 0.9)';

                    return (
                      <View key={arena.arena_id} style={[styles.challengeCardWrapper, { width: CHALLENGE_CARD_WIDTH }]}>
                        <TouchableOpacity
                          style={[styles.challengeCard, { borderColor: hexToRgba(arenaPrimary, isUpcoming ? 0.25 : 0.15) }]}
                          onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                          activeOpacity={0.9}
                        >
                          <BlurView intensity={50} tint="dark" style={styles.challengeBlur}>
                            <LinearGradient
                              colors={[hexToRgba(arenaPrimary, 0.08), arenaGradientEnd, hexToRgba(arenaPrimary, 0.04)]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
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
                                      <Image source={{ uri: arena.sponsor_logo }} style={styles.arenaSponsorLogo} resizeMode="contain" />
                                    ) : (
                                      <View style={[styles.arenaSponsorPlaceholder, { backgroundColor: hexToRgba(arenaPrimary, 0.15) }]}>
                                        <Ionicons name="trophy" size={14} color={arenaPrimary} />
                                      </View>
                                    )}
                                    <Text style={[styles.challengeType, { color: arenaPrimary }]}>{arena.sponsor_name}</Text>
                                    <Text style={styles.arenaScoringIcon}>{scoringIcon}</Text>
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
                          </BlurView>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <TouchableOpacity
                  style={[styles.arenaEmptyState, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                  onPress={() => router.push('/arenas')}
                  activeOpacity={0.8}
                >
                  <BlurView intensity={40} tint="dark" style={styles.arenaEmptyBlur}>
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
                  </BlurView>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* NEXT BADGE / PROGRESS WIDGET               */}
          {/* ═══════════════════════════════════════════ */}
          {isUnlocked && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('nextBadge')}</Text>
                <TouchableOpacity onPress={() => router.push('/trophy-room')} activeOpacity={0.7}>
                  <Text style={[styles.viewAllLink, { color: branding.primary }]}>{t('viewAll')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.progressWidgetContainer}>
                <ProgressWidget />
              </View>
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
                <BlurView intensity={50} tint="dark" style={styles.smartCoachBlur}>
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
                </BlurView>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* BENTO GRID - Bottom Cards Row              */}
          {/* ═══════════════════════════════════════════ */}
          <View style={styles.bottomCardsRow}>
            {/* Rewards Store Card */}
            <View style={styles.featureCardWrapper}>
              <TouchableOpacity
                style={[styles.featureCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                onPress={() => {
                  if (!isUnlocked) return;
                  router.push('/store');
                }}
                activeOpacity={isUnlocked ? 0.9 : 1}
                disabled={!isUnlocked}
              >
                <BlurView intensity={50} tint="dark" style={styles.featureCardBlur}>
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
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* Trophy Room Card */}
            <View style={styles.featureCardWrapper}>
              <TouchableOpacity
                style={[styles.featureCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                onPress={() => {
                  if (!isUnlocked) return;
                  router.push('/trophy-room');
                }}
                activeOpacity={isUnlocked ? 0.9 : 1}
                disabled={!isUnlocked}
              >
                <BlurView intensity={50} tint="dark" style={styles.featureCardBlur}>
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
                </BlurView>
              </TouchableOpacity>
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

      {/* User Settings Sheet */}
      <UserSettingsSheet
        visible={settingsSheetVisible}
        onClose={() => setSettingsSheetVisible(false)}
        profile={profile}
      />

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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
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
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  gymNameBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    maxWidth: 160,
  },
  gymNameText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: appTheme.colors.textSecondary,
    letterSpacing: 0.3,
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
  },
  challengeBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    height: '100%',
    width: '100%',
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  challengeCardSkeleton: {
    width: '100%',
    height: CHALLENGE_CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    opacity: 0.6,
    borderWidth: 1,
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
  arenaScoringIcon: {
    fontSize: 14,
    marginLeft: 'auto',
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
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 0,
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
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 24,
  },
  emptyChallengesBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  emptyChallengesText: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#808080',
    letterSpacing: 0.2,
    flex: 1,
  },

  /* ─── Progress Widget ───────────────────── */
  progressWidgetContainer: {
    alignItems: 'flex-start',
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
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    height: '100%',
  },
  featureCardBlur: {
    borderRadius: 20,
    padding: 16,
    flex: 1,
    justifyContent: 'space-between',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
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

  /* ─── Check-in Card ────────────────────── */
  checkinCard: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden' as const,
  },
  checkinCardBlur: {
    borderRadius: 16,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    gap: 12,
  },
  checkinIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  checkinCardTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: appTheme.colors.text,
  },
  checkinCardSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: appTheme.colors.textSecondary,
    marginTop: 1,
  },
  checkinCardDrops: {
    ...fontStyles.heading,
    fontSize: 14,
    marginTop: 1,
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
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
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
    elevation: 8,
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
    gap: 12,
    paddingRight: 16,
  },
  gymCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    width: 150,
    height: 130,
    backgroundColor: 'rgba(20,20,30,0.70)',
  },
  gymCardInner: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  gymLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  gymLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymInfo: {
    gap: 2,
  },
  gymName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  gymCity: {
    ...fontStyles.body,
    fontSize: 11,
    color: '#B0B0B0',
  },
  gymPlaceholderCard: {
    width: 130,
    height: 130,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,20,30,0.40)',
  },
  gymPlaceholderText: {
    ...fontStyles.body,
    fontSize: 11,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.25)',
    lineHeight: 16,
  },

  /* ── Preview Cards (locked features) ── */
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
