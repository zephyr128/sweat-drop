import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, AppState } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useState, useEffect, useMemo } from 'react';
import { loadPendingFinalization, clearPendingFinalization } from '@/lib/workout/pendingFinalization';
import { useSession } from '@/hooks/useSession';
import { useDropLimitStatus } from '@/hooks/useDropLimitStatus';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
import { log } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import { BadgeCard } from '@/components/BadgeCard';
import { BadgeDetailModal } from '@/components/BadgeDetailModal';
import type { UserBadge } from '@/hooks/useUserBadges';
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
  completed_at: string | null;
  challenge_type: string;
}

export default function SessionSummaryScreen() {
  const { sessionId, drops, duration, multiplier, badges, gymId, securityStatus, securityMessage, sessionTier, trackingOnly, pendingSync } = useLocalSearchParams<{
    sessionId: string;
    drops: string;
    duration: string;
    multiplier?: string;
    badges?: string;
    gymId?: string;
    securityStatus?: string;
    securityMessage?: string;
    sessionTier?: string;
    trackingOnly?: string;
    pendingSync?: string;
  }>();
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
  const [completedChallenges, setCompletedChallenges] = useState<ChallengeProgressItem[]>([]);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [resolvedDrops, setResolvedDrops] = useState<number | null>(null);
  const [resolvedMultiplier, setResolvedMultiplier] = useState<number | null>(null);
  const [resolvedBadges, setResolvedBadges] = useState<string[] | null>(null);
  const [syncingDrops, setSyncingDrops] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const router = useRouter();
  const { session: authSession } = useSession();
  const branding = useBranding();
  const insets = useSafeAreaInsets();
  const { activeGym } = useTheme();
  const dropLimit = useDropLimitStatus(gymId || null);
  const dropsNum = resolvedDrops ?? parseInt(drops || '0');
  const effectiveMultiplier = resolvedMultiplier ?? (multiplier ? parseFloat(multiplier) : 1.0);
  const wasTrackingOnly = trackingOnly === '1';
  const isLimitCapped = dropsNum <= 0 && dropLimit.limitReached && !securityStatus;
  const isSoftWarning = dropsNum > 0 && dropLimit.softSessionWarning && !securityStatus;
  const wasReducedTier = sessionTier === 'tier1' || sessionTier === 'tier2';
  const wasDayCapHit = dropsNum <= 0 && dropLimit.dailyRemaining <= 0 && !securityStatus;
  const wasWeekCapHit = dropsNum <= 0 && dropLimit.weeklyRemaining <= 0 && !securityStatus;
  const badgeNamesFromFinalize = useMemo(() => {
    const source = resolvedBadges ?? awardedBadgeNames;
    return new Set(
      (source || [])
        .map((name) => (typeof name === 'string' ? name.trim().toLowerCase() : ''))
        .filter(Boolean),
    );
  }, [resolvedBadges, awardedBadgeNames]);

  const happyHourBreakdown = useMemo(() => {
    const rm = session?.raw_metrics as Record<string, any> | null;
    const hh = rm?.drop_calc_v2?.happy_hour;
    log.debug('[SessionSummary] HH check:', {
      hasSession: !!session,
      hasRawMetrics: !!rm,
      hasDropCalcV2: !!rm?.drop_calc_v2,
      happyHour: hh ? JSON.stringify(hh) : 'null',
      dropsNum,
      wasTrackingOnly,
    });
    if (!hh || !hh.active) return null;
    const mult = Number(hh.multiplier ?? 1);
    if (mult <= 1) return null;
    const preBoost = Number(hh.pre_boost_drops ?? rm?.drop_calc_v2?.raw_drops ?? 0);
    const postBoost = Number(hh.post_boost_drops ?? Math.round(preBoost * mult));
    if (preBoost <= 0) return null;
    const result = { multiplier: mult, preBoostDrops: preBoost, postBoostDrops: postBoost };
    log.debug('[SessionSummary] HH breakdown result:', result);
    return result;
  }, [session, dropsNum, wasTrackingOnly]);

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
    const effectiveDrops = resolvedDrops ?? parseInt(drops || '0');
    const outerTarget = Math.min(effectiveDrops / 500, 1);
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
  }, [drops, resolvedDrops]);

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
    loadStreakDays();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, gymId]);

  // Depends on session being loaded:
  // After session is available, eagerly process side effects (badges, challenges,
  // arena scores) that award_drops enqueued asynchronously, then load the results.
  useEffect(() => {
    if (session) {
      calculatePercentile();
      (async () => {
        try {
          await supabase.rpc('process_session_side_effects_eager', {
            p_session_id: session.id,
          });
        } catch (err) {
          log.warn('[SessionSummary] Eager side effects failed, data may be stale:', err);
        }
        loadChallengeProgress(session.started_at);
        await loadEarnedBadges(session.started_at);
      })();
    }
  }, [session]);

  // If award_drops recovery later resolves badge names, re-run badge load once
  // so summary can include them in the current session scope.
  useEffect(() => {
    if (!session || !resolvedBadges?.length) return;
    void loadEarnedBadges(session.started_at);
  }, [session, resolvedBadges]);

  const loadSession = async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    // Retry up to 4 times (0ms, 400ms, 1200ms, 2400ms) waiting for award_drops()
    // to finish writing drop_calc_v2 into raw_metrics before giving up.
    const delays = [0, 400, 1200, 2400];
    let lastData: any = null;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        const { data } = await supabase
          .from('sessions')
          .select('*, machine:machine_id(*), gym:gym_id(*)')
          .eq('id', sessionId)
          .single();

        if (data) {
          lastData = data;
          const hasCalc = !!(data.raw_metrics as any)?.drop_calc_v2;
          if (hasCalc) break; // drop_calc_v2 is available, no need to retry
        }
      } catch (err) {
        log.error('[SessionSummary] Error in loadSession attempt', attempt, err);
      }
    }

    if (lastData) {
      const dc = (lastData.raw_metrics as any)?.drop_calc_v2;
      log.debug('[SessionSummary] Server drop_calc_v2:', {
        hasDropCalcV2: !!dc,
        inputs: dc?.inputs,
        raw_drops: dc?.raw_drops,
        adjusted_drops: dc?.adjusted_drops,
        applied_multiplier: dc?.applied_multiplier,
        soft_session: dc?.soft_session,
        happyHour: dc?.happy_hour,
        caps: dc?.caps,
        reasons: dc?.reasons,
        dropsEarned: lastData.drops_earned,
        duration_seconds: lastData.duration_seconds,
        sessionId: lastData.id,
      });
      setSession(lastData);
      if (lastData.gym?.name) {
        setGymName(lastData.gym.name);
      }

      // If the DB already has drops_earned from a prior successful award_drops,
      // use that as the resolved value even if the client missed the response.
      if (lastData.drops_earned > 0 && pendingSync === '1') {
        setResolvedDrops(lastData.drops_earned);
        setResolvedMultiplier(lastData.multiplier ?? null);
        await clearPendingFinalization();
        setLoading(false);
        return;
      }
    }

    // Recover from a network failure during workout finalization:
    // If pendingSync is flagged or a pending record exists in AsyncStorage,
    // attempt one more award_drops call now that we're on a fresh screen.
    await recoverPendingFinalization();

    setLoading(false);
  };

  const recoverPendingFinalization = async () => {
    const shouldRecover = pendingSync === '1';
    if (!shouldRecover || !sessionId) return;

    const pending = await loadPendingFinalization();
    if (!pending || pending.sessionId !== sessionId) {
      if (pending?.sessionId !== sessionId) await clearPendingFinalization();
      return;
    }

    setSyncingDrops(true);
    setSyncFailed(false);
    log.debug('[SessionSummary] Recovering pending finalization for session:', sessionId);

    try {
      const { data, error } = await supabase.rpc('award_drops', { p_session_id: sessionId });

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0];
        setResolvedDrops(row.drops_earned ?? 0);
        setResolvedMultiplier(row.multiplier ?? null);
        setResolvedBadges(row.badges_earned?.length ? row.badges_earned : null);
        log.debug('[SessionSummary] Pending finalization recovered:', {
          drops_earned: row.drops_earned,
          multiplier: row.multiplier,
        });
        await clearPendingFinalization();
        setSyncFailed(false);

        void supabase
          .rpc('evaluate_referral_qualification', { p_referral_id: null })
          .then(({ error: refErr }) => {
            if (refErr && __DEV__) log.warn('[SessionSummary] evaluate_referral_qualification failed:', refErr.message);
          });
      } else if (error) {
        log.error('[SessionSummary] Recovery award_drops failed:', error.message);
        setSyncFailed(true);
      }
    } catch (err) {
      log.error('[SessionSummary] Recovery attempt threw:', err);
      setSyncFailed(true);
    } finally {
      setSyncingDrops(false);
    }
  };

  const handleManualRetry = async () => {
    await recoverPendingFinalization();
  };

  // Auto-retry when network is restored while the user is on this screen
  useEffect(() => {
    if (!syncFailed || syncingDrops || resolvedDrops !== null) return;

    let cancelled = false;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || cancelled || syncingDrops) return;
      // Quick connectivity check before retrying
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        const ctrl = new AbortController();
        timer = setTimeout(() => ctrl.abort(), 4000);
        await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          signal: ctrl.signal,
          cache: 'no-store',
        });
      } catch {
        return; // still offline
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!cancelled) {
        log.debug('[SessionSummary] Network restored, auto-retrying finalization');
        recoverPendingFinalization();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [syncFailed, syncingDrops, resolvedDrops]);

  const loadLeaderboardRank = async () => {
    if (!authSession?.user || !gymId) return;

    try {
      const { data, error } = await supabase.rpc('get_local_leaderboard', {
        p_gym_id: gymId,
        p_period: 'weekly',
        p_limit: 100,
      });

      if (error) {
        log.error('Error loading leaderboard rank:', error);
        return;
      }

      if (data) {
        const userEntry = data.find((entry: any) => entry.user_id === authSession.user.id);
        if (userEntry) {
          setUserRank(Number(userEntry.rank));
        }
      }
    } catch (err) {
      log.error('Error in loadLeaderboardRank:', err);
    }
  };

  const loadChallengeProgress = async (sessionStartedAt?: string) => {
    if (!authSession?.user || !gymId) return;

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_challenges', {
        p_gym_id: gymId,
      });

      if (rpcError || !rpcData || rpcData.length === 0) return;

      const items: ChallengeProgressItem[] = rpcData.map((c: any) => {
        const isStreakType = c.challenge_type === 'streak' || c.challenge_type === 'checkin_streak';
        const target = isStreakType
          ? (c.streak_days || c.target_drops || 0)
          : (c.target_drops || 0);
        const current = isStreakType
          ? (c.current_streak_days || 0)
          : (c.current_drops || 0);

        return {
          challenge_id: c.challenge_id,
          challenge_name: c.challenge_name,
          target_drops: target,
          current_drops: current,
          reward_drops: c.reward_drops,
          is_completed: c.is_completed || false,
          completed_at: c.completed_at,
          challenge_type: c.challenge_type,
        };
      });

      const sessionStart = sessionStartedAt ? new Date(sessionStartedAt).getTime() : 0;
      const justCompleted = items.filter((item) =>
        item.is_completed && item.reward_drops > 0 && item.completed_at &&
        new Date(item.completed_at).getTime() >= sessionStart
      );
      const inProgress = items.filter((item) => !item.is_completed && item.current_drops > 0);
      setCompletedChallenges(justCompleted);
      setChallengeProgress(inProgress);
    } catch (err) {
      log.error('Error in loadChallengeProgress:', err);
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
      log.error('Error in loadStreakDays:', err);
    }
  };

  const calculatePercentile = async () => {
    if (!authSession?.user || !drops || !session) return;

    try {
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
    } catch (err) {
      log.error('[SessionSummary] Error in calculatePercentile:', err);
    }
  };

  const formatTime = (seconds: string) => {
    const secs = parseInt(seconds);
    const mins = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${mins}m ${sec}s`;
  };

  const loadEarnedBadges = async (sessionStartedAt?: string) => {
    if (!authSession?.user) return;

    try {
      const sessionStartMs = sessionStartedAt ? new Date(sessionStartedAt).getTime() : NaN;
      const fallbackWindowMs = Date.now() - 5 * 60 * 1000;
      const delays = [0, 350, 900];
      let bestMatch: any[] = [];

      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }

        const { data, error } = await supabase.rpc('get_user_badges', {
          p_user_id: authSession.user.id,
        });

        if (error) {
          log.error('Error loading badges:', error);
          return;
        }

        const byId = new Map<string, any>();
        for (const badge of data || []) {
          const badgeName = String(badge.badge_name || '').trim().toLowerCase();
          const earnedAtMs = Number.isFinite(Date.parse(badge.earned_at)) ? Date.parse(badge.earned_at) : NaN;
          const earnedInThisSession = Number.isFinite(sessionStartMs)
            ? Number.isFinite(earnedAtMs) && earnedAtMs >= sessionStartMs
            : Number.isFinite(earnedAtMs) && earnedAtMs >= fallbackWindowMs;
          const explicitlyAwarded = badgeNamesFromFinalize.has(badgeName);
          if (earnedInThisSession || explicitlyAwarded) {
            byId.set(String(badge.badge_id), badge);
          }
        }

        const matched = Array.from(byId.values());
        if (matched.length > bestMatch.length) bestMatch = matched;

        // Stop early once we have at least one badge (or if there are no known
        // awarded names to wait for and current session already has a stable result).
        if (matched.length > 0 || badgeNamesFromFinalize.size === 0) break;
      }

      setEarnedBadges(bestMatch);
    } catch (err) {
      log.error('Error in loadEarnedBadges:', err);
    }
  };

  const getStreakEmoji = () => {
    if (streakDays >= 14) return '🔥🔥🔥';
    if (streakDays >= 7) return '🔥🔥';
    if (streakDays >= 3) return '🔥';
    return '💧';
  };

  const getMultiplierLabel = () => {
    if (effectiveMultiplier >= 2.0) return t('summary.streak14');
    if (effectiveMultiplier >= 1.5) return t('summary.streak7');
    if (effectiveMultiplier >= 1.2) return t('summary.streak3');
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
      {activeGym?.background_url ? (
        <View style={StyleSheet.absoluteFillObject}>
          <Image
            source={activeGym.background_url}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.60)', 'rgba(8,8,8,0.75)', 'rgba(0,0,0,0.85)']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      ) : (
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.celebrationHeader}>
          <View style={[styles.headerIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
            <Ionicons name="checkmark-circle" size={36} color={branding.primary} />
          </View>
          <Text style={styles.title}>
            {dropsNum === 0 ? t('summary.workoutLogged') : t('summary.workoutComplete')}
          </Text>
          <Text style={styles.subtitle}>
            {dropsNum === 0 ? t('summary.noDropsHint') : t('summary.greatJob')}
          </Text>
        </Animated.View>

        {syncingDrops && (
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <View style={styles.syncingCard}>
              <ActivityIndicator size="small" color="#60A5FA" />
              <Text style={styles.syncingCardText}>{t('summary.syncingDrops')}</Text>
            </View>
          </Animated.View>
        )}

        {syncFailed && !syncingDrops && resolvedDrops === null && (
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <View style={styles.syncFailedCard}>
              <View style={styles.syncFailedRow}>
                <Ionicons name="cloud-offline-outline" size={18} color="#F59E0B" />
                <Text style={styles.syncFailedCardText}>{t('summary.syncFailed')}</Text>
              </View>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleManualRetry}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={16} color="#000" />
                <Text style={styles.retryButtonText}>{t('summary.retrySync')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {securityStatus ? (
          <Animated.View entering={FadeInDown.delay(260).duration(450)}>
            <View style={styles.securityCard}>
              <Ionicons name="shield-outline" size={18} color="#F59E0B" />
              <Text style={styles.securityCardText}>{securityMessage || t('securityAwardFailed')}</Text>
            </View>
          </Animated.View>
        ) : isLimitCapped ? (
          <Animated.View entering={FadeInDown.delay(260).duration(450)}>
            <View style={styles.limitCard}>
              <Ionicons name="checkmark-circle" size={18} color="#93C5FD" />
              <Text style={styles.limitCardText}>
                {t('summary.limitReachedPositive', { earned: dropLimit.mintedToday })}
              </Text>
            </View>
          </Animated.View>
        ) : isSoftWarning ? (
          <Animated.View entering={FadeInDown.delay(260).duration(450)}>
            <View style={styles.softWarningCard}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#86EFAC" />
              <Text style={styles.softWarningCardText}>
                {t('summary.softSessionInfo', {
                  count: dropLimit.rewardedSessionsToday,
                  earned: dropLimit.mintedToday,
                })}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {wasReducedTier && !isLimitCapped && !securityStatus && (
          <Animated.View entering={FadeInDown.delay(320).duration(450)}>
            <View style={styles.reducedTierCard}>
              <Ionicons name="trending-down-outline" size={18} color="#FDE68A" />
              <Text style={styles.reducedTierCardText}>
                {t('summary.reducedTierApplied')}
              </Text>
            </View>
          </Animated.View>
        )}

        {wasDayCapHit && !isLimitCapped && (
          <Animated.View entering={FadeInDown.delay(380).duration(450)}>
            <View style={styles.limitCard}>
              <Ionicons name="calendar-outline" size={18} color="#93C5FD" />
              <Text style={styles.limitCardText}>
                {t('summary.dayCapReached', { earned: dropLimit.mintedToday })}
              </Text>
            </View>
          </Animated.View>
        )}

        {wasWeekCapHit && !wasDayCapHit && !isLimitCapped && (
          <Animated.View entering={FadeInDown.delay(380).duration(450)}>
            <View style={styles.limitCard}>
              <Ionicons name="calendar-outline" size={18} color="#93C5FD" />
              <Text style={styles.limitCardText}>
                {t('summary.weekCapReached', { earned: dropLimit.mintedWeek })}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── Drops Ring ── */}
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
                  style={[styles.ringDropsValue, getNumberStyle(36), { color: dropsNum === 0 ? 'rgba(255,255,255,0.35)' : '#FFFFFF' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {dropsNum === 0 ? '0' : `+${dropsNum}`}
                </Text>
                <Text style={[styles.ringDropsLabel, { color: hexToRgba(branding.primary, 0.65) }]}>
                  {t('summary.dropsEarned')}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Gym name under ring */}
        {gymName && (
          <Animated.View entering={FadeInDown.delay(500).duration(300)}>
            <View style={styles.gymNameRow}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.gymNameText}>{gymName}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Happy Hour Breakdown — hidden when session was tracking-only ── */}
        {happyHourBreakdown && !wasTrackingOnly && (
          <Animated.View entering={FadeInDown.delay(510).duration(350)}>
            <View style={[styles.glassCard, { borderColor: 'rgba(255,214,0,0.22)' }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.glassCardBlur}>
                <View style={[styles.glassCardIcon, { backgroundColor: 'rgba(255,214,0,0.12)' }]}>
                  <Ionicons name="flash" size={18} color="#FFD700" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.happyHourTitle}>{t('summary.happyHourBoost')}</Text>
                  <Text style={styles.happyHourDetail}>
                    {dropsNum >= happyHourBreakdown.postBoostDrops
                      ? t('summary.happyHourBreakdown', {
                          base: happyHourBreakdown.preBoostDrops,
                          multiplier: happyHourBreakdown.multiplier,
                          total: happyHourBreakdown.postBoostDrops,
                        })
                      : t('summary.happyHourApplied', {
                          multiplier: happyHourBreakdown.multiplier,
                          earned: dropsNum,
                        })
                    }
                  </Text>
                </View>
                <View style={[styles.multiplierPill, { backgroundColor: 'rgba(255,214,0,0.12)' }]}>
                  <Text style={styles.multiplierPillText}>x{happyHourBreakdown.multiplier}</Text>
                </View>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ── Tracking-only: no rewards or challenges ── */}
        {wasTrackingOnly && (
          <Animated.View entering={FadeInDown.delay(520).duration(400)}>
            <View style={styles.trackingOnlyCard}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={styles.trackingOnlyCardBlur}>
                <View style={[styles.glassCardIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                  <Ionicons name="analytics-outline" size={18} color="rgba(255,255,255,0.5)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackingOnlyCardTitle}>{t('summary.trackingOnlyTitle')}</Text>
                  <Text style={styles.trackingOnlyCardBody}>{t('summary.trackingOnlyBody')}</Text>
                </View>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ── Challenge Rewards (completed during this session, hidden if tracking-only) ── */}
        {completedChallenges.length > 0 && !wasTrackingOnly && (
          <Animated.View entering={FadeInDown.delay(520).duration(400)}>
            <View style={styles.challengeRewardSection}>
              {completedChallenges.map((challenge) => (
                <View key={challenge.challenge_id} style={[styles.glassCard, { borderColor: 'rgba(76,217,100,0.22)' }]}>
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.glassCardBlur}>
                    <View style={[styles.glassCardIcon, { backgroundColor: 'rgba(76,217,100,0.12)' }]}>
                      <Ionicons name="checkmark-circle" size={18} color="#4CD964" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.challengeRewardLabel}>{t('summary.challengeCompleted')}</Text>
                      <Text style={styles.challengeRewardName} numberOfLines={1}>{challenge.challenge_name}</Text>
                    </View>
                    <View style={[styles.rewardDropsPill, { backgroundColor: 'rgba(76,217,100,0.12)' }]}>
                      <Ionicons name="water" size={11} color="#4CD964" />
                      <Text style={[styles.rewardDropsPillText, { color: '#4CD964' }]}>+{challenge.reward_drops}</Text>
                    </View>
                  </PlatformBlur>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── Quick Stats Row (matches home screen pills) ── */}
        <Animated.View entering={FadeInDown.delay(550).duration(400)}>
          <View style={styles.statsRow}>
            {/* Duration */}
            <View style={styles.statPillWrapper}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.statPill}>
                <View style={[styles.statPillIconBg, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                  <Ionicons name="time-outline" size={16} color={branding.primary} />
                </View>
                <View style={styles.statPillTextCol}>
                  <Text style={[styles.statPillValue, getNumberStyle(16)]}>
                    {formatTime(duration || '0')}
                  </Text>
                  <Text style={styles.statPillLabel}>{t('summary.duration')}</Text>
                </View>
              </PlatformBlur>
            </View>

            {/* Streak */}
            <View style={styles.statPillWrapper}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.statPill}>
                <View style={[styles.statPillIconBg, { backgroundColor: streakDays > 0 ? hexToRgba('#FF6B35', 0.2) : hexToRgba(branding.primary, 0.1) }]}>
                  <Ionicons name="flame" size={16} color={streakDays > 0 ? '#FF6B35' : '#808080'} />
                </View>
                <View style={styles.statPillTextCol}>
                  <Text style={[styles.statPillValue, getNumberStyle(16), streakDays > 0 && { color: '#FF6B35' }]}>
                    {streakDays}
                  </Text>
                  <Text style={styles.statPillLabel}>Streak</Text>
                </View>
              </PlatformBlur>
            </View>

            {/* Rank or Percentile (whichever is available) */}
            {userRank !== null ? (
              <View style={styles.statPillWrapper}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.statPill}>
                  <View style={[styles.statPillIconBg, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Ionicons
                      name={userRank <= 3 ? 'medal' : 'podium-outline'}
                      size={16}
                      color={userRank === 1 ? '#FFD700' : userRank === 2 ? '#C0C0C0' : userRank === 3 ? '#CD7F32' : branding.primary}
                    />
                  </View>
                  <View style={styles.statPillTextCol}>
                    <Text style={[styles.statPillValue, getNumberStyle(16), { color: branding.primary }]}>
                      #{userRank}
                    </Text>
                    <Text style={styles.statPillLabel}>{t('summary.rank') || 'Rang'}</Text>
                  </View>
                </PlatformBlur>
              </View>
            ) : percentile !== null ? (
              <View style={styles.statPillWrapper}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.statPill}>
                  <View style={[styles.statPillIconBg, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="stats-chart-outline" size={16} color={branding.primary} />
                  </View>
                  <View style={styles.statPillTextCol}>
                    <Text style={[styles.statPillValue, getNumberStyle(16)]}>
                      Top {100 - percentile}%
                    </Text>
                    <Text style={styles.statPillLabel}>{t('summary.today') || 'Danas'}</Text>
                  </View>
                </PlatformBlur>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* ── Earned Badges ── */}
        {earnedBadges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(700).duration(400)}>
            <View style={[styles.badgesSection, { borderColor: hexToRgba('#FFD700', 0.22) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.badgesSectionBlur}>
                <Animated.View style={[styles.badgesHeader, trophyAnimStyle]}>
                  <View style={styles.badgesHeaderIconWrap}>
                    <Ionicons name="trophy" size={18} color="#FFD700" />
                  </View>
                  <Text style={styles.badgesSectionTitle}>
                    {t('summary.newBadge', { count: earnedBadges.length })}
                  </Text>
                </Animated.View>
                <View style={styles.badgesGrid}>
                  {earnedBadges.map((badge: any, index: number) => (
                    <Animated.View
                      key={badge.badge_id}
                      entering={ZoomIn.delay(800 + index * 100).duration(400).springify()}
                    >
                      <BadgeCard
                        badge={{
                          badge_id: badge.badge_id,
                          badge_name: badge.badge_name ?? badge.challenge_name,
                          badge_description: badge.badge_description ?? badge.description ?? null,
                          badge_image_url: badge.badge_image_url,
                          earned_at: badge.earned_at,
                          badge_type: badge.badge_type || 'global',
                          gym_name: badge.gym_name || null,
                          gym_id: badge.gym_id || null,
                        }}
                        isLocked={false}
                        progress={100}
                        onPress={() => {
                          setSelectedBadge({
                            badge_id: badge.badge_id,
                            badge_name: badge.badge_name ?? badge.challenge_name,
                            badge_description: badge.badge_description ?? badge.description ?? null,
                            badge_image_url: badge.badge_image_url,
                            earned_at: badge.earned_at,
                            badge_type: badge.badge_type || 'global',
                            gym_name: badge.gym_name || null,
                            gym_id: badge.gym_id || null,
                          });
                          setModalVisible(true);
                        }}
                        size="medium"
                      />
                    </Animated.View>
                  ))}
                </View>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* Challenge Progress Section (hidden when session was tracking-only) */}
        {challengeProgress.length > 0 && !wasTrackingOnly && (
          <Animated.View entering={FadeInDown.delay(850).duration(400)}>
            <View style={[styles.challengeSection, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.challengeSectionBlur}>
              <View style={styles.challengeHeader}>
                <Ionicons name="flag-outline" size={16} color={branding.primary} />
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
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

      </ScrollView>

      {/* ── Fixed bottom bar: Collect & Close ── */}
      <Animated.View entering={FadeInDown.delay(1000).duration(400)} style={styles.bottomBar}>
        <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={80} tint="dark" style={styles.bottomBarBlur}>
          <View style={[styles.bottomBarContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: branding.primary }]}
              onPress={async () => {
                try {
                  const { useGymStore } = await import('@/lib/stores/useGymStore');
                  const { useAuthStore } = await import('@/lib/stores/authStore');

                  const currentHomeGymId = useGymStore.getState().homeGymId;

                  // If user still has no home gym (first workout), use the session's gym
                  if (!currentHomeGymId && gymId) {
                    log.debug('[SessionSummary] No home gym in store — setting from session:', gymId);
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
                      log.warn('[SessionSummary] Failed to persist home gym to DB:', dbErr);
                    }
                  }

                  await useAuthStore.getState().refreshProfile();

                  const latestProfile = useAuthStore.getState().profile;
                  if (latestProfile?.home_gym_id) {
                    useGymStore.getState().setHomeGymId(latestProfile.home_gym_id);
                  }
                } catch (e) {
                  log.warn('[SessionSummary] Failed to sync state:', e);
                }

                if (router.canDismiss()) {
                  router.dismissAll();
                } else {
                  router.replace('/home');
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={20} color={branding.onPrimary} />
              <Text style={[styles.buttonText, { color: branding.onPrimary }]}>{t('summary.collectAndClose')}</Text>
            </TouchableOpacity>
          </View>
        </PlatformBlur>
      </Animated.View>

      {/* ── Badge Detail Modal (same as TrophyRoom) ── */}
      <BadgeDetailModal
        visible={modalVisible}
        badge={selectedBadge}
        isLocked={false}
        progress={100}
        onClose={() => {
          setModalVisible(false);
          setSelectedBadge(null);
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
    paddingBottom: 120,
    gap: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBarBlur: {
    overflow: 'hidden',
  },
  bottomBarContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  /* Header */
  celebrationHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    paddingTop: theme.spacing.md,
    gap: 6,
  },
  headerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  syncingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(96, 165, 250, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.30)',
    marginBottom: 8,
  },
  syncingCardText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#93C5FD',
  },
  syncFailedCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.30)',
    marginBottom: 8,
    gap: 10,
  },
  syncFailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncFailedCardText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#FDE68A',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
  },
  retryButtonText: {
    ...fontStyles.heading,
    fontSize: 14,
    color: '#000',
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    marginBottom: 8,
  },
  securityCardText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#FDE68A',
  },
  trackingOnlyCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  trackingOnlyCardBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  trackingOnlyCardTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 3,
  },
  trackingOnlyCardBody: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 17,
  },
  limitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 64, 120, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
    marginBottom: 8,
  },
  limitCardText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#93C5FD',
  },
  softWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 83, 45, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(134, 239, 172, 0.3)',
    marginBottom: 8,
  },
  softWarningCardText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#86EFAC',
  },
  reducedTierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(120, 80, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(253, 232, 138, 0.25)',
    marginBottom: 8,
  },
  reducedTierCardText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#FDE68A',
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
  /* Gym name */
  gymNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
  },
  gymNameText: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.3,
  },

  /* Shared glass card */
  glassCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  glassCardBlur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: 'rgba(18,18,28,0.80)',
  },
  glassCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  /* Happy Hour */
  happyHourTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#FFD700',
    letterSpacing: 0.3,
  },
  happyHourDetail: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  multiplierPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  multiplierPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#FFD700',
    letterSpacing: 0.3,
  },

  /* Challenge reward (completed) */
  challengeRewardSection: {
    gap: 6,
  },
  challengeRewardLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: '#4CD964',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  challengeRewardName: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
    marginTop: 2,
  },
  rewardDropsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rewardDropsPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
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
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
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
  /* Badges section */
  badgesSection: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  badgesSectionBlur: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(18,18,28,0.80)',
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  badgesHeaderIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,215,0,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgesSectionTitle: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#FFD700',
    flex: 1,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  /* Challenge Progress */
  challengeSection: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  challengeSectionBlur: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(18,18,28,0.80)',
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  challengeSectionTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    marginBottom: theme.spacing.sm,
  },
  buttonText: {
    ...fontStyles.heading,
    fontSize: 17,
    letterSpacing: 0.3,
  },
});
