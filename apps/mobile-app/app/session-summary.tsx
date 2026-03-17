import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  FadeIn,
  ZoomIn,
  SlideInRight,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function deriveSecondaryColor(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#33EBFF';
  const r = Math.min(255, Math.round(parseInt(result[1], 16) * 0.6 + 100));
  const g = Math.min(255, Math.round(parseInt(result[2], 16) * 0.7 + 80));
  const b = Math.min(255, Math.round(parseInt(result[3], 16) * 0.5 + 60));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
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
  const { t } = useTranslation('workout');
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

  // ── Circular Progress Ring Animation ──
  const innerColor = deriveSecondaryColor(branding.primary);
  const RING_SIZE = 180;
  const outerStroke = 8;
  const innerStroke = 6;
  const ringGap = 14;
  const outerRadius = (RING_SIZE - outerStroke) / 2;
  const innerRadius = outerRadius - outerStroke / 2 - ringGap - innerStroke / 2;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;

  // Animated progress values (outer = % of a "daily goal" of 500, inner = session progress)
  const animOuter = useSharedValue(0);
  const animInner = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const glowPulse = useSharedValue(0);

  useEffect(() => {
    // Outer ring: session drops as a % of 500 (a reasonable single-session goal)
    const dropsNum = parseInt(drops || '0');
    const outerTarget = Math.min(dropsNum / 500, 1);
    animOuter.value = withTiming(outerTarget, { duration: 1400, easing: Easing.out(Easing.cubic) });

    // Inner ring fills fully (represents the completed session)
    animInner.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });

    // Scale in entrance
    ringScale.value = withSpring(1, { damping: 12, stiffness: 140 });

    // Glow pulse loop
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [drops]);

  const outerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: outerCircumference * (1 - animOuter.value),
  }));
  const innerAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: innerCircumference * (1 - animInner.value),
  }));
  const ringScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowPulse.value, [0, 1], [0.15, 0.45]);
    const scale = interpolate(glowPulse.value, [0, 1], [1, 1.05]);
    return { opacity, transform: [{ scale }] };
  });

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
    if (streakMultiplier >= 2.0) return t('summary.streak14');
    if (streakMultiplier >= 1.5) return t('summary.streak7');
    if (streakMultiplier >= 1.2) return t('summary.streak3');
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
          <Text style={styles.title}>{t('summary.workoutComplete')}</Text>
          <Text style={styles.subtitle}>{t('summary.greatJob')}</Text>
        </Animated.View>

        {/* ── Drops Ring (matches home screen HeroDropsRing) ── */}
        <Animated.View entering={FadeInDown.delay(350).duration(500)} style={[ringScaleStyle, { alignSelf: 'center' }]}>
          <View style={[styles.ringWrapper, { width: RING_SIZE + 50, height: RING_SIZE + 50 }]}>
            {/* Glow pulse */}
            <Animated.View
              style={[
                styles.ringGlow,
                {
                  width: RING_SIZE + 30,
                  height: RING_SIZE + 30,
                  borderRadius: (RING_SIZE + 30) / 2,
                  shadowColor: branding.primary,
                  backgroundColor: hexToRgba(branding.primary, 0.05),
                },
                glowStyle,
              ]}
            />
            {/* SVG Rings */}
            <View style={[styles.ringContainer, { width: RING_SIZE, height: RING_SIZE }]}>
              <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                <Defs>
                  <SvgLinearGradient id="outerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={branding.primary} stopOpacity="1" />
                    <Stop offset="50%" stopColor={branding.primaryDark || branding.primary} stopOpacity="1" />
                    <Stop offset="100%" stopColor={branding.primary} stopOpacity="0.85" />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="innerGrad" x1="100%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor={innerColor} stopOpacity="0.85" />
                    <Stop offset="100%" stopColor={branding.primary} stopOpacity="0.4" />
                  </SvgLinearGradient>
                </Defs>

                {/* Outer track */}
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={outerRadius}
                  stroke={hexToRgba(branding.primary, 0.08)}
                  strokeWidth={outerStroke}
                  fill="transparent"
                />
                {/* Outer ring (progress) */}
                <AnimatedCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={outerRadius}
                  stroke="url(#outerGrad)"
                  strokeWidth={outerStroke}
                  fill="transparent"
                  strokeDasharray={outerCircumference}
                  animatedProps={outerAnimatedProps}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                />

                {/* Inner track */}
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={innerRadius}
                  stroke={hexToRgba(innerColor, 0.06)}
                  strokeWidth={innerStroke}
                  fill="transparent"
                />
                {/* Inner ring (session) */}
                <AnimatedCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={innerRadius}
                  stroke="url(#innerGrad)"
                  strokeWidth={innerStroke}
                  fill="transparent"
                  strokeDasharray={innerCircumference}
                  animatedProps={innerAnimatedProps}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                />
              </Svg>

              {/* Center text */}
              <View style={styles.ringCenter}>
                <Text
                  style={[styles.ringDropsValue, getNumberStyle(36), { color: '#FFFFFF' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  +{drops || '0'}
                </Text>
                <Text style={[styles.ringDropsLabel, { color: hexToRgba(branding.primary, 0.65) }]}>
                  {t('summary.dropsEarned')}
                </Text>
                {streakMultiplier > 1.0 && (
                  <View style={[styles.ringMultiplier, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Ionicons name="flame" size={11} color={branding.primary} />
                    <Text style={[styles.ringMultiplierText, { color: branding.primary }]}>
                      x{streakMultiplier.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Gym name under ring */}
        {gymName && (
          <Animated.View entering={FadeInDown.delay(500).duration(300)}>
            <Text style={styles.gymNameText}>📍 {gymName}</Text>
          </Animated.View>
        )}

        {/* ── Quick Stats Row (matches home screen pills) ── */}
        <Animated.View entering={FadeInDown.delay(550).duration(400)}>
          <View style={styles.statsRow}>
            {/* Duration */}
            <View style={styles.statPillWrapper}>
              <BlurView intensity={50} tint="dark" style={styles.statPill}>
                <View style={[styles.statPillIconBg, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                  <Ionicons name="time-outline" size={16} color={branding.primary} />
                </View>
                <View style={styles.statPillTextCol}>
                  <Text style={[styles.statPillValue, getNumberStyle(16)]}>
                    {formatTime(duration || '0')}
                  </Text>
                  <Text style={styles.statPillLabel}>{t('summary.duration')}</Text>
                </View>
              </BlurView>
            </View>

            {/* Streak */}
            <View style={styles.statPillWrapper}>
              <BlurView intensity={50} tint="dark" style={styles.statPill}>
                <View style={[styles.statPillIconBg, { backgroundColor: streakDays > 0 ? hexToRgba('#FF6B35', 0.2) : hexToRgba(branding.primary, 0.1) }]}>
                  <Ionicons name="flame" size={16} color={streakDays > 0 ? '#FF6B35' : '#808080'} />
                </View>
                <View style={styles.statPillTextCol}>
                  <Text style={[styles.statPillValue, getNumberStyle(16), streakDays > 0 && { color: '#FF6B35' }]}>
                    {streakDays}
                  </Text>
                  <Text style={styles.statPillLabel}>Streak</Text>
                </View>
              </BlurView>
            </View>

            {/* Rank or Percentile (whichever is available) */}
            {userRank !== null ? (
              <View style={styles.statPillWrapper}>
                <BlurView intensity={50} tint="dark" style={styles.statPill}>
                  <View style={[styles.statPillIconBg, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Text style={{ fontSize: 14 }}>
                      {userRank === 1 ? '🥇' : userRank === 2 ? '🥈' : userRank === 3 ? '🥉' : '🏆'}
                    </Text>
                  </View>
                  <View style={styles.statPillTextCol}>
                    <Text style={[styles.statPillValue, getNumberStyle(16), { color: branding.primary }]}>
                      #{userRank}
                    </Text>
                    <Text style={styles.statPillLabel}>{t('summary.rank') || 'Rang'}</Text>
                  </View>
                </BlurView>
              </View>
            ) : percentile !== null ? (
              <View style={styles.statPillWrapper}>
                <BlurView intensity={50} tint="dark" style={styles.statPill}>
                  <View style={[styles.statPillIconBg, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Text style={{ fontSize: 14 }}>📊</Text>
                  </View>
                  <View style={styles.statPillTextCol}>
                    <Text style={[styles.statPillValue, getNumberStyle(16)]}>
                      Top {100 - percentile}%
                    </Text>
                    <Text style={styles.statPillLabel}>{t('summary.today') || 'Danas'}</Text>
                  </View>
                </BlurView>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Earned Badges — horizontal scroll */}
        {earnedBadges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(700).duration(400)}>
            <View style={[styles.badgesSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <Animated.View style={[styles.badgesHeader, trophyAnimStyle]}>
                <Ionicons name="trophy" size={20} color="#FFD700" />
                <Text style={styles.badgesSectionTitle}>
                  {t('summary.newBadge', { count: earnedBadges.length })}
                </Text>
              </Animated.View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgesScroll}
              >
                {earnedBadges.map((badge, index) => (
                  <Animated.View
                    key={badge.badge_id}
                    entering={ZoomIn.delay(800 + index * 100).duration(400).springify()}
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
                          <Ionicons name="trophy" size={24} color="#FFD700" />
                        </View>
                      )}
                      <Text style={styles.badgeName} numberOfLines={2}>
                        {badge.challenge_name}
                      </Text>
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        {/* Challenge Progress Section */}
        {challengeProgress.length > 0 && (
          <Animated.View entering={FadeInDown.delay(850).duration(400)}>
            <View style={[styles.challengeSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <View style={styles.challengeHeader}>
                <Ionicons name="flag" size={18} color={branding.primary} />
                <Text style={styles.challengeSectionTitle}>{t('summary.challengeProgress')}</Text>
              </View>
              {challengeProgress.map((challenge, index) => {
                const progressPercent = challenge.target_drops > 0
                  ? Math.min((challenge.current_drops / challenge.target_drops) * 100, 100)
                  : 0;
                const unit = (challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak')
                  ? t('summary.days')
                  : t('drops');

                return (
                  <Animated.View
                    key={challenge.challenge_id}
                    entering={SlideInRight.delay(950 + index * 80).duration(350)}
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
                            <Text style={styles.completedPillText}>{t('summary.done')}</Text>
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
                            {t('summary.dropsReward', { count: challenge.reward_drops })}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Action Button */}
        <Animated.View entering={FadeInDown.delay(1000).duration(400)}>
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
                  useGymStore.getState().setHomeGymId(gymId);
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

                await useAuthStore.getState().refreshProfile();

                const latestProfile = useAuthStore.getState().profile;
                if (latestProfile?.home_gym_id) {
                  useGymStore.getState().setHomeGymId(latestProfile.home_gym_id);
                }
              } catch (e) {
                console.warn('[SessionSummary] Failed to sync state:', e);
              }

              if (router.canDismiss()) {
                router.dismissAll();
              } else {
                router.replace('/home');
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: branding.onPrimary }]}>{t('summary.collectAndClose')}</Text>
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
    padding: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
    gap: 8,
  },
  /* Celebration */
  celebrationHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    paddingTop: theme.spacing.md,
  },
  emoji: {
    fontSize: 40,
    marginBottom: theme.spacing.xs,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 28,
    color: theme.colors.text,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    letterSpacing: 0.3,
  },
  /* ── Drops Ring (matches HeroDropsRing) ── */
  ringWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringGlow: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 16,
  },
  ringContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  ringDropsValue: {
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    includeFontPadding: false,
  },
  ringDropsLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 1,
  },
  ringMultiplier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  ringMultiplierText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  /* Gym name */
  gymNameText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  /* ── Quick Stats Row (matches QuickStatsRow pills) ── */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statPillWrapper: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  statPillIconBg: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statPillTextCol: {
    flex: 1,
    minWidth: 0,
  },
  statPillValue: {
    color: '#FFFFFF',
    lineHeight: 20,
  },
  statPillLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 10,
    color: '#808080',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  /* Badges — horizontal scroll */
  badgesSection: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    padding: theme.spacing.md,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  badgesSectionTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#FFD700',
  },
  badgesScroll: {
    gap: 8,
    paddingHorizontal: 2,
  },
  badgeCard: {
    width: 80,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    borderWidth: 1,
  },
  badgeImage: {
    width: 44,
    height: 44,
    marginBottom: 4,
  },
  badgePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeName: {
    ...fontStyles.bodyMedium,
    fontSize: 10,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  /* Challenge Progress */
  challengeSection: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    padding: theme.spacing.md,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  challengeSectionTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
  },
  challengeItem: {
    paddingVertical: theme.spacing.sm,
  },
  challengeItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  challengeItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  challengeItemName: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
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
    ...fontStyles.bodySemiBold,
    fontSize: 11,
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
    marginTop: theme.spacing.sm,
  },
  buttonText: {
    ...fontStyles.heading,
    fontSize: 20,
  },
});
