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
import { getNumberStyle } from '@/lib/theme';
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
import { useAvailableArenas } from '@/hooks/useAvailableArenas';
import { Gym } from '@/lib/stores/useGymStore';

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

  // ── New stats hook (streak, todayDrops, lastWorkout, closestReward, weeklyActivity) ──
  const { stats: homeStats, refresh: refreshStats } = useHomeStats(activeGymId, localDrops);

  // Available arenas
  const { arenas: availableArenas, refresh: refreshArenas } = useAvailableArenas();

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

  // Refresh challenges + stats + arenas when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (activeGymId && session?.user) {
        refreshChallenges?.();
        refreshStats?.();
        refreshArenas?.();
      }
    }, [activeGymId, session?.user, refreshChallenges, refreshStats, refreshArenas])
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
            onPress={() => router.push('/profile')}
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
          {/* SWEAT ARENAS CAROUSEL                       */}
          {/* ═══════════════════════════════════════════ */}
          {isUnlocked && (
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Arenas</Text>
                {availableArenas && availableArenas.length > 0 && (
                  <TouchableOpacity onPress={() => router.push('/leaderboard')} activeOpacity={0.7}>
                    <Text style={[styles.seeAllText, { color: branding.primary }]}>See All</Text>
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
                  {availableArenas.map((arena) => {
                    const daysLeft = Math.max(0, Math.ceil((new Date(arena.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    const scoringIcons: Record<string, string> = { total_drops: '💧', days_visited: '📅', variety_score: '🏋️', streak_days: '🔥' };
                    const scoringIcon = scoringIcons[arena.scoring_model] || '💧';

                    return (
                      <View key={arena.arena_id} style={[styles.challengeCardWrapper, { width: CHALLENGE_CARD_WIDTH }]}>
                        <TouchableOpacity
                          style={[styles.challengeCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                          onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                          activeOpacity={0.9}
                        >
                          <BlurView intensity={50} tint="dark" style={styles.challengeBlur}>
                            <LinearGradient
                              colors={[hexToRgba(branding.primary, 0.06), 'rgba(20, 20, 35, 0.9)', hexToRgba(branding.primary, 0.03)]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.challengeGradient}
                            >
                              <View style={styles.challengeContent}>
                                {/* Arena Header */}
                                <View style={styles.challengeHeader}>
                                  <View style={styles.arenaHeaderRow}>
                                    {arena.sponsor_logo ? (
                                      <Image source={{ uri: arena.sponsor_logo }} style={styles.arenaSponsorLogo} resizeMode="contain" />
                                    ) : (
                                      <View style={[styles.arenaSponsorPlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                                        <Ionicons name="trophy" size={14} color={branding.primary} />
                                      </View>
                                    )}
                                    <Text style={[styles.challengeType, { color: branding.primary }]}>{arena.sponsor_name}</Text>
                                    <Text style={styles.arenaScoringIcon}>{scoringIcon}</Text>
                                  </View>
                                  <Text style={styles.challengeName} numberOfLines={2}>{arena.name}</Text>
                                </View>

                                {/* Arena Stats */}
                                <View style={styles.arenaHomeStats}>
                                  <Text style={styles.arenaHomeStat}>{arena.participant_count} participants</Text>
                                  <Text style={[styles.arenaHomeStat, daysLeft <= 3 && { color: theme.colors.secondary }]}>
                                    {daysLeft} days left
                                  </Text>
                                </View>

                                {/* User rank or Join CTA */}
                                <View style={[styles.challengeReward, { borderTopColor: 'rgba(255, 255, 255, 0.08)' }]}>
                                  {arena.user_opted_in ? (
                                    <>
                                      <Text style={[styles.arenaRankLabel, { color: branding.primary }]}>
                                        Your Rank: #{arena.user_rank ?? '—'}
                                      </Text>
                                    </>
                                  ) : (
                                    <>
                                      <Ionicons name="add-circle-outline" size={16} color={branding.primary} />
                                      <Text style={[styles.challengeRewardText, { color: branding.primary }]}>Join Arena</Text>
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
                  onPress={() => router.push('/leaderboard')}
                  activeOpacity={0.8}
                >
                  <BlurView intensity={40} tint="dark" style={styles.arenaEmptyBlur}>
                    <View style={[styles.arenaEmptyIcon, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                      <Ionicons name="trophy-outline" size={28} color={branding.primary} />
                    </View>
                    <View style={styles.arenaEmptyTextContainer}>
                      <Text style={styles.arenaEmptyTitle}>No Active Arenas</Text>
                      <Text style={styles.arenaEmptySubtitle}>
                        Sponsor-branded competitions with prizes will appear here
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
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
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
    fontSize: 11,
    color: '#B0B0B0',
    letterSpacing: 0.2,
  },
  arenaRankLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Courier',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  arenaEmptySubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 15,
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
