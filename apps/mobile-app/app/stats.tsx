import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
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
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useBranding } from '@/lib/hooks/useBranding';
import { fontStyles, getNumberStyle, theme as appTheme, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { useMyStats, StatsPeriod } from '@/hooks/useMyStats';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

// ── Animation config ────────────────────────────────────────────────────────
const NUM_DURATION = 520;
const BAR_DURATION = 480;
const NUM_EASING = Easing.out(Easing.cubic);

// ── useCountUp: animates a displayed integer from prev → next value ─────────
function useCountUp(target: number, format: (n: number) => string): string {
  const displayed = useSharedValue(target);
  const [text, setText] = useState(format(target));
  const prevTarget = useRef(target);

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;
    if (from === target) return;

    // Run a JS-side interval for cross-platform reliability
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

// ── AnimatedBar: smoothly transitions width% ────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────
function formatNumber(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1_000) return n.toLocaleString('en-US');
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
  } catch {
    return '—';
  }
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

// ── Stats skeleton ─────────────────────────────────────────────────────────

const StatsSkeleton: React.FC<{ primary: string }> = ({ primary }) => (
  <View style={{ gap: 16 }}>
    {/* Hero */}
    <View style={[skeletonStyles.heroCard]}>
      <BlurView intensity={50} tint="dark" style={skeletonStyles.heroBlur}>
        <LinearGradient
          colors={[hexToRgba(primary, 0.12), hexToRgba(primary, 0.04)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={skeletonStyles.heroGrad}
        >
          <SkeletonBlock width={80} height={48} borderRadius={12} style={{ alignSelf: 'center' }} />
          <SkeletonBlock width={100} height={12} borderRadius={6} style={{ alignSelf: 'center', marginTop: 8 }} />
        </LinearGradient>
      </BlurView>
    </View>

    {/* Stat row */}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[skeletonStyles.statCard, { borderColor: hexToRgba(primary, 0.12) }]}>
          <BlurView intensity={50} tint="dark" style={skeletonStyles.statBlur}>
            <SkeletonBlock width={22} height={22} borderRadius={11} style={{ alignSelf: 'center' }} />
            <SkeletonBlock width={32} height={14} borderRadius={6} style={{ alignSelf: 'center', marginTop: 6 }} />
            <SkeletonBlock width={40} height={10} borderRadius={5} style={{ alignSelf: 'center', marginTop: 4 }} />
          </BlurView>
        </View>
      ))}
    </View>

    {/* Section cards */}
    {[120, 100, 80].map((h, i) => (
      <View key={i} style={[skeletonStyles.sectionCard, { borderColor: 'rgba(255,255,255,0.12)' }]}>
        <BlurView intensity={50} tint="dark" style={skeletonStyles.sectionBlur}>
          <SkeletonBlock width={120} height={13} borderRadius={6} style={{ marginBottom: 14 }} />
          <SkeletonBlock height={h} borderRadius={10} />
        </BlurView>
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

// ── Per-period page — stays mounted, animates numbers in-place ─────────────

interface PeriodPageProps {
  p: StatsPeriod;
  periodState: import('@/hooks/useMyStats').MyStatsState;
  branding: { primary: string };
  t: TFunction<'stats'>;
}

const PeriodPage: React.FC<PeriodPageProps> = ({ periodState, branding, t }) => {
  const { periodStats, origin, weekDays, weekActive, machines, achievements } = periodState;
  const isLoading = periodState.loading && periodStats.totalDrops === 0;

  const originTotal = origin.session + origin.challenge + origin.checkin + origin.bonus;
  const originPct = (val: number) => (originTotal > 0 ? Math.round((val / originTotal) * 100) : 0);

  const heroText           = useCountUp(periodStats.totalDrops, formatNumber);
  const rankText           = useCountUp(periodStats.rank,       (n) => n > 0 ? `#${n}` : '—');
  const streakText         = useCountUp(periodStats.streak,     (n) => n > 0 ? `${n}d` : '—');
  const sessionsText       = useCountUp(periodStats.sessions,   (n) => n > 0 ? String(n) : '—');
  const hoursText          = useCountUp(periodStats.hours,      (n) => n > 0 ? `${n}h` : '—');
  const sessionCountText   = useCountUp(origin.session,         formatNumber);
  const challengeCountText = useCountUp(origin.challenge,       formatNumber);
  const checkinCountText   = useCountUp(origin.checkin,         formatNumber);
  const bonusCountText     = useCountUp(origin.bonus,           formatNumber);

  if (isLoading) {
    return <StatsSkeleton primary={branding.primary} />;
  }

  return (
    <>
      {/* ── Hero card ── */}
      <View style={[styles.heroCardOuter, { borderTopColor: hexToRgba(branding.primary, 0.40) }]}>
        <BlurView intensity={50} tint="dark" style={styles.heroCardBlur}>
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
        </BlurView>
      </View>

      {/* ── 4-stat row ── */}
      <View style={styles.statRow}>
        {([
          { icon: 'podium-outline' as const,  value: rankText,     label: t('rank'),     accent: branding.primary },
          { icon: 'flame-outline' as const,   value: streakText,   label: t('streak'),   accent: '#FF6B00' },
          { icon: 'barbell-outline' as const, value: sessionsText, label: t('sessions'), accent: branding.primary },
          { icon: 'time-outline' as const,    value: hoursText,    label: t('time'),     accent: branding.primary },
        ]).map((s, i) => (
          <View key={i} style={[styles.statCardOuter, { borderTopColor: hexToRgba(s.accent, 0.30) }]}>
            <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
              <LinearGradient
                colors={[hexToRgba(s.accent, 0.08), 'rgba(255,255,255,0.01)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.statCardGradient}
              >
                <Ionicons name={s.icon} size={17} color={s.accent} />
                <Text style={[styles.statValue, getNumberStyle(16), { color: '#FFFFFF' }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </LinearGradient>
            </BlurView>
          </View>
        ))}
      </View>

      {/* ── Drops Origin ── */}
      {originTotal > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{t('dropsOrigin')}</Text>
          <View style={styles.sectionCardOuter}>
            <BlurView intensity={50} tint="dark" style={styles.sectionCardBlur}>
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
            </BlurView>
          </View>
        </View>
      )}

      {/* ── Streak / This week ── */}
      {weekDays.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{t('streakHistory')}</Text>
          <View style={styles.sectionCardOuter}>
            <BlurView intensity={50} tint="dark" style={styles.sectionCardBlur}>
              <View style={styles.weekHeaderRow}>
                <Text style={styles.weekSummary}>{t('thisWeek')}</Text>
                <Text style={[styles.weekActivePill, { color: branding.primary }]}>
                  {weekActive}/7 {t('days')}
                </Text>
              </View>
              <View style={styles.weekRow}>
                {weekDays.map((d, i) => (
                  <View key={i} style={styles.weekDayCol}>
                    <View
                      style={[
                        styles.weekDayDot,
                        d.active
                          ? { backgroundColor: branding.primary, borderColor: 'transparent' }
                          : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.12)' },
                      ]}
                    >
                      {d.active && <Ionicons name="checkmark" size={13} color="#000" />}
                    </View>
                    <Text style={[styles.weekDayLabel, d.active && { color: branding.primary }]}>
                      {d.dayLabel}
                    </Text>
                  </View>
                ))}
              </View>
            </BlurView>
          </View>
        </View>
      )}

      {/* ── Machines ── */}
      {machines.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{t('machines')}</Text>
          <View style={styles.sectionCardOuter}>
            <BlurView intensity={50} tint="dark" style={styles.sectionCardBlur}>
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
            </BlurView>
          </View>
        </View>
      )}

      {/* ── Achievements ── */}
      <View>
        <Text style={styles.sectionTitle}>{t('achievements')}</Text>
        <View style={styles.sectionCardOuter}>
          <BlurView intensity={50} tint="dark" style={styles.sectionCardBlur}>
            {([
              {
                icon: 'podium' as const,
                color: '#FFD700',
                label: t('bestSession'),
                value: achievements.bestSessionDrops > 0
                  ? `${achievements.bestSessionDrops} drops (${formatDate(achievements.bestSessionDate)})`
                  : '—',
              },
              {
                icon: 'flame' as const,
                color: '#FF6B00',
                label: t('bestStreak'),
                value: achievements.bestStreak > 0 ? `${achievements.bestStreak} ${t('days')}` : '—',
              },
              {
                icon: 'flash' as const,
                color: '#FFD700',
                label: t('happyHours'),
                value: achievements.happyHoursUsed > 0 ? `${achievements.happyHoursUsed} ${t('used')}` : '—',
              },
              {
                icon: 'trophy' as const,
                color: '#C0C0C0',
                label: t('challengesDone'),
                value: achievements.challengesCompleted > 0 ? `${achievements.challengesCompleted} ${t('completed')}` : '—',
              },
            ]).map((a, i) => (
              <View
                key={i}
                style={[
                  styles.achieveRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' },
                ]}
              >
                <View style={[styles.achieveIconWrap, { backgroundColor: hexToRgba(a.color, 0.12) }]}>
                  <Ionicons name={a.icon} size={15} color={a.color} />
                </View>
                <Text style={styles.achieveLabel}>{a.label}</Text>
                <Text style={[styles.achieveValue, getNumberStyle(13)]}>{a.value}</Text>
              </View>
            ))}
          </BlurView>
        </View>
      </View>
    </>
  );
};

// ── Main screen ────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { t } = useTranslation('stats');
  const branding = useBranding();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
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
  const { states, load } = useMyStats(selectedGymId);

  const { period: periodParam } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: StatsPeriod =
    periodParam === 'today' || periodParam === 'week' || periodParam === 'month' || periodParam === 'all'
      ? periodParam
      : 'week';
  const [period, setPeriod] = useState<StatsPeriod>(initialPeriod);
  const [refreshing, setRefreshing] = useState(false);

  const handlePeriodChange = useCallback((p: StatsPeriod) => {
    setPeriod(p);
    load(p);
  }, [load]);

  // On focus, reload just the active period
  useFocusEffect(useCallback(() => { load(period); }, []));

  // Preload all periods on first mount
  useEffect(() => {
    PERIODS.forEach((p) => load(p));
  }, [scope]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  }, [period, load]);

  return (
    <View style={styles.container}>
      {/* Background — bleeds under status bar */}
      <LinearGradient
        colors={['#080808', '#0A0E1A', '#080808']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      {/* Scope Toggle: My Gym | Global (above the period tab bar) */}
      {gymCount > 1 && (
        <View style={styles.scopeRow}>
          <SliderTabs
            tabs={[
              { key: 'gym', label: t('myGym'), icon: 'location' },
              { key: 'global', label: t('global'), icon: 'globe-outline' },
            ]}
            activeKey={scope}
            onChange={(key) => setScope(key as ScopeType)}
            accentColor={branding.primary}
          />
        </View>
      )}

      {/* Period TabView — pages stay mounted, data updates in background */}
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
              <PeriodPage p={p} periodState={states[p]} branding={branding} t={t} />
            </ScrollView>
          ))}
        </SliderTabs>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scopeRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
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
    width: 72,
  },
  originBarOuter: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  originBarInner: {
    height: '100%',
    borderRadius: 2,
  },
  originCount: {
    width: 38,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
  },
  originPct: {
    width: 30,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
  },

  // ── Streak week ──
  weekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  weekSummary: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
  },
  weekActivePill: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 6,
  },
  weekDayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekDayLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  weekDayLabelActive: {
    color: 'rgba(255,255,255,0.80)',
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

  // ── Achievements ──
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
