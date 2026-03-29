import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, ImageBackground, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { useGymData } from '@/hooks/useGymData';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { useBadgeNotifications } from '@/hooks/useBadgeNotifications';
import { theme as staticTheme, getNumberStyle } from '@/lib/theme';
import { ConfettiEffect } from '@/components/ConfettiEffect';
import { GymSelectorModal } from '@/components/GymSelectorModal';
import { LockedOverlay } from '@/components/LockedOverlay';
import { UserSettingsSheet } from '@/components/UserSettingsSheet';
import { ProgressWidget } from '@/components/ProgressWidget';
import { HeroDropsRing } from '@/components/HeroDropsRing';
import { LeaderboardPreview } from '@/components/LeaderboardPreview';
import { QuickStatsRow } from '@/components/QuickStatsRow';
import { ClosestRewardBanner } from '@/components/ClosestRewardBanner';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { useHomeStats } from '@/hooks/useHomeStats';
import { Gym } from '@/lib/stores/useGymStore';
import { GymCard } from '@/components/GymCard';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const { session } = useSession();
  const { theme, activeGym, isUnlocked } = useTheme();
  const branding = useBranding();
  const { getActiveGymId, setPreviewGymId, setActiveGym, homeGymId, previewGymId } = useGymStore();
  const { updateHomeGym } = useGymData();
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
  const [gymSelectorVisible, setGymSelectorVisible] = useState(false);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // No-gym state: available gyms for discovery
  const [availableGyms, setAvailableGyms] = useState<Gym[]>([]);
  const [availableGymsLoading, setAvailableGymsLoading] = useState(false);

  // Welcome banner: shown until first workout or dismissed
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);

  const hasHomeGym = !!homeGymId;

  // ── New stats hook (streak, todayDrops, lastWorkout, closestReward, weeklyActivity) ──
  const { stats: homeStats, refresh: refreshStats } = useHomeStats(activeGymId, localDrops);

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
  const activeChallenges = allChallenges;
  const displayedChallenges = activeChallenges;
  
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
  useEffect(() => {
    if (session?.user) {
      loadData();
      refreshLocalDrops();
    }
  }, [session, homeGymId, previewGymId, activeGymId]);

  // Load available gyms when no home gym is set
  useEffect(() => {
    if (!hasHomeGym && session?.user) {
      loadAvailableGyms();
    }
  }, [hasHomeGym, session?.user]);

  // Check welcome banner visibility
  useEffect(() => {
    if (hasHomeGym && profile) {
      checkWelcomeBanner();
    }
  }, [hasHomeGym, profile]);

  // Refresh challenges + stats when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (activeGymId && session?.user) {
        refreshChallenges?.();
        refreshStats?.();
      }
    }, [activeGymId, session?.user, refreshChallenges, refreshStats])
  );

  const loadData = async () => {
    if (!session?.user) return;
    setLoading(true);

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableGyms = async () => {
    setAvailableGymsLoading(true);
    try {
      const { data: gymsData } = await supabase
        .from('gyms')
        .select('*')
        .order('is_founding_partner', { ascending: false })
        .order('name');

      if (!gymsData) { setAvailableGyms([]); return; }

      const gymsWithBranding = await Promise.all(
        gymsData.map(async (gym) => {
          let branding = { primary_color: '#00E5FF', logo_url: null as string | null, background_url: null as string | null };
          if (gym.owner_id) {
            const { data: ob } = await supabase
              .from('owner_branding')
              .select('primary_color, logo_url, background_url')
              .eq('owner_id', gym.owner_id)
              .single();
            if (ob) {
              branding = {
                primary_color: ob.primary_color || branding.primary_color,
                logo_url: ob.logo_url || branding.logo_url,
                background_url: ob.background_url || branding.background_url,
              };
            }
          }
          return { ...gym, primary_color: branding.primary_color, logo_url: branding.logo_url, background_url: branding.background_url };
        })
      );
      setAvailableGyms(gymsWithBranding);
    } catch (error) {
      console.error('Error loading available gyms:', error);
    } finally {
      setAvailableGymsLoading(false);
    }
  };

  const checkWelcomeBanner = async () => {
    try {
      const dismissed = await AsyncStorage.getItem('welcome_banner_dismissed');
      if (dismissed) { setShowWelcomeBanner(false); return; }
      const hasWorkouts = homeStats.todayDrops > 0 || homeStats.streak > 0 || homeStats.lastWorkout !== '--';
      setShowWelcomeBanner(!hasWorkouts);
    } catch {
      setShowWelcomeBanner(false);
    }
  };

  const dismissWelcomeBanner = async () => {
    setShowWelcomeBanner(false);
    await AsyncStorage.setItem('welcome_banner_dismissed', 'true');
  };

  const handleSetHomeGymFromCard = async (gym: Gym) => {
    if (!session?.user) return;
    try {
      await updateHomeGym(gym.id);
    } catch {
      Alert.alert('Error', 'Failed to set home gym. Please try again.');
    }
  };

  const handleQRPress = async () => {
    router.push('/scan');
  };

  const handleGymSelect = (gym: Gym) => {
    setPreviewGymId(gym.id);
    setActiveGym(gym);
  };

  const handleSetAsHomeGym = async () => {
    if (!activeGym) return;
    Alert.alert(
      'Set as Home Gym?',
      `Do you want to set "${activeGym.name}" as your home gym?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set as Home',
          onPress: async () => {
            try {
              await updateHomeGym(activeGym.id);
            } catch (error) {
              Alert.alert('Error', 'Failed to update home gym. Please try again.');
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

  // ═══════════════════════════════════════════
  // NO GYM STATE — shown when user has no home gym
  // ═══════════════════════════════════════════
  if (!hasHomeGym && !previewGymId) {
    return (
      <Animated.View style={[{ flex: 1 }, fadeAnimatedStyle]}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <LinearGradient
            colors={['#080808', '#0A0E1A', '#080808'] as any}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.headerLeft}
                onPress={() => setSettingsSheetVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.avatarContainer, { borderColor: 'rgba(0,229,255,0.3)' }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                    {profile?.username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
                <Text style={styles.username}>{profile?.username || 'User'}</Text>
              </TouchableOpacity>
            </View>

            {/* Hero — Get Started */}
            <Animated.View style={noGymStyles.heroCard}>
              <BlurView intensity={50} tint="dark" style={noGymStyles.heroBlur}>
                <Ionicons name="water" size={48} color={theme.colors.primary} style={{ marginBottom: 12 }} />
                <Text style={noGymStyles.heroTitle}>Ready to Start Earning?</Text>
                <Text style={noGymStyles.heroSubtitle}>
                  Set your home gym to unlock workouts, rewards, challenges, and more.
                </Text>
              </BlurView>
            </Animated.View>

            {/* Available Gyms */}
            <Text style={noGymStyles.sectionTitle}>Available Gyms</Text>

            {availableGymsLoading ? (
              <View style={{ paddingVertical: 32 }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : (
              <>
                {availableGyms.map((gym) => (
                  <View key={gym.id} style={{ marginBottom: 16 }}>
                    <GymCard
                      gym={gym}
                      onSetHomeGym={() => handleSetHomeGymFromCard(gym)}
                      onDetails={() => router.push({ pathname: '/gym-detail', params: { gymId: gym.id } })}
                      variant="full"
                    />
                  </View>
                ))}

                {/* Coming soon */}
                <View style={noGymStyles.comingSoonCard}>
                  <Ionicons name="add-circle-outline" size={20} color={theme.colors.textTertiary} />
                  <Text style={noGymStyles.comingSoonText}>More gyms coming soon</Text>
                </View>
              </>
            )}

            {/* How It Works */}
            <Text style={[noGymStyles.sectionTitle, { marginTop: 24 }]}>How It Works</Text>
            <View style={noGymStyles.stepsRow}>
              {[
                { icon: 'qr-code' as const, label: 'Scan' },
                { icon: 'barbell' as const, label: 'Train' },
                { icon: 'water' as const, label: 'Earn' },
                { icon: 'gift' as const, label: 'Redeem' },
              ].map((step, i) => (
                <React.Fragment key={step.label}>
                  {i > 0 && (
                    <Ionicons name="chevron-forward" size={14} color={theme.colors.textTertiary} style={{ marginTop: -12 }} />
                  )}
                  <View style={noGymStyles.stepItem}>
                    <View style={noGymStyles.stepIconContainer}>
                      <Ionicons name={step.icon} size={24} color={theme.colors.primary} />
                    </View>
                    <Text style={noGymStyles.stepLabel}>{step.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </ScrollView>

          {/* Settings Sheet (still accessible) */}
          <UserSettingsSheet
            visible={settingsSheetVisible}
            onClose={() => setSettingsSheetVisible(false)}
            profile={profile}
          />
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
            colors={['rgba(0,0,0,0.85)', 'rgba(8,8,8,0.92)', 'rgba(0,0,0,0.88)']}
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ═══════════════════════════════════════════ */}
        {/* DYNAMIC HEADER                              */}
        {/* ═══════════════════════════════════════════ */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => setSettingsSheetVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatarContainer, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
              <Text style={[styles.avatarText, { color: branding.primary }]}>
                {profile?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.username}>{profile?.username || 'User'}</Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            {/* Gym Selector Pill */}
            <TouchableOpacity
              style={[styles.gymSelectorChip, { borderColor: hexToRgba(branding.primary, 0.4) }]}
              onPress={() => setGymSelectorVisible(true)}
              activeOpacity={0.8}
            >
              {activeGym?.logo_url ? (
                <Image
                  source={{ uri: activeGym.logo_url }}
                  style={styles.gymSelectorLogo}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="fitness" size={14} color={branding.primary} />
              )}
              <Text style={[styles.gymSelectorText, { color: branding.primary }]} numberOfLines={1} ellipsizeMode="tail">
                {activeGym?.name || 'Gym'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={branding.primary} />
            </TouchableOpacity>

          </View>
        </View>

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
        {/* WELCOME BANNER (first visit)                  */}
        {/* ═══════════════════════════════════════════ */}
        {showWelcomeBanner && activeGym && (
          <View style={[noGymStyles.welcomeBanner, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={noGymStyles.welcomeBannerBlur}>
              <View style={noGymStyles.welcomeBannerContent}>
                <View style={{ flex: 1 }}>
                  <Text style={noGymStyles.welcomeBannerTitle}>
                    Welcome to {activeGym.name}! 👋
                  </Text>
                  <Text style={noGymStyles.welcomeBannerText}>
                    Scan a QR code on any machine to start your first workout and earn drops.
                  </Text>
                </View>
                <TouchableOpacity onPress={dismissWelcomeBanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* QUICK STATS ROW                              */}
        {/* ═══════════════════════════════════════════ */}
        <QuickStatsRow
          streak={homeStats.streak}
          todayDrops={homeStats.todayDrops}
          lastWorkout={homeStats.lastWorkout}
          brandPrimary={branding.primary}
        />

        {/* ═══════════════════════════════════════════ */}
        {/* WEEKLY ACTIVITY CHART                        */}
        {/* ═══════════════════════════════════════════ */}
        {homeStats.weeklyActivity.length > 0 && (
          <WeeklyActivityChart
            data={homeStats.weeklyActivity}
            activeDays={homeStats.activeDaysThisWeek}
            brandPrimary={branding.primary}
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
                <Text style={styles.sectionTitle}>Active Challenges</Text>
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
                <Text style={styles.sectionTitle}>Active Challenges</Text>
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
                      case 'daily': return 'Daily';
                      case 'weekly': return 'Weekly';
                      case 'monthly': return 'Monthly';
                      case 'streak': return 'Streak';
                      case 'milestone': return 'Milestone';
                      default: return 'Challenge';
                    }
                  };

                  const getProgressLabel = () => {
                    if (challenge.challenge_type === 'streak') {
                      return { current: challenge.current_streak_days, target: challenge.target_drops, unit: 'days' };
                    } else {
                      return { current: challenge.current_drops, target: challenge.target_drops, unit: 'drops' };
                    }
                  };

                  const progressLabel = getProgressLabel();
                  
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
                                <Text style={[styles.challengeType, { color: branding.primary }]}>
                                  {getChallengeTypeLabel()}
                                </Text>
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

                {/* View All Button */}
                <View style={[styles.viewAllCardWrapper, { width: CHALLENGE_CARD_WIDTH }]}>
                  <TouchableOpacity
                    style={styles.viewAllCard}
                    onPress={() => {
                      if (!isUnlocked) return;
                      router.push('/challenges');
                    }}
                    activeOpacity={isUnlocked ? 0.9 : 1}
                    disabled={!isUnlocked}
                  >
                    <LinearGradient
                      colors={[branding.primary, branding.primaryDark, branding.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.viewAllGradient}
                    >
                      <View style={styles.viewAllContent}>
                        <View style={[styles.viewAllIconContainer, { backgroundColor: hexToRgba(branding.onPrimary, 0.2) }]}>
                          <Ionicons name="list" size={40} color={branding.onPrimary} />
                        </View>
                        <Text style={[styles.viewAllText, { color: branding.onPrimary }]}>View All</Text>
                        <Text style={[styles.viewAllSubtext, { color: branding.onPrimary + 'CC' }]}>See all challenges</Text>
                        <Ionicons name="arrow-forward-circle" size={24} color={branding.onPrimary} style={styles.viewAllArrow} />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          )}

          {/* No Active Challenges — slim empty state */}
          {!challengesLoading && displayedChallenges.length === 0 && activeGymId && (
            <View style={styles.emptyChallengesBanner}>
              <BlurView intensity={50} tint="dark" style={styles.emptyChallengesBlur}>
                <Ionicons name="trophy-outline" size={20} color={hexToRgba(branding.primary, 0.5)} />
                <Text style={styles.emptyChallengesText}>
                  No active challenges right now — check back soon!
                </Text>
              </BlurView>
            </View>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* NEXT BADGE / PROGRESS WIDGET               */}
          {/* ═══════════════════════════════════════════ */}
          {isUnlocked && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Next Badge</Text>
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
                            Follow workout plans from your gym
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
                    <Text style={styles.cardTitle}>Rewards Store</Text>
                    <Text 
                      style={styles.cardSubtitle}
                      numberOfLines={2}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.8}
                    >
                      Redeem your drops for exclusive rewards
                    </Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardAction, { color: branding.primary }]}>View Store</Text>
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
                    <Text style={styles.cardTitle}>Trophy Room</Text>
                    <Text 
                      style={styles.cardSubtitle}
                      numberOfLines={2}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.8}
                    >
                      View your earned badges & achievements
                    </Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardAction, { color: branding.primary }]}>View Badges</Text>
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

      {/* Gym Selector Modal */}
      <GymSelectorModal
        visible={gymSelectorVisible}
        onClose={() => setGymSelectorVisible(false)}
        onSelectGym={handleGymSelect}
      />

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
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Courier',
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  gymSelectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    maxWidth: 120,
    flexShrink: 1,
  },
  gymSelectorLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    flexShrink: 0,
  },
  gymSelectorText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  /* ─── Hero Section ──────────────────────── */
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 8,
  },
  heroGymName: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
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
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
  challengeType: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: 14,
    fontWeight: '700',
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
    fontSize: 12,
    fontWeight: '600',
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

  /* ─── View All ──────────────────────────── */
  viewAllCardWrapper: {
    marginRight: 12,
    height: 200,
  },
  viewAllCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    height: '100%',
    width: '100%',
  },
  viewAllGradient: {
    borderRadius: 16,
    height: '100%',
    width: '100%',
  },
  viewAllContent: {
    padding: 16,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  viewAllIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  viewAllText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  viewAllSubtext: {
    fontSize: 12,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  viewAllArrow: {
    marginTop: 8,
    opacity: 0.8,
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
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  smartCoachSubtitle: {
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
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardSubtitle: {
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
    fontSize: 14,
    fontWeight: '600',
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

const noGymStyles = StyleSheet.create({
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 28,
  },
  heroBlur: {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    padding: 28,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  comingSoonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 14,
    color: '#808080',
    letterSpacing: 0.3,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  stepItem: {
    alignItems: 'center',
    gap: 6,
  },
  stepIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B0B0B0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  welcomeBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 16,
  },
  welcomeBannerBlur: {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  welcomeBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  welcomeBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  welcomeBannerText: {
    fontSize: 13,
    color: '#B0B0B0',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
});
