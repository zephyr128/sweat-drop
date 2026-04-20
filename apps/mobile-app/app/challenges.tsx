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
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
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
import { formatDate as fmtDate } from '@/lib/utils/formatDate';

const ORANGE = '#FF9F4A';
const GREEN = '#4ade80';
const GREEN_DARK = '#22c55e';

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

// ── SectionHeader (inline — only used in this file) ─────────────────────────

interface SectionHeaderProps {
  label: string;
  count: number;
  tone?: 'default' | 'success';
  icon?: keyof typeof Ionicons.glyphMap;
}

function SectionHeader({ label, count, tone = 'default', icon }: SectionHeaderProps) {
  const labelColor = tone === 'success' ? GREEN : theme.colors.textSecondary;
  return (
    <View style={sectionHeaderStyles.wrapper}>
      <View style={sectionHeaderStyles.left}>
        {icon && (
          <Ionicons name={icon} size={14} color={labelColor} style={{ marginRight: 5 }} />
        )}
        <Text style={[sectionHeaderStyles.label, { color: labelColor }]}>
          {label.toUpperCase()}
        </Text>
        <View style={sectionHeaderStyles.countPill}>
          <Text style={sectionHeaderStyles.countText}>{count}</Text>
        </View>
      </View>
      <View style={sectionHeaderStyles.divider} />
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  wrapper: {
    marginTop: 20,
    marginBottom: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  countPill: {
    marginLeft: 7,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});

// ── AllDoneBanner (shown when pending=0, done>0) ─────────────────────────────

interface AllDoneBannerProps {
  title: string;
  subtitle: string;
  primary: string;
}

function AllDoneBanner({ title, subtitle, primary }: AllDoneBannerProps) {
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={[bannerStyles.card, { borderColor: hexToRgba(GREEN_DARK, 0.30) }]}>
      <PlatformBlur intensity={50} tint="dark" style={bannerStyles.blur} androidColor="rgba(10,20,14,0.92)">
        <LinearGradient
          colors={['rgba(74,222,128,0.08)', 'rgba(34,197,94,0.03)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={bannerStyles.inner}>
          <View style={[bannerStyles.iconWrap, { backgroundColor: hexToRgba(primary, 0.12) }]}>
            <Ionicons name="flame" size={22} color={primary} />
          </View>
          <View style={bannerStyles.textWrap}>
            <Text style={bannerStyles.title}>{title}</Text>
            <Text style={bannerStyles.subtitle}>{subtitle}</Text>
          </View>
        </View>
      </PlatformBlur>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
  },
  blur: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,20,14,0.82)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textWrap: { flex: 1 },
  title: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: GREEN,
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const router = useThrottledRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('challenges');

  const [challenges, setChallenges] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (params.tab === 'completed' || params.tab === 'active') {
        setActiveTab(params.tab);
      }
    }, [params.tab]),
  );

  const load = useCallback(async () => {
    if (!session?.user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;
    if (!gymId) { setChallenges([]); return; }

    const { data: rpcData, error } = await supabase.rpc('get_my_challenges', {
      p_gym_id: gymId,
    });

    if (error) { log.error('Error loading challenges:', error); setChallenges([]); return; }
    if (!rpcData || rpcData.length === 0) { setChallenges([]); return; }

    const merged = rpcData.map((c: any) => ({
      id: c.challenge_id,
      name: c.challenge_name,
      challenge_type: c.challenge_type,
      target_drops: c.target_drops,
      milestone_threshold: c.milestone_threshold,
      reward_drops: c.reward_drops,
      streak_days: c.streak_days,
      start_date: c.start_date,
      end_date: c.end_date,
      gym_id: gymId,
      badge_image_url: c.badge_image_url,
      progress: {
        current_drops: c.current_drops ?? 0,
        current_streak_days: c.current_streak_days ?? 0,
        is_completed: c.is_completed ?? false,
        completed_at: c.completed_at ?? null,
        tier_achieved: c.tier_achieved ?? null,
        drops_awarded: c.drops_awarded ?? 0,
      },
    }));
    setChallenges(merged);

    const map: Record<string, any> = {};
    merged.forEach((c: any) => {
      const isStreak = c.challenge_type === 'streak' || c.challenge_type === 'checkin_streak';
      map[c.id] = {
        current_drops: isStreak ? (c.progress.current_streak_days || 0) : (c.progress.current_drops || 0),
        current_streak_days: c.progress.current_streak_days || 0,
        is_completed: c.progress.is_completed || false,
        completed_at: c.progress.completed_at || null,
        updated_at: null,
      };
    });
    setProgress(map);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        setLoading(true);
        load().finally(() => {
          hasLoadedRef.current = true;
          setLoading(false);
        });
      } else {
        load();
      }
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Split into three groups ──────────────────────────────────────────────
  // pendingChallenges    — not completed, shown first in Today tab
  // doneRecurringChallenges — completed daily/weekly, stay in Today tab (will reset)
  // completedChallenges — completed milestone/permanent, go to Milestones tab

  const { pendingChallenges, doneRecurringChallenges } = useMemo(() => {
    const pending: any[] = [];
    const done: any[] = [];
    for (const c of challenges) {
      const isCompleted = progress[c.id]?.is_completed || false;
      if (!isCompleted) {
        pending.push(c);
      } else if (c.challenge_type === 'daily' || c.challenge_type === 'weekly') {
        done.push(c);
      }
    }
    // Most recently completed first
    done.sort((a, b) => {
      const aAt = progress[a.id]?.completed_at ?? '';
      const bAt = progress[b.id]?.completed_at ?? '';
      return bAt.localeCompare(aAt);
    });
    return { pendingChallenges: pending, doneRecurringChallenges: done };
  }, [challenges, progress]);

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

  // ── Render an active-style challenge card ────────────────────────────────
  // isDone=true applies dimming + done-state visuals (Step 3)

  const renderActiveCard = (challenge: any, index: number, animOffset: number, isDone: boolean) => {
    const userProgress = progress[challenge.id];
    const isCompleted = userProgress?.is_completed || false;
    const { target, current, pct, unit } = getProgressValues(challenge, userProgress);
    const typeLabel = getChallengeTypeLabel(challenge.challenge_type, t);
    const timeInfo = getChallengeTimeDisplay(challenge.challenge_type, challenge.end_date, isCompleted, t);

    return (
      <Animated.View
        key={challenge.id}
        entering={FadeInDown.delay(animOffset + index * 70).duration(380)}
      >
        <TouchableOpacity
          style={[
            styles.activeCard,
            isDone && styles.activeCardDone,
            {
              borderTopColor: hexToRgba(isDone ? GREEN_DARK : ORANGE, isDone ? 0.35 : 0.28),
              borderLeftColor: hexToRgba(isDone ? GREEN_DARK : ORANGE, isDone ? 0.15 : 0.1),
              borderRightColor: 'rgba(255,255,255,0.05)',
              borderBottomColor: 'rgba(255,255,255,0.03)',
            },
          ]}
          onPress={() => router.push({ pathname: '/challenge-detail', params: { challengeId: challenge.id, gymId: challenge.gym_id } })}
          activeOpacity={isDone ? 0.65 : 0.8}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.activeBlur} androidColor="rgba(16,16,28,0.97)">
            <LinearGradient
              colors={isDone
                ? ['rgba(74,222,128,0.09)', 'rgba(34,197,94,0.03)', 'transparent']
                : [hexToRgba(ORANGE, 0.07), 'rgba(255,255,255,0.02)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* ── DONE ribbon (top-right corner, Step 3a) ── */}
            {isDone && (
              <View style={styles.doneRibbonWrap} pointerEvents="none">
                <View style={styles.doneRibbon}>
                  <Text style={styles.doneRibbonText}>{t('doneRibbon')}</Text>
                </View>
              </View>
            )}

            {/* ── Header row: icon + meta + badge image ── */}
            <View style={styles.activeCardHeader}>
              <View style={styles.activeCardMeta}>
                <View style={[
                  styles.typeIconWrap,
                  { backgroundColor: hexToRgba(isDone ? GREEN_DARK : ORANGE, 0.10) },
                ]}>
                  <Ionicons
                    name={isDone ? 'checkmark-circle' : getChallengeIcon(challenge.challenge_type)}
                    size={18}
                    color={isDone ? GREEN : ORANGE}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, { color: isDone ? GREEN : ORANGE }]}>{typeLabel}</Text>
                  <Text style={styles.challengeName} numberOfLines={2}>{challenge.name}</Text>
                </View>
              </View>

              {/* Badge image */}
              {challenge.badge_image_url ? (
                <Image
                  source={challenge.badge_image_url}
                  style={[styles.badgeImage, isDone && styles.badgeImageDone]}
                  contentFit="contain"
                  transition={200}
                />
              ) : (
                <View style={[
                  styles.badgePlaceholder,
                  { backgroundColor: hexToRgba(isDone ? GREEN_DARK : ORANGE, 0.08), borderColor: hexToRgba(isDone ? GREEN_DARK : ORANGE, 0.2) },
                ]}>
                  <Ionicons
                    name={isDone ? 'shield-checkmark' : 'shield-outline'}
                    size={22}
                    color={hexToRgba(isDone ? GREEN : ORANGE, 0.6)}
                  />
                </View>
              )}
            </View>

            {/* Description */}
            {challenge.description ? (
              <Text style={styles.description} numberOfLines={2}>{challenge.description}</Text>
            ) : null}

            {/* ── Progress area: success strip when done, progress bar when pending (Step 3b) ── */}
            {isDone ? (
              <View style={styles.doneStrip}>
                <View style={styles.doneStripLeft}>
                  <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                  <Text style={styles.doneStripValues}>
                    <Text style={[getNumberStyle(12), { color: GREEN }]}>{current}</Text>
                    <Text style={{ color: 'rgba(74,222,128,0.55)' }}> / </Text>
                    <Text style={[getNumberStyle(12), { color: 'rgba(74,222,128,0.7)' }]}>{target}</Text>
                    <Text style={{ color: 'rgba(74,222,128,0.5)', fontSize: 11 }}> {unit}</Text>
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.progressTrack}>
                  <LinearGradient
                    colors={[ORANGE, hexToRgba(ORANGE, 0.7)]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${pct}%` }]}
                  />
                </View>
                <View style={styles.progressMetaRow}>
                  <Text style={styles.progressMeta}>
                    <Text style={[getNumberStyle(13), { color: ORANGE }]}>{current}</Text>
                    <Text style={styles.progressSlash}> / </Text>
                    <Text style={[getNumberStyle(13), { color: theme.colors.textSecondary }]}>{target}</Text>
                    <Text style={styles.progressUnit}> {unit}</Text>
                  </Text>
                  <Text style={[getNumberStyle(12), { color: theme.colors.textSecondary }]}>
                    {Math.round(pct)}%
                  </Text>
                </View>
              </>
            )}

            {/* ── Footer: time pill + reward ── */}
            <View style={styles.activeCardFooter}>
              {timeInfo && (
                <View style={[
                  styles.timePill,
                  // Step 3c: stronger green border+bg when done
                  isDone
                    ? { backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.32)' }
                    : timeInfo.style === 'recurring'
                      ? { backgroundColor: 'rgba(96,165,250,0.1)' }
                      : {},
                ]}>
                  <Ionicons
                    name={isDone ? 'refresh' : timeInfo.style === 'permanent' ? 'infinite' : 'time-outline'}
                    size={11}
                    color={isDone ? GREEN : theme.colors.textSecondary}
                  />
                  <Text style={[styles.timePillText, isDone && { color: GREEN }]}>
                    {timeInfo.text}
                  </Text>
                </View>
              )}

              {/* Step 3d: "Come back tomorrow / Resets Sunday" hint when done */}
              {isDone && challenge.challenge_type === 'daily' && (
                <Text style={styles.comeBackHint} numberOfLines={1}>
                  {t('comeBackTomorrow', { drops: challenge.reward_drops ?? 0 })}
                </Text>
              )}
              {isDone && challenge.challenge_type === 'weekly' && (
                <Text style={styles.comeBackHint} numberOfLines={1}>
                  {t('resetsSundayExplicit')}
                </Text>
              )}

              {!isDone && challenge.reward_drops > 0 && (
                <View style={styles.rewardPill}>
                  <Ionicons name="water" size={11} color={ORANGE} />
                  <Text style={[styles.rewardPillText, { color: ORANGE }]}>
                    +{challenge.reward_drops}
                  </Text>
                </View>
              )}
            </View>
          </PlatformBlur>
        </TouchableOpacity>
      </Animated.View>
    );
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

  const hasTodayContent = pendingChallenges.length > 0 || doneRecurringChallenges.length > 0;

  const activePage = (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {!hasTodayContent ? (
        <View style={styles.emptyState}>
          <Ionicons name="flash-outline" size={56} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('noActive')}</Text>
          <Text style={styles.emptySubtext}>{t('checkBackSoon')}</Text>
        </View>
      ) : (
        <>
          {/* ── All-done celebration banner (no pending, some done) ── */}
          {pendingChallenges.length === 0 && doneRecurringChallenges.length > 0 && (
            <AllDoneBanner
              title={t('allDoneTitle')}
              subtitle={t('allDoneSubtitle')}
              primary={branding.primary}
            />
          )}

          {/* ── TO DO section ── */}
          {pendingChallenges.length > 0 && (
            <>
              <SectionHeader
                label={t('sectionToDo')}
                count={pendingChallenges.length}
                tone="default"
              />
              {pendingChallenges.map((challenge, index) =>
                renderActiveCard(challenge, index, 60, false),
              )}
            </>
          )}

          {/* ── DONE FOR TODAY section ── */}
          {doneRecurringChallenges.length > 0 && (
            <>
              <SectionHeader
                label={t('sectionDoneForToday')}
                count={doneRecurringChallenges.length}
                tone="success"
                icon="checkmark-circle"
              />
              {doneRecurringChallenges.map((challenge, index) =>
                renderActiveCard(challenge, index, pendingChallenges.length * 70 + 80, true),
              )}
            </>
          )}
        </>
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
                  borderTopColor: hexToRgba(ORANGE, 0.18),
                  borderLeftColor: hexToRgba(ORANGE, 0.08),
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

                  <View style={styles.completedRow}>
                    {challenge.badge_image_url ? (
                      <Image source={challenge.badge_image_url} style={styles.completedBadgeImg} contentFit="cover" transition={200} />
                    ) : (
                      <View style={[styles.completedBadgeFallback, { backgroundColor: hexToRgba(ORANGE, 0.1) }]}>
                        <Ionicons name="shield-checkmark" size={20} color={ORANGE} />
                      </View>
                    )}

                    <View style={styles.completedInfo}>
                      <Text style={[styles.completedType, { color: ORANGE }]}>
                        {getChallengeTypeLabel(challenge.challenge_type, t)}
                      </Text>
                      <Text style={styles.completedName} numberOfLines={1}>{challenge.name}</Text>
                      <Text style={styles.completedDate}>
                        {t('completedOn', { date: formatCompletedDate(userProgress?.completed_at || userProgress?.updated_at || challenge.updated_at) })}
                      </Text>
                    </View>

                    <View style={styles.completedReward}>
                      <View style={[styles.completedCheckCircle, { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.3)' }]}>
                        <Ionicons name="checkmark" size={14} color={GREEN} />
                      </View>
                      <Text style={[styles.completedDrops, { color: ORANGE }]}>
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
        accentColor={ORANGE}
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
  activeCardDone: {
    opacity: 0.80,
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
  badgeImageDone: {
    opacity: 0.65,
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

  /* DONE ribbon (Step 3a) */
  doneRibbonWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 72,
    height: 72,
    overflow: 'hidden',
    zIndex: 10,
  },
  doneRibbon: {
    position: 'absolute',
    top: 14,
    right: -20,
    width: 88,
    backgroundColor: GREEN_DARK,
    paddingVertical: 4,
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
    shadowColor: 'rgba(74,222,128,0.4)',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  doneRibbonText: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 2,
    color: '#000',
  },

  /* Progress bar (pending cards) */
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

  /* Done success strip (Step 3b) */
  doneStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.32)',
    backgroundColor: 'rgba(74,222,128,0.10)',
    paddingHorizontal: 10,
    marginBottom: theme.spacing.md,
  },
  doneStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  doneStripValues: {
    fontSize: 12,
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
  comeBackHint: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 'auto',
  },
  rewardPillText: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 1,
  },

  /* Milestones tab card */
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
