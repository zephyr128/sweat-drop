import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, {
  FadeInDown,
  FadeIn,
  ZoomIn,
  SlideInRight,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ChallengeProgressItem {
  challenge_id: string;
  challenge_name: string;
  target_drops: number;
  current_drops: number;
  reward_drops: number;
  is_completed: boolean;
  challenge_type: string;
}

export default function SessionSummaryScreen() {
  const { sessionId, drops, duration, multiplier, badges, gymId } = useLocalSearchParams<{
    sessionId: string;
    drops: string;
    duration: string;
    multiplier?: string;
    badges?: string;
    gymId?: string;
  }>();
  // Parse multiplier from award_drops() response (default 1.0)
  const streakMultiplier = multiplier ? parseFloat(multiplier) : 1.0;
  // Parse badge names from award_drops() response
  const awardedBadgeNames: string[] = badges ? (() => { try { return JSON.parse(badges); } catch { return []; } })() : [];
  const [session, setSession] = useState<any>(null);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnedBadges, setEarnedBadges] = useState<any[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgressItem[]>([]);
  const [streakDays, setStreakDays] = useState<number>(0);
  const router = useRouter();
  const { session: authSession } = useSession();
  const branding = useBranding();

  // Trophy pulse animation for badge earned
  const trophyScale = useSharedValue(1);
  useEffect(() => {
    if (earnedBadges.length > 0) {
      trophyScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 400 }),
          withTiming(1.0, { duration: 400 }),
        ),
        3, // 3 pulses
        false,
      );
    }
  }, [earnedBadges]);

  const trophyAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: trophyScale.value }],
  }));

  useEffect(() => {
    loadSession();
    loadLeaderboardRank();
    loadEarnedBadges();
    loadChallengeProgress();
    loadStreakDays();
  }, []);

  // Percentile depends on session being loaded
  useEffect(() => {
    if (session) {
      calculatePercentile();
    }
  }, [session]);

  const loadSession = async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('sessions')
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
      .eq('id', sessionId)
      .single();

    if (data) {
      setSession(data);
      if (data.gym?.name) {
        setGymName(data.gym.name);
      }
    }
    setLoading(false);
  };

  const loadLeaderboardRank = async () => {
    if (!authSession?.user || !gymId) return;

    try {
      const { data, error } = await supabase.rpc('get_local_leaderboard', {
        p_gym_id: gymId,
        p_period: 'weekly',
        p_limit: 100,
      });

      if (error) {
        console.error('Error loading leaderboard rank:', error);
        return;
      }

      if (data) {
        const userEntry = data.find((entry: any) => entry.user_id === authSession.user.id);
        if (userEntry) {
          setUserRank(Number(userEntry.rank));
        }
      }
    } catch (err) {
      console.error('Error in loadLeaderboardRank:', err);
    }
  };

  const loadChallengeProgress = async () => {
    if (!authSession?.user || !gymId) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Get active challenges for this gym
      const { data: challengesData, error: challengesError } = await supabase
        .from('gym_challenges')
        .select('id, name, challenge_type, target_drops, reward_drops, streak_days')
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today);

      if (challengesError || !challengesData || challengesData.length === 0) return;

      const challengeIds = challengesData.map((c) => c.id);

      // Get user's progress
      const { data: progressData } = await supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', authSession.user.id)
        .in('challenge_id', challengeIds);

      const items: ChallengeProgressItem[] = challengesData.map((challenge) => {
        const progress = progressData?.find((p) => p.challenge_id === challenge.id);
        const target = challenge.challenge_type === 'streak'
          ? (challenge.streak_days || challenge.target_drops || 0)
          : (challenge.target_drops || 0);
        const current = challenge.challenge_type === 'streak'
          ? (progress?.current_streak_days || 0)
          : (progress?.current_drops || 0);

        return {
          challenge_id: challenge.id,
          challenge_name: challenge.name,
          target_drops: target,
          current_drops: current,
          reward_drops: challenge.reward_drops,
          is_completed: progress?.is_completed || false,
          challenge_type: challenge.challenge_type,
        };
      });

      // Only show challenges that have progress (non-zero) or were just completed
      const relevantItems = items.filter((item) => item.current_drops > 0);
      setChallengeProgress(relevantItems);
    } catch (err) {
      console.error('Error in loadChallengeProgress:', err);
    }
  };

  const loadStreakDays = async () => {
    if (!authSession?.user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('streak_days')
        .eq('id', authSession.user.id)
        .single();

      if (data) {
        setStreakDays(data.streak_days || 0);
      }
    } catch (err) {
      console.error('Error in loadStreakDays:', err);
    }
  };

  const calculatePercentile = async () => {
    if (!authSession?.user || !drops || !session) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: allSessions } = await supabase
      .from('sessions')
      .select('drops_earned')
      .eq('gym_id', session.gym_id)
      .gte('started_at', today.toISOString())
      .not('drops_earned', 'is', null);

    if (allSessions && allSessions.length > 0) {
      const dropsValue = parseInt(drops);
      const betterSessions = allSessions.filter(
        (s) => (s.drops_earned || 0) < dropsValue
      ).length;
      const calculatedPercentile = Math.round(
        (betterSessions / allSessions.length) * 100
      );
      setPercentile(calculatedPercentile);
    }
  };

  const formatTime = (seconds: string) => {
    const secs = parseInt(seconds);
    const mins = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${mins}m ${sec}s`;
  };

  const loadEarnedBadges = async () => {
    if (!authSession?.user) return;

    try {
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      const { data, error } = await supabase.rpc('get_user_badges', {
        p_user_id: authSession.user.id,
      });

      if (error) {
        console.error('Error loading badges:', error);
        return;
      }

      const newlyEarned = (data || []).filter((badge: any) => {
        const earnedAt = new Date(badge.earned_at);
        return earnedAt >= fiveMinutesAgo;
      });

      setEarnedBadges(newlyEarned);
    } catch (err) {
      console.error('Error in loadEarnedBadges:', err);
    }
  };

  const getStreakEmoji = () => {
    if (streakDays >= 14) return '🔥🔥🔥';
    if (streakDays >= 7) return '🔥🔥';
    if (streakDays >= 3) return '🔥';
    return '💧';
  };

  const getMultiplierLabel = () => {
    if (streakMultiplier >= 2.0) return '14+ day streak';
    if (streakMultiplier >= 1.5) return '7+ day streak';
    if (streakMultiplier >= 1.2) return '3+ day streak';
    return '';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Celebration Header */}
        <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.celebrationHeader}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Workout Complete!</Text>
          <Text style={styles.subtitle}>Great job! Here's your summary</Text>
        </Animated.View>

        {/* Drops Hero */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
          <View style={[styles.dropsHero, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.dropsHeroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={[styles.dropsIconCircle, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                <Ionicons name="water" size={36} color={branding.primary} />
              </View>
              <Text style={[styles.dropsValue, getNumberStyle(48), { color: branding.primary }]}>
                +{drops || '0'}
              </Text>
              <Text style={styles.dropsLabel}>Drops Earned</Text>
              {streakMultiplier > 1.0 && (
                <View style={[styles.multiplierBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="flame" size={14} color={branding.primary} />
                  <Text style={[styles.multiplierText, { color: branding.primary }]}>
                    ×{streakMultiplier} streak bonus
                  </Text>
                </View>
              )}
            </BlurView>
          </View>
        </Animated.View>

        {/* Stats Row */}
        <Animated.View entering={FadeInDown.delay(550).duration(400)}>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="time" size={24} color={theme.colors.textSecondary} />
                <Text style={[styles.statValue, getNumberStyle(24)]}>
                  {formatTime(duration || '0')}
                </Text>
                <Text style={styles.statLabel}>Duration</Text>
              </BlurView>
            </View>
            {session?.equipment && (
              <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
                <BlurView intensity={50} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  <Ionicons name="barbell-outline" size={24} color={theme.colors.textSecondary} />
                  <Text style={styles.statEquipment} numberOfLines={1}>
                    {session.equipment.name}
                  </Text>
                  <Text style={styles.statLabel}>Equipment</Text>
                </BlurView>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Streak & Multiplier Card */}
        {streakDays > 0 && (
          <Animated.View entering={FadeInDown.delay(650).duration(400)}>
            <View style={[styles.streakCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.streakBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.06), 'transparent']}
                  style={styles.streakGlow}
                />
                <View style={styles.streakContent}>
                  <View style={styles.streakLeft}>
                    <Text style={styles.streakEmoji}>{getStreakEmoji()}</Text>
                    <View>
                      <Text style={[styles.streakValue, getNumberStyle(28), { color: branding.primary }]}>
                        {streakDays} day{streakDays !== 1 ? 's' : ''}
                      </Text>
                      <Text style={styles.streakLabel}>Current Streak</Text>
                    </View>
                  </View>
                  {streakMultiplier > 1.0 && (
                    <View style={[styles.multiplierPill, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                      <Text style={[styles.multiplierPillText, getNumberStyle(16), { color: branding.primary }]}>
                        ×{streakMultiplier}
                      </Text>
                      <Text style={[styles.multiplierPillLabel, { color: hexToRgba(branding.primary, 0.7) }]}>
                        {getMultiplierLabel()}
                      </Text>
                    </View>
                  )}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Leaderboard Rank Card */}
        {userRank !== null && (
          <Animated.View entering={FadeInDown.delay(700).duration(400)}>
            <View style={[styles.rankCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.rankBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                  style={styles.rankGlow}
                />
                <View style={styles.rankContent}>
                  <Text style={styles.rankEmoji}>
                    {userRank === 1 ? '🥇' : userRank === 2 ? '🥈' : userRank === 3 ? '🥉' : '📊'}
                  </Text>
                  <View style={styles.rankTextContainer}>
                    <Text style={styles.rankTitle}>
                      You're{' '}
                      <Text style={[getNumberStyle(18), { color: branding.primary }]}>
                        #{userRank}
                      </Text>
                      {' '}this week
                    </Text>
                    {gymName && (
                      <Text style={styles.rankSubtitle}>
                        at {gymName}
                      </Text>
                    )}
                  </View>
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Percentile Card */}
        {percentile !== null && session?.gym && (
          <Animated.View entering={FadeInDown.delay(750).duration(400)}>
            <View style={[styles.percentileCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.percentileBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                  style={styles.percentileGlow}
                />
                <View style={styles.percentileContent}>
                  <Text style={styles.percentileEmoji}>🔥</Text>
                  <Text style={styles.percentileText}>
                    You beat <Text style={[getNumberStyle(16), { color: branding.primary }]}>{percentile}%</Text> of people
                    in {session.gym.name} today!
                  </Text>
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Earned Badges — with celebration animation */}
        {earnedBadges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(850).duration(400)}>
            <View style={[styles.badgesSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.badgesBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <LinearGradient
                  colors={[hexToRgba('#FFD700', 0.08), 'transparent']}
                  style={styles.badgesGlow}
                />
                <Animated.View style={[styles.badgesHeader, trophyAnimStyle]}>
                  <Ionicons name="trophy" size={24} color="#FFD700" />
                  <Text style={styles.badgesSectionTitle}>
                    {earnedBadges.length === 1 ? 'New Badge Earned!' : `${earnedBadges.length} Badges Earned!`}
                  </Text>
                </Animated.View>
                <View style={styles.badgesGrid}>
                  {earnedBadges.map((badge, index) => (
                    <Animated.View
                      key={badge.badge_id}
                      entering={ZoomIn.delay(1000 + index * 150).duration(500).springify()}
                    >
                      <View style={[styles.badgeCard, { borderColor: hexToRgba('#FFD700', 0.25) }]}>
                        {badge.badge_image_url ? (
                          <Image
                            source={{ uri: badge.badge_image_url }}
                            style={styles.badgeImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={[styles.badgePlaceholder, { backgroundColor: hexToRgba('#FFD700', 0.12) }]}>
                            <Ionicons name="trophy" size={28} color="#FFD700" />
                          </View>
                        )}
                        <Text style={styles.badgeName} numberOfLines={2}>
                          {badge.challenge_name}
                        </Text>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Challenge Progress Section */}
        {challengeProgress.length > 0 && (
          <Animated.View entering={FadeInDown.delay(950).duration(400)}>
            <View style={[styles.challengeSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.challengeBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <View style={styles.challengeHeader}>
                  <Ionicons name="flag" size={20} color={branding.primary} />
                  <Text style={styles.challengeSectionTitle}>Challenge Progress</Text>
                </View>
                {challengeProgress.map((challenge, index) => {
                  const progressPercent = challenge.target_drops > 0
                    ? Math.min((challenge.current_drops / challenge.target_drops) * 100, 100)
                    : 0;
                  const unit = challenge.challenge_type === 'streak' ? 'days' : 'drops';

                  return (
                    <Animated.View
                      key={challenge.challenge_id}
                      entering={SlideInRight.delay(1050 + index * 100).duration(400)}
                    >
                      <View style={[
                        styles.challengeItem,
                        index < challengeProgress.length - 1 && styles.challengeItemBorder,
                      ]}>
                        <View style={styles.challengeItemHeader}>
                          <Text style={styles.challengeItemName} numberOfLines={1}>
                            {challenge.challenge_name}
                          </Text>
                          {challenge.is_completed && (
                            <View style={styles.completedPill}>
                              <Ionicons name="checkmark-circle" size={14} color={theme.colors.secondary} />
                              <Text style={styles.completedPillText}>Done!</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.challengeProgressBar}>
                          <View style={[styles.challengeProgressTrack, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                            <View
                              style={[
                                styles.challengeProgressFill,
                                {
                                  width: `${progressPercent}%`,
                                  backgroundColor: challenge.is_completed
                                    ? theme.colors.secondary
                                    : branding.primary,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.challengeProgressText}>
                            <Text style={[getNumberStyle(12), { color: branding.primary }]}>
                              {challenge.current_drops}
                            </Text>
                            <Text style={styles.challengeProgressDivider}> / </Text>
                            <Text style={[getNumberStyle(12), { color: theme.colors.textSecondary }]}>
                              {challenge.target_drops}
                            </Text>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
                              {' '}{unit}
                            </Text>
                          </Text>
                        </View>
                        {!challenge.is_completed && challenge.reward_drops > 0 && (
                          <View style={styles.challengeReward}>
                            <Ionicons name="water" size={12} color={hexToRgba(branding.primary, 0.6)} />
                            <Text style={[styles.challengeRewardText, { color: hexToRgba(branding.primary, 0.6) }]}>
                              {challenge.reward_drops} drops reward
                            </Text>
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Action Button */}
        <Animated.View entering={FadeInDown.delay(1100).duration(400)}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: branding.primary }]}
            onPress={async () => {
              try {
                const { useGymStore } = await import('@/lib/stores/useGymStore');
                const { useAuthStore } = await import('@/lib/stores/authStore');

                const currentHomeGymId = useGymStore.getState().homeGymId;

                // If user still has no home gym (first workout), use the session's gym
                if (!currentHomeGymId && gymId) {
                  console.log('[SessionSummary] No home gym in store — setting from session:', gymId);
                  // 1. Set in store immediately so home screen picks it up
                  useGymStore.getState().setHomeGymId(gymId);
                  // 2. Persist to DB
                  try {
                    const { data: { session: authSession } } = await supabase.auth.getSession();
                    if (authSession?.user) {
                      await supabase
                        .from('profiles')
                        .update({ home_gym_id: gymId })
                        .eq('id', authSession.user.id);
                    }
                  } catch (dbErr) {
                    console.warn('[SessionSummary] Failed to persist home gym to DB:', dbErr);
                  }
                }

                // Refresh auth profile so it stays in sync
                await useAuthStore.getState().refreshProfile();

                // Sync gymStore from refreshed profile (confirms DB is correct)
                const latestProfile = useAuthStore.getState().profile;
                if (latestProfile?.home_gym_id) {
                  useGymStore.getState().setHomeGymId(latestProfile.home_gym_id);
                }
              } catch (e) {
                console.warn('[SessionSummary] Failed to sync state:', e);
              }

              // Dismiss all pushed/modal screens to return to the original home screen
              if (router.canDismiss()) {
                router.dismissAll();
              } else {
                router.replace('/home');
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: branding.onPrimary }]}>Collect & Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  /* Celebration */
  celebrationHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    letterSpacing: 0.3,
  },
  /* Drops Hero */
  dropsHero: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  dropsHeroBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  dropsIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  dropsValue: {
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  dropsLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  multiplierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },
  multiplierText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  /* Stats Row */
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statValue: {
    fontSize: 22,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  statEquipment: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Streak */
  streakCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  streakBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  streakGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.xl,
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  streakEmoji: {
    fontSize: 32,
  },
  streakValue: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  streakLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  multiplierPill: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
  },
  multiplierPillText: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  multiplierPillLabel: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  /* Rank */
  rankCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  rankBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  rankGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.xl,
  },
  rankContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  rankEmoji: {
    fontSize: 32,
  },
  rankTextContainer: {
    flex: 1,
  },
  rankTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  rankSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  /* Percentile */
  percentileCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  percentileBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  percentileGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.xl,
  },
  percentileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  percentileEmoji: {
    fontSize: 28,
  },
  percentileText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  /* Badges */
  badgesSection: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  badgesBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  badgesGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.xl,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  badgesSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#FFD700',
    letterSpacing: 0.3,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  badgeCard: {
    width: 100,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
  },
  badgeImage: {
    width: 56,
    height: 56,
    marginBottom: theme.spacing.sm,
  },
  badgePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  badgeName: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.3,
  },
  /* Challenge Progress */
  challengeSection: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
  },
  challengeBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  challengeSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  challengeItem: {
    paddingVertical: theme.spacing.md,
  },
  challengeItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  challengeItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  challengeItemName: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(76, 217, 100, 0.12)',
  },
  completedPillText: {
    fontSize: 11,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
  challengeProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  challengeProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  challengeProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  challengeProgressText: {
    minWidth: 80,
  },
  challengeProgressDivider: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  challengeReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  challengeRewardText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  /* Button */
  button: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
