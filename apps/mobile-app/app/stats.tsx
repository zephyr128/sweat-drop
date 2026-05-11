import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate as fmtDate, formatTime as fmtTime } from '@/lib/utils/formatDate';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useBranding } from '@/lib/hooks/useBranding';
import { fontStyles, getNumberStyle, theme as appTheme, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useMyStats, StatsPeriod } from '@/hooks/useMyStats';
import type { TodaySession, MyStatsState } from '@/hooks/useMyStats';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

// ── Animation config ────────────────────────────────────────────────────────
const NUM_DURATION = 520;
const BAR_DURATION = 480;

// ── useCountUp ──────────────────────────────────────────────────────────────
function useCountUp(target: number, format: (n: number) => string): string {
  const displayed = useSharedValue(target);
  const [text, setText] = useState(format(target));
  const prevTarget = useRef(target);

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;
    if (from === target) return;

    const steps = 24;
    const duration = NUM_DURATION;
    const stepMs = duration / steps;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const progress = Easing.out(Easing.cubic)(step / steps);
      const current = Math.round(from + (target - from) * progress);
      setText(format(current));
      if (step >= steps) {
        clearInterval(id);
        setText(format(target));
      }
    }, stepMs);
    return () => clearInterval(id);
  }, [target]);

  return text;
}

// ── AnimatedBar (horizontal) ────────────────────────────────────────────────
const AnimatedBar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.max(pct, pct > 0 ? 3 : 0), {
      duration: BAR_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as any,
  }));

  return (
    <Animated.View
      style={[{ height: '100%', borderRadius: 2, backgroundColor: color }, barStyle]}
    />
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatNumber(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1_000) return n.toLocaleString('en-US');
  return String(n);
}

function formatDate(iso: string | null): string {
  return fmtDate(iso, { day: 'numeric', month: 'short' });
}

function machineLabel(type: string): string {
  const map: Record<string, string> = {
    treadmill: 'Treadmill',
    bike: 'Bike',
    elliptical: 'Elliptical',
    rower: 'Rower',
  };
  return map[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

function machineIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  const map: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    treadmill: 'walk-outline',
    bike: 'bicycle-outline',
    elliptical: 'fitness-outline',
    rower: 'boat-outline',
  };
  return map[type] ?? 'barbell-outline';
}

const PERIODS: StatsPeriod[] = ['today', 'week', 'month', 'all'];
const GLASS_BG = 'rgba(18, 18, 28, 0.80)';

// ── Skeleton shimmer ────────────────────────────────────────────────────────

const SkeletonBlock: React.FC<{ width?: number | string; height?: number; borderRadius?: number; style?: object }> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.35, { duration: 700 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(shimmer);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: 'rgba(255,255,255,0.10)' },
        animStyle,
        style,
      ]}
    />
  );
};

const StatsSkeleton: React.FC<{ primary: string }> = ({ primary }) => (
  <View style={{ gap: 16 }}>
    <View style={[skeletonStyles.heroCard]}>
      <PlatformBlur intensity={50} tint="dark" style={skeletonStyles.heroBlur} androidColor="rgba(18,18,28,0.97)">
        <LinearGradient
          colors={[hexToRgba(primary, 0.12), hexToRgba(primary, 0.04)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={skeletonStyles.heroGrad}
        >
          <SkeletonBlock width={80} height={48} borderRadius={12} style={{ alignSelf: 'center' }} />
          <SkeletonBlock width={100} height={12} borderRadius={6} style={{ alignSelf: 'center', marginTop: 8 }} />
        </LinearGradient>
          </PlatformBlur>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[skeletonStyles.statCard, { borderColor: hexToRgba(primary, 0.12) }]}>
              <PlatformBlur intensity={50} tint="dark" style={skeletonStyles.statBlur} androidColor="rgba(18,18,28,0.97)">
            <SkeletonBlock width={22} height={22} borderRadius={11} style={{ alignSelf: 'center' }} />
            <SkeletonBlock width={32} height={14} borderRadius={6} style={{ alignSelf: 'center', marginTop: 6 }} />
            <SkeletonBlock width={40} height={10} borderRadius={5} style={{ alignSelf: 'center', marginTop: 4 }} />
          </PlatformBlur>
        </View>
      ))}
    </View>
    {[120, 100, 80].map((h, i) => (
      <View key={i} style={[skeletonStyles.sectionCard, { borderColor: 'rgba(255,255,255,0.12)' }]}>
        <PlatformBlur intensity={50} tint="dark" style={skeletonStyles.sectionBlur} androidColor="rgba(18,18,28,0.97)">
          <SkeletonBlock width={120} height={13} borderRadius={6} style={{ marginBottom: 14 }} />
          <SkeletonBlock height={h} borderRadius={10} />
        </PlatformBlur>
      </View>
    ))}
  </View>
);

