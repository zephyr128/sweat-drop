import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';

// ── Helper functions (module-level, no hooks) ────────────────────────────────

function getTimeUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function getTimeUntilSunday(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() + daysUntilSunday);
  sunday.setHours(0, 0, 0, 0);
  const diff = sunday.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

type TimeStyle = 'countdown' | 'recurring' | 'permanent' | 'completed';

function getChallengeTimeDisplay(
  challengeType: string,
  endDate: string | null,
  isCompleted: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { text: string; style: TimeStyle } | null {
  if (isCompleted) {
    if (challengeType === 'daily') return { text: t('completedResetsIn', { time: getTimeUntilMidnight() }), style: 'completed' };
    if (challengeType === 'weekly') return { text: t('completedResetsSunday', { time: getTimeUntilSunday() }), style: 'completed' };
    return { text: t('completedLabel'), style: 'completed' };
  }
  if (challengeType === 'milestone' || !endDate) return { text: t('ongoing'), style: 'permanent' };

  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return { text: t('ended'), style: 'countdown' };
  if (challengeType === 'daily') return { text: t('resetsIn', { time: getTimeUntilMidnight() }), style: 'recurring' };
  if (challengeType === 'weekly') return { text: t('resetsIn', { time: getTimeUntilSunday() }), style: 'recurring' };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return { text: t('timeLeft', { days, hours, minutes }), style: 'countdown' };
  if (hours > 0) return { text: t('hoursLeft', { hours, minutes }), style: 'countdown' };
  return { text: t('minutesLeft', { minutes }), style: 'countdown' };
}

function getChallengeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'daily': return 'sunny-outline';
    case 'weekly': return 'calendar-outline';
    case 'monthly': return 'trophy-outline';
    case 'streak': return 'flame-outline';
    case 'milestone': return 'flag-outline';
    case 'checkin_streak': return 'flame-outline';
    case 'checkin_count': return 'location-outline';
    default: return 'star-outline';
  }
}

function getChallengeTypeLabel(
  type: string,
  t: (key: string) => string,
): string {
  switch (type) {
    case 'daily': return t('dailyChallenge');
    case 'weekly': return t('weeklyChallenge');
    case 'monthly': return t('monthlyChallenge');
    case 'streak': return t('streakChallenge');
    case 'milestone': return t('milestoneChallenge');
    case 'checkin_streak': return t('checkinStreakChallenge');
    case 'checkin_count': return t('checkinCountChallenge');
    default: return t('challenge');
  }
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('challenges');

  const [challenges, setChallenges] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  // Prevents flashing the full-screen spinner on every back-navigation focus
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!session?.user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;
    if (!gymId) { setChallenges([]); return; }

    const today = new Date().toISOString().split('T')[0];
    const { data: challengesData, error } = await supabase
      .from('gym_challenges')
      .select(`
        id, name, description, challenge_type, target_drops,
        milestone_threshold, reward_drops, streak_days,
        start_date, end_date, gym_id, badge_image_url
      `)
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .lte('start_date', today)
      .or(`end_date.gte.${today},end_date.is.null`);

    if (error) { log.error('Error loading challenges:', error); setChallenges([]); return; }
    if (!challengesData || challengesData.length === 0) { setChallenges([]); return; }

    const challengeIds = challengesData.map((c) => c.id);
    const { data: progressData } = await supabase
      .from('challenge_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('gym_id', gymId)
      .in('challenge_id', challengeIds);

    const merged = challengesData.map((c) => ({
      ...c,
      progress: progressData?.find((p) => p.challenge_id === c.id) ?? null,
    }));
    setChallenges(merged);

    // Build progress map
    const map: Record<string, any> = {};
    merged.forEach((c) => {
      if (c.progress) {
        const isStreak = c.challenge_type === 'streak' || c.challenge_type === 'checkin_streak';
        map[c.id] = {
          current_drops: isStreak ? (c.progress.current_streak_days || 0) : (c.progress.current_drops || 0),
          current_streak_days: c.progress.current_streak_days || 0,
          is_completed: c.progress.is_completed || false,
          completed_at: c.progress.completed_at || null,
          updated_at: c.progress.updated_at || null,
        };
      }
    });
    setProgress(map);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        // First visit — show full-screen spinner
        setLoading(true);
        load().finally(() => {
          hasLoadedRef.current = true;
          setLoading(false);
        });
      } else {
        // Returning from detail screen — refresh silently, no spinner
        load();
      }
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Split active vs completed ────────────────────────────────────────────

  const activeChallenges = useMemo(() =>
    challenges.filter((c) => {
      const isCompleted = progress[c.id]?.is_completed || false;
      if (!isCompleted) return true;
      return c.challenge_type === 'daily' || c.challenge_type === 'weekly';
    }),
  [challenges, progress]);

  const completedChallenges = useMemo(() =>
    challenges.filter((c) => {
      const isCompleted = progress[c.id]?.is_completed || false;
      return isCompleted && c.challenge_type !== 'daily' && c.challenge_type !== 'weekly';
    }),
  [challenges, progress]);

  const formatCompletedDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return fmtDate(dateStr, { month: 'short', day: 'numeric' });
  };

  // ── Card helpers ─────────────────────────────────────────────────────────

  const getProgressValues = (challenge: any, userProgress: any) => {
    const isStreak = challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak';
    const target = challenge.challenge_type === 'milestone'
      ? (challenge.milestone_threshold || 0)
      : isStreak
        ? (challenge.streak_days || challenge.target_drops || 0)
        : (challenge.target_drops || 0);
    const current = isStreak
      ? (userProgress?.current_streak_days || 0)
      : (userProgress?.current_drops || 0);
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    const unit = isStreak
      ? t('unit_days')
      : challenge.challenge_type === 'checkin_count'
        ? t('unit_checkins')
        : t('unit_drops');
    return { target, current, pct, unit };
  };

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <ScreenHeader title={t('title')} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={branding.primary}
      colors={[branding.primary]}
    />
  );

  const activePage = (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {activeChallenges.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="flash-outline" size={56} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('noActive')}</Text>
          <Text style={styles.emptySubtext}>{t('checkBackSoon')}</Text>
        </View>
      ) : (
        activeChallenges.map((challenge, index) => {
          const userProgress = progress[challenge.id];
          const isCompleted = userProgress?.is_completed || false;
          const { target, current, pct, unit } = getProgressValues(challenge, userProgress);
          const typeLabel = getChallengeTypeLabel(challenge.challenge_type, t);
          const timeInfo = getChallengeTimeDisplay(challenge.challenge_type, challenge.end_date, isCompleted, t);

          return (
            <Animated.View key={challenge.id} entering={FadeInDown.delay(80 + index * 70).duration(380)}>
              <TouchableOpacity
                style={[
                  styles.activeCard,
                  {
                    borderTopColor: hexToRgba(branding.primary, isCompleted ? 0.45 : 0.28),
                    borderLeftColor: hexToRgba(branding.primary, isCompleted ? 0.2 : 0.1),
                    borderRightColor: 'rgba(255,255,255,0.05)',
                    borderBottomColor: 'rgba(255,255,255,0.03)',
                  },
                ]}
                onPress={() => router.push({ pathname: '/challenge-detail', params: { challengeId: challenge.id, gymId: challenge.gym_id } })}
                activeOpacity={0.8}
              >
                <PlatformBlur intensity={50} tint="dark" style={styles.activeBlur} androidColor="rgba(16,16,28,0.97)">
                  <LinearGradient
                    colors={isCompleted
                      ? ['rgba(74,222,128,0.06)', 'transparent']
                      : [hexToRgba(branding.primary, 0.07), 'rgba(255,255,255,0.02)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />

                  {/* ── Header row: icon + meta + badge image ── */}
                  <View style={styles.activeCardHeader}>
                    <View style={styles.activeCardMeta}>
                      <View style={[styles.typeIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                        <Ionicons name={getChallengeIcon(challenge.challenge_type)} size={18} color={branding.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.typeLabel, { color: branding.primary }]}>{typeLabel}</Text>
                        <Text style={styles.challengeName} numberOfLines={2}>{challenge.name}</Text>
                      </View>
                    </View>

                    {/* Badge image */}
                    {challenge.badge_image_url ? (
                      <Image
                        source={challenge.badge_image_url}
                        style={styles.badgeImage}
                        contentFit="contain"
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.badgePlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.08), borderColor: hexToRgba(branding.primary, 0.2) }]}>
                        <Ionicons name="shield-outline" size={22} color={hexToRgba(branding.primary, 0.5)} />
                      </View>
                    )}
                  </View>

                  {/* Description */}
                  {challenge.description ? (
                    <Text style={styles.description} numberOfLines={2}>{challenge.description}</Text>
                  ) : null}

                  {/* Progress bar */}
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={isCompleted
                        ? ['#4ade80', '#22c55e']
                        : [branding.primary, hexToRgba(branding.primary, 0.7)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${pct}%` }]}
                    />
                  </View>

                  {/* Progress meta row */}
                  <View style={styles.progressMetaRow}>
                    <Text style={styles.progressMeta}>
                      <Text style={[getNumberStyle(13), { color: isCompleted ? '#4ade80' : branding.primary }]}>{current}</Text>
                      <Text style={styles.progressSlash}> / </Text>
                      <Text style={[getNumberStyle(13), { color: theme.colors.textSecondary }]}>{target}</Text>
                      <Text style={styles.progressUnit}> {unit}</Text>
                    </Text>
                    <Text style={[getNumberStyle(12), { color: isCompleted ? '#4ade80' : theme.colors.textSecondary }]}>
                      {Math.round(pct)}%
                    </Text>
                  </View>

                  {/* Footer row: time badge + reward */}
                  <View style={styles.activeCardFooter}>
                    {timeInfo && (
                      <View style={[
                        styles.timePill,
                        timeInfo.style === 'completed' && { backgroundColor: 'rgba(74,222,128,0.1)' },
                        timeInfo.style === 'recurring' && { backgroundColor: 'rgba(96,165,250,0.1)' },
                      ]}>
                        <Ionicons
                          name={
                            timeInfo.style === 'completed' ? 'checkmark-circle' :
                            timeInfo.style === 'permanent' ? 'infinite' :
                            timeInfo.style === 'recurring' ? 'refresh' :
                            'time-outline'
                          }
                          size={11}
                          color={timeInfo.style === 'completed' ? '#4ade80' : theme.colors.textSecondary}
                        />
                        <Text style={[styles.timePillText, timeInfo.style === 'completed' && { color: '#4ade80' }]}>
                          {timeInfo.text}
                        </Text>
                      </View>
                    )}
                    {challenge.reward_drops > 0 && (
                      <View style={styles.rewardPill}>
                        <Ionicons name="water" size={11} color={branding.primary} />
                        <Text style={[styles.rewardPillText, { color: branding.primary }]}>
                          +{challenge.reward_drops}
                        </Text>
                      </View>
                    )}
                  </View>
                </PlatformBlur>
              </TouchableOpacity>
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );

  const completedPage = (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {completedChallenges.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={56} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('noCompleted')}</Text>
        </View>
      ) : (
        completedChallenges.map((challenge, index) => {
          const userProgress = progress[challenge.id];
          return (
            <Animated.View key={challenge.id} entering={FadeInDown.delay(80 + index * 60).duration(350)}>
              <TouchableOpacity
                style={[styles.completedCard, {
                  borderTopColor: hexToRgba(branding.primary, 0.18),
                  borderLeftColor: hexToRgba(branding.primary, 0.08),
                  borderRightColor: 'rgba(255,255,255,0.04)',
                  borderBottomColor: 'rgba(255,255,255,0.02)',
                }]}
                onPress={() => router.push({ pathname: '/challenge-detail', params: { challengeId: challenge.id, gymId: challenge.gym_id } })}
                activeOpacity={0.8}
              >
                <PlatformBlur intensity={40} tint="dark" style={styles.completedBlur} androidColor="rgba(16,16,28,0.97)">
                  <LinearGradient
                    colors={['rgba(74,222,128,0.05)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />

                  {/* Badge + info */}
                  <View style={styles.completedRow}>
                    {challenge.badge_image_url ? (
                      <Image source={challenge.badge_image_url} style={styles.completedBadgeImg} contentFit="cover" transition={200} />
                    ) : (
                      <View style={[styles.completedBadgeFallback, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                        <Ionicons name="shield-checkmark" size={20} color={branding.primary} />
                      </View>
                    )}

                    <View style={styles.completedInfo}>
                      <Text style={[styles.completedType, { color: branding.primary }]}>
                        {getChallengeTypeLabel(challenge.challenge_type, t)}
                      </Text>
                      <Text style={styles.completedName} numberOfLines={1}>{challenge.name}</Text>
                      <Text style={styles.completedDate}>
                        {t('completedOn', { date: formatCompletedDate(userProgress?.completed_at || userProgress?.updated_at || challenge.updated_at) })}
                      </Text>
                    </View>

                    <View style={styles.completedReward}>
                      <View style={[styles.completedCheckCircle, { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.3)' }]}>
                        <Ionicons name="checkmark" size={14} color="#4ade80" />
                      </View>
                      <Text style={[styles.completedDrops, { color: branding.primary }]}>
                        +{challenge.reward_drops || 0}
                      </Text>
                      <Text style={styles.completedDropsLabel}>drops</Text>
                    </View>
                  </View>
                </PlatformBlur>
              </TouchableOpacity>
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      <SliderTabs
        tabs={[
          { key: 'active', label: t('tabActive'), icon: 'flash-outline' },
          { key: 'completed', label: t('tabCompleted'), icon: 'trophy-outline' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'active' | 'completed')}
        accentColor={branding.primary}
        style={{ flex: 1 }}
        barStyle={styles.tabBar}
      >
        {activePage}
        {completedPage}
      </SliderTabs>
    </View>
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
  tabBar: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: 6,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  /* Empty states */
  emptyState: {
    paddingTop: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptySubtext: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
    paddingHorizontal: theme.spacing.xl,
  },
  /* Active challenge card */
  activeCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  activeBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  activeCardMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  typeLabel: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  challengeName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  /* Badge image */
  badgeImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    flexShrink: 0,
  },
  badgePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  description: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 17,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.2,
  },
  /* Progress */
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 7,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  progressMeta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  progressSlash: {
    color: theme.colors.textTertiary,
  },
  progressUnit: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  /* Footer */
  activeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  timePillText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,229,255,0.06)',
    marginLeft: 'auto',
  },
  rewardPillText: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 1,
  },
  /* Completed card */
  completedCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  completedBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: theme.spacing.md,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  completedBadgeImg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    flexShrink: 0,
  },
  completedBadgeFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  completedInfo: {
    flex: 1,
    gap: 2,
  },
  completedType: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  completedName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  completedDate: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  completedReward: {
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  completedCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  completedDrops: {
    ...fontStyles.heading,
    fontSize: 18,
  },
  completedDropsLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
});