const skeletonStyles = StyleSheet.create({
  heroCard: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  heroBlur: { borderRadius: 18, overflow: 'hidden', backgroundColor: GLASS_BG },
  heroGrad: { padding: 28 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  statBlur: { padding: 14, backgroundColor: GLASS_BG, borderRadius: 14, overflow: 'hidden' },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionBlur: { padding: 16, backgroundColor: GLASS_BG, borderRadius: 16, overflow: 'hidden' },
});

// ── Per-period page ─────────────────────────────────────────────────────────

interface PeriodPageProps {
  p: StatsPeriod;
  periodState: MyStatsState;
  branding: { primary: string };
  t: TFunction<'stats'>;
  onOpenWorkouts: () => void;
}

const PeriodPage: React.FC<PeriodPageProps> = ({ p, periodState, branding, t, onOpenWorkouts }) => {
  const {
    periodStats, origin,
    todaySessions, activityChart, activityChartActive,
    machines, achievements, periodAchievements,
  } = periodState;
  const isLoading = periodState.loading && periodStats.totalDrops === 0;

  const originTotal = origin.session + origin.challenge + origin.checkin + origin.bonus;
  const originPct = (val: number) => (originTotal > 0 ? Math.round((val / originTotal) * 100) : 0);

  // Animated values
  const heroText           = useCountUp(periodStats.totalDrops, formatNumber);
  const sessionsText       = useCountUp(periodStats.sessions,   (n) => n > 0 ? String(n) : '—');
  const hoursText          = useCountUp(periodStats.hours,      (n) => n > 0 ? `${n}h` : '—');
  const sessionCountText   = useCountUp(origin.session,         formatNumber);
  const challengeCountText = useCountUp(origin.challenge,       formatNumber);
  const checkinCountText   = useCountUp(origin.checkin,         formatNumber);
  const bonusCountText     = useCountUp(origin.bonus,           formatNumber);

  // Active days for week/month/all — formatted as X/total
  const activeDaysText = useCountUp(
    periodStats.activeDays,
    (n) => `${n}/${periodStats.totalDaysInPeriod}`,
  );

  const rankText    = useCountUp(periodStats.rank, (n) => n > 0 ? `#${n}` : '—');
  const avgText     = useCountUp(periodStats.avgDropsPerSession, (n) => n > 0 ? String(n) : '—');

  if (isLoading) {
    return <StatsSkeleton primary={branding.primary} />;
  }

  // Build the stat row cards — all use branding.primary accent for visual consistency
  type StatCard = { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string };
  const statCards: StatCard[] =
    p === 'today'
      ? [
          { icon: 'podium-outline',   value: rankText,       label: t('rank')         },
          { icon: 'flash-outline',    value: avgText,        label: t('avgPerSession') },
          { icon: 'barbell-outline',  value: sessionsText,   label: t('sessions')     },
          { icon: 'time-outline',     value: hoursText,      label: t('time')         },
        ]
      : [
          { icon: 'podium-outline',   value: rankText,       label: t('rank')         },
          { icon: 'calendar-outline', value: activeDaysText, label: t('activeDays')   },
          { icon: 'barbell-outline',  value: sessionsText,   label: t('sessions')     },
          { icon: 'time-outline',     value: hoursText,      label: t('time')         },
        ];

  const hasOrigin = originTotal > 0;
  // Show period highlights only for scoped periods — on 'all', Personal Records already shows lifetime data
  const showBestStreak = p !== 'today' && periodStats.periodBestStreak > 0;
  const hasHighlights =
    periodAchievements.bestSessionDrops > 0
    || periodAchievements.happyHoursUsed > 0
    || periodAchievements.challengesCompleted > 0
    || showBestStreak;

  return (
    <>
      {/* ── Hero card ── */}
      <View style={[styles.heroCardOuter, { borderTopColor: hexToRgba(branding.primary, 0.40) }]}>
        <PlatformBlur intensity={50} tint="dark" style={styles.heroCardBlur} androidColor="rgba(18,18,28,0.97)">
          <LinearGradient
            colors={[hexToRgba(branding.primary, 0.10), 'rgba(255,255,255,0.02)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.heroCardGradient}
          >
            <Text style={[styles.heroNumber, getNumberStyle(52), { color: branding.primary }]}>
              {heroText}
            </Text>
            <Text style={styles.heroLabel}>{t('totalDrops')}</Text>
          </LinearGradient>
        </PlatformBlur>
      </View>

      {/* ── Stat row (period-contextual) ── */}
      <View style={styles.statRow}>
        {statCards.map((s, i) => (
          <View key={i} style={[styles.statCardOuter, { borderTopColor: hexToRgba(branding.primary, 0.30) }]}>
            <PlatformBlur intensity={50} tint="dark" style={styles.statCardBlur} androidColor="rgba(18,18,28,0.97)">
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.08), 'rgba(255,255,255,0.01)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.statCardGradient}
              >
                <Ionicons name={s.icon} size={17} color={branding.primary} />
                <Text style={[styles.statValue, getNumberStyle(16), { color: '#FFFFFF' }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </LinearGradient>
            </PlatformBlur>
          </View>
        ))}
      </View>

      {/* ── Drops Origin ── */}
      {hasOrigin && (
        <View>
          <Text style={styles.sectionTitle}>{t('dropsOrigin')}</Text>
          <View style={styles.sectionCardOuter}>
            <PlatformBlur intensity={50} tint="dark" style={styles.sectionCardBlur} androidColor="rgba(18,18,28,0.97)">
              {([
                { key: 'workout',    pct: originPct(origin.session),   countText: sessionCountText,   icon: 'barbell-outline' as const, color: branding.primary },
                { key: 'challenges', pct: originPct(origin.challenge), countText: challengeCountText, icon: 'trophy-outline' as const,  color: '#FFD700' },
                { key: 'checkin',    pct: originPct(origin.checkin),   countText: checkinCountText,   icon: 'qr-code-outline' as const, color: branding.primary },
                { key: 'bonuses',    pct: originPct(origin.bonus),     countText: bonusCountText,     icon: 'gift-outline' as const,    color: '#4CD964' },
              ] as const).filter((r) => r.pct > 0).map((row, idx) => (
                <View
                  key={row.key}
                  style={[
                    styles.originRow,
                    idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' },
                  ]}
                >
                  <View style={[styles.originIconWrap, { backgroundColor: hexToRgba(row.color, 0.10) }]}>
                    <Ionicons name={row.icon} size={14} color={row.color} />
                  </View>
                  <Text style={styles.originLabel}>{t(`origin.${row.key}`)}</Text>
                  <View style={styles.originBarOuter}>
                    <AnimatedBar pct={row.pct} color={hexToRgba(row.color, 0.65)} />
                  </View>
                  <Text style={[styles.originCount, getNumberStyle(12)]}>{row.countText}</Text>
                  <Text style={[styles.originPct, getNumberStyle(11)]}>{row.pct}%</Text>
                </View>
              ))}
            </PlatformBlur>
          </View>
        </View>
      )}

      {/* ── Activity Visualization (period-specific) ── */}
      {p === 'today' && (
        <TodayTimeline sessions={todaySessions} branding={branding} t={t} onOpenWorkouts={onOpenWorkouts} />
      )}
      {p === 'week' && activityChart.length > 0 && (
        <TouchableOpacity activeOpacity={0.92} onPress={onOpenWorkouts}>
          <WeeklyActivityChart
            data={activityChart}
            activeDays={activityChartActive}
            totalSlots={7}
            brandPrimary={branding.primary}
            title={t('thisWeek')}
            activeSuffix={t('days')}
            showDropLabels
          />
        </TouchableOpacity>
      )}
      {p === 'month' && activityChart.length > 0 && (
        <TouchableOpacity activeOpacity={0.92} onPress={onOpenWorkouts}>
          <WeeklyActivityChart
            data={activityChart}
            activeDays={activityChartActive}
            totalSlots={activityChart.length}
            brandPrimary={branding.primary}
            title={t('monthActivity')}
            activeSuffix={t('weeks')}
            showDropLabels
          />
        </TouchableOpacity>
      )}
      {p === 'all' && activityChart.length > 0 && (
        <TouchableOpacity activeOpacity={0.92} onPress={onOpenWorkouts}>
          <WeeklyActivityChart
            data={activityChart}
            activeDays={activityChartActive}
            totalSlots={6}
            brandPrimary={branding.primary}
            title={t('monthlyTrend')}
            activeSuffix={t('months')}
            showDropLabels
          />
        </TouchableOpacity>
      )}

      {/* ── Machines ── */}
      {machines.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{t('machines')}</Text>
          <View style={styles.sectionCardOuter}>
            <PlatformBlur intensity={50} tint="dark" style={styles.sectionCardBlur} androidColor="rgba(18,18,28,0.97)">
              {machines.map((m, i) => (
                <View
                  key={i}
                  style={[
                    styles.machineRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' },
                  ]}
                >
                  <View style={[styles.machineIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                    <Ionicons name={machineIcon(m.type)} size={18} color={branding.primary} />
                  </View>
                  <View style={styles.machineInfo}>
                    <Text style={styles.machineType}>{machineLabel(m.type)}</Text>
                    <Text style={styles.machineSub}>
                      {m.sessions} {t('sessionCount', { count: m.sessions })} · {t('avg')} {m.avgMinutes} min
                    </Text>
                  </View>
                </View>
              ))}
            </PlatformBlur>
          </View>
        </View>
      )}

      {/* ── Highlights (all periods) ── */}
      {hasHighlights && (
        <View>
          <Text style={styles.sectionTitle}>{t('periodHighlights')}</Text>
          <View style={styles.sectionCardOuter}>
            <PlatformBlur intensity={50} tint="dark" style={styles.sectionCardBlur} androidColor="rgba(18,18,28,0.97)">
              {(() => {
                const rows: React.ReactNode[] = [];
                let idx = 0;

                if (periodAchievements.bestSessionDrops > 0) {
                  rows.push(
                    <View key="bestSession" style={[styles.achieveRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
                      <View style={[styles.achieveIconWrap, { backgroundColor: hexToRgba('#FFD700', 0.12) }]}>
                        <Ionicons name="podium" size={15} color="#FFD700" />
                      </View>
                      <Text style={styles.achieveLabel}>{t('bestSession')}</Text>
                      <Text style={[styles.achieveValue, getNumberStyle(13)]}>
                        {periodAchievements.bestSessionDrops} {t('drops')}
                      </Text>
                    </View>
                  );
                  idx++;
                }

                if (periodAchievements.happyHoursUsed > 0) {
                  rows.push(
                    <View key="happyHours" style={[styles.achieveRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
                      <View style={[styles.achieveIconWrap, { backgroundColor: hexToRgba('#FFD700', 0.12) }]}>
                        <Ionicons name="flash" size={15} color="#FFD700" />
                      </View>
                      <Text style={styles.achieveLabel}>{t('happyHours')}</Text>
                      <Text style={[styles.achieveValue, getNumberStyle(13)]}>
                        {periodAchievements.happyHoursUsed} {t('used')}
                      </Text>
                    </View>
                  );
                  idx++;
                }

                if (periodAchievements.challengesCompleted > 0) {
                  rows.push(
                    <View key="challenges" style={[styles.achieveRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
                      <View style={[styles.achieveIconWrap, { backgroundColor: hexToRgba('#C0C0C0', 0.12) }]}>
                        <Ionicons name="trophy" size={15} color="#C0C0C0" />
                      </View>
                      <Text style={styles.achieveLabel}>{t('challengesDone')}</Text>
                      <Text style={[styles.achieveValue, getNumberStyle(13)]}>
                        {periodAchievements.challengesCompleted} {t('completed')}
                      </Text>
                    </View>
                  );
                  idx++;
                }

                if (showBestStreak) {
                  rows.push(
                    <View key="bestStreak" style={[styles.achieveRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
                      <View style={[styles.achieveIconWrap, { backgroundColor: hexToRgba('#FF6B00', 0.12) }]}>
                        <Ionicons name="flame" size={15} color="#FF6B00" />
                      </View>
                      <Text style={styles.achieveLabel}>{t('bestStreak')}</Text>
                      <Text style={[styles.achieveValue, getNumberStyle(13), { color: '#FF6B00' }]}>
                        {periodStats.periodBestStreak} {t('days')}
                      </Text>
                    </View>
                  );
                }

                return rows;
              })()}
            </PlatformBlur>
          </View>
        </View>
      )}
    </>
  );
};

// ── Today Timeline ──────────────────────────────────────────────────────────

const TodayTimeline: React.FC<{
  sessions: TodaySession[];
  branding: { primary: string };
  t: TFunction<'stats'>;
  onOpenWorkouts: () => void;
}> = ({ sessions, branding, t, onOpenWorkouts }) => {
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onOpenWorkouts}>
      <Text style={styles.sectionTitle}>{t('todaySessions')}</Text>
      <View style={styles.sectionCardOuter}>
        <PlatformBlur intensity={50} tint="dark" style={styles.sectionCardBlur} androidColor="rgba(18,18,28,0.97)">
          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="fitness-outline" size={32} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyStateText}>{t('noSessionsToday')}</Text>
            </View>
          ) : (
            sessions.map((s, i) => {
              const time = fmtTime(s.startedAt, { hour: '2-digit', minute: '2-digit', hour12: false });
              const mins = Math.round(s.durationSeconds / 60);
              return (
                <Animated.View
                  key={s.id}
                  entering={FadeInDown.delay(60 * i).duration(300)}
                  style={[
                    styles.timelineRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' },
                  ]}
                >
                  <Text style={styles.timelineTime}>{time}</Text>
                  <View style={styles.timelineDot}>
                    <View style={[styles.timelineDotInner, { backgroundColor: branding.primary }]} />
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={[styles.timelineDrops, { color: branding.primary }]}>
                      {s.dropsEarned} {t('drops')}
                    </Text>
                    <Text style={styles.timelineMeta}>
                      {mins} min{s.machineType ? ` · ${machineLabel(s.machineType)}` : ''}
                    </Text>
                  </View>
                </Animated.View>
              );
            })
          )}
        </PlatformBlur>
      </View>
    </TouchableOpacity>
  );
};

// ── Main screen ─────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { t } = useTranslation('stats');
  const branding = useBranding();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const router = useThrottledRouter();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();

  const [gymCount, setGymCount] = useState(1);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from('gym_memberships')
      .select('gym_id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .then(({ count }) => { if (count != null) setGymCount(count); });
  }, [session?.user?.id]);

  type ScopeType = 'gym' | 'global';
  const [scope, setScope] = useState<ScopeType>('gym');
  const selectedGymId = scope === 'gym' ? activeGymId : null;
  const { states, load, loadIfNeeded, refresh, invalidateCache } = useMyStats(selectedGymId);

  const { period: periodParam } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: StatsPeriod =
    periodParam === 'today' || periodParam === 'week' || periodParam === 'month' || periodParam === 'all'
      ? periodParam
      : 'week';
  const [period, setPeriod] = useState<StatsPeriod>(initialPeriod);
  const [refreshing, setRefreshing] = useState(false);

  // Switch tab: load from cache instantly, then lazy-load remaining tabs in background
  const handlePeriodChange = useCallback((p: StatsPeriod) => {
    setPeriod(p);
    loadIfNeeded(p);
  }, [loadIfNeeded]);

  // On focus: only load active period if not cached — avoids re-fetches on every tab switch
  useFocusEffect(useCallback(() => {
    loadIfNeeded(period);
  }, [period, loadIfNeeded]));

  // When scope changes: invalidate cache then reload active period first, lazy-load rest
  useEffect(() => {
    invalidateCache();
    load(period);
    PERIODS.filter((p) => p !== period).forEach((p) => loadIfNeeded(p));
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull-to-refresh: force-refresh only the visible period
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh(period);
    setRefreshing(false);
  }, [period, refresh]);

  const handleOpenWorkouts = useCallback(() => {
    router.push('/workout-history');
  }, [router]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#080808', '#0A0E1A', '#080808']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      {gymCount > 1 && (
        <View style={styles.scopeRow}>
          {(['gym', 'global'] as ScopeType[]).map((s) => {
            const isActive = scope === s;
            const icon = s === 'gym' ? 'location' : 'globe-outline';
            return (
              <TouchableOpacity
                key={s}
                style={[
                  styles.scopePill,
                  isActive && { backgroundColor: hexToRgba(branding.primary, 0.14), borderColor: hexToRgba(branding.primary, 0.35) },
                ]}
                onPress={() => setScope(s)}
                activeOpacity={0.75}
              >
                <Ionicons name={icon} size={13} color={isActive ? branding.primary : 'rgba(255,255,255,0.38)'} />
                <Text style={[styles.scopePillLabel, { color: isActive ? branding.primary : 'rgba(255,255,255,0.42)' }]}>
                  {t(s === 'gym' ? 'myGym' : 'global')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.tabsWrapper}>
        <SliderTabs
          tabs={PERIODS.map((p) => ({ key: p, label: t(`period.${p}`) }))}
          activeKey={period}
          onChange={(key) => handlePeriodChange(key as StatsPeriod)}
          accentColor={branding.primary}
          barStyle={styles.tabBar}
        >
          {PERIODS.map((p) => (
            <ScrollView
              key={p}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                p === period ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="rgba(255,255,255,0.4)"
                  />
                ) : undefined
              }
            >
              <PeriodPage
                p={p}
                periodState={states[p]}
                branding={branding}
                t={t}
                onOpenWorkouts={handleOpenWorkouts}
              />
            </ScrollView>
          ))}
        </SliderTabs>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  scopePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scopePillLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  tabsWrapper: {
    flex: 1,
  },
  tabBar: {
    marginHorizontal: 16,
    marginBottom: 0,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
  },

  // ── Hero card ──
  heroCardOuter: {
    borderRadius: 18,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftColor: 'rgba(255,255,255,0.08)',
    borderRightColor: 'rgba(255,255,255,0.05)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: GLASS_BG,
  },
  heroCardBlur: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroCardGradient: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroNumber: {
    lineHeight: 58,
    color: '#FFFFFF',
  },
  heroLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 6,
  },

  // ── 4-stat row ──
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  statCardOuter: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    borderLeftColor: 'rgba(255,255,255,0.07)',
    borderRightColor: 'rgba(255,255,255,0.04)',
    borderBottomColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
  },
  statCardBlur: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  statCardGradient: {
    paddingVertical: 13,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    lineHeight: 20,
    marginTop: 2,
  },
  statLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // ── Section wrapper ──
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 13,
    color: appTheme.colors.textTertiary,
    letterSpacing: 2,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionCardOuter: {
    borderRadius: 16,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    borderLeftColor: 'rgba(255,255,255,0.07)',
    borderRightColor: 'rgba(255,255,255,0.04)',
    borderBottomColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: GLASS_BG,
  },
  sectionCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },

  // ── Origin ──
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 8,
  },
  originIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  originLabel: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    width: 80,
  },
  originBarOuter: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  originCount: {
    width: 44,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
  },
  originPct: {
    width: 32,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
  },

  // ── Today timeline ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateText: {
    ...fontStyles.body,
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    marginTop: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  timelineTime: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    width: 44,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDrops: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
  },
  timelineMeta: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 2,
  },

  // ── Machines ──
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  machineIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineInfo: { flex: 1 },
  machineType: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  machineSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 2,
  },

  // ── Achievements / Highlights ──
  achieveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  achieveIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achieveLabel: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    flex: 1,
  },
  achieveValue: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'right',
    flexShrink: 1,
  },

});
