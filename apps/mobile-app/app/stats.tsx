import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useBranding } from '@/lib/hooks/useBranding';
import { fontStyles, getNumberStyle, theme as appTheme, hexToRgba} from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useMyStats, StatsPeriod } from '@/hooks/useMyStats';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

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
  const { state, load } = useMyStats(selectedGymId);

  const { period: periodParam } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: StatsPeriod =
    periodParam === 'today' || periodParam === 'week' || periodParam === 'month' || periodParam === 'all'
      ? periodParam
      : 'week';
  const [period, setPeriod] = useState<StatsPeriod>(initialPeriod);
  const [refreshing, setRefreshing] = useState(false);

  // Track if a period switch is in flight so we can show skeleton
  const [switching, setSwitching] = useState(false);
  const prevPeriod = useRef<StatsPeriod>(initialPeriod);

  const handlePeriodChange = useCallback(async (p: StatsPeriod) => {
    if (p === period) return;
    setSwitching(true);
    setPeriod(p);
  }, [period]);

  useEffect(() => {
    if (period !== prevPeriod.current) {
      prevPeriod.current = period;
      load(period).finally(() => setSwitching(false));
    }
  }, [period, load]);

  useFocusEffect(useCallback(() => { load(period); }, [period, load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  }, [period, load]);

  const isLoading = state.loading || switching;

  const { periodStats, origin, weekDays, weekActive, machines, achievements } = state;

  const originTotal = origin.session + origin.challenge + origin.checkin + origin.bonus;
  const originPct = (val: number) => (originTotal > 0 ? Math.round((val / originTotal) * 100) : 0);

  return (
    <View style={styles.container}>
      {/* Background — bleeds under status bar */}
      <LinearGradient
        colors={['#080808', '#0A0E1A', '#080808']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header — respects status bar via insets */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="rgba(255,255,255,0.4)"
          />
        }
      >
        {/* Scope Toggle: My Gym | Global */}
        {gymCount > 1 && (
          <Animated.View entering={FadeInDown.delay(25).duration(300)}>
            <View style={styles.scopeToggle}>
              <BlurView intensity={50} tint="dark" style={styles.scopeToggleBlur}>
                {([
                  { key: 'gym' as ScopeType, label: t('myGym'), icon: 'location' as const },
                  { key: 'global' as ScopeType, label: t('global'), icon: 'globe-outline' as const },
                ]).map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.scopeTab,
                      scope === tab.key && {
                        backgroundColor: hexToRgba(branding.primary, 0.15),
                        borderColor: hexToRgba(branding.primary, 0.35),
                      },
                    ]}
                    onPress={() => setScope(tab.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={14}
                      color={scope === tab.key ? branding.primary : 'rgba(255,255,255,0.35)'}
                    />
                    <Text style={[styles.scopeTabText, scope === tab.key && { color: branding.primary }]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Period Selector */}
        <Animated.View entering={FadeInDown.delay(50).duration(300)}>
          <View style={styles.periodRow}>
            {PERIODS.map((p) => {
              const isActive = period === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.periodPill,
                    isActive && {
                      backgroundColor: hexToRgba(branding.primary, 0.14),
                      borderColor: hexToRgba(branding.primary, 0.40),
                    },
                  ]}
                  onPress={() => handlePeriodChange(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.periodText, isActive && { color: branding.primary }]}>
                    {t(`period.${p}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Skeleton */}
        {isLoading ? (
          <StatsSkeleton primary={branding.primary} />
        ) : (
          <>
            {/* ── Hero card ── */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(300)}
              style={[styles.heroCardOuter, { borderTopColor: hexToRgba(branding.primary, 0.40) }]}
            >
              <BlurView intensity={50} tint="dark" style={styles.heroCardBlur}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.10), 'rgba(255,255,255,0.02)']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.heroCardGradient}
                >
                  <Text style={[styles.heroNumber, getNumberStyle(52), { color: branding.primary }]}>
                    {formatNumber(periodStats.totalDrops)}
                  </Text>
                  <Text style={styles.heroLabel}>{t('totalDrops')}</Text>
                </LinearGradient>
              </BlurView>
            </Animated.View>

            {/* ── 4-stat row ── */}
            <Animated.View entering={FadeInDown.delay(130).duration(300)} style={styles.statRow}>
              {([
                { icon: 'podium-outline' as const,  value: periodStats.rank > 0     ? `#${periodStats.rank}`       : '—', label: t('rank'),     accent: branding.primary },
                { icon: 'flame-outline' as const,   value: periodStats.streak > 0   ? `${periodStats.streak}d`     : '—', label: t('streak'),   accent: '#FF6B00' },
                { icon: 'barbell-outline' as const, value: periodStats.sessions > 0 ? String(periodStats.sessions) : '—', label: t('sessions'), accent: branding.primary },
                { icon: 'time-outline' as const,    value: periodStats.hours > 0    ? `${periodStats.hours}h`      : '—', label: t('time'),     accent: branding.primary },
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
            </Animated.View>

            {/* ── Drops Origin ── */}
            {originTotal > 0 && (
              <Animated.View entering={FadeInDown.delay(220).duration(300)}>
                <Text style={styles.sectionTitle}>{t('dropsOrigin')}</Text>
                <View style={styles.sectionCardOuter}>
                  <BlurView intensity={50} tint="dark" style={styles.sectionCardBlur}>
                    {([
                      { key: 'workout',    value: origin.session,   icon: 'barbell-outline' as const, color: branding.primary },
                      { key: 'challenges', value: origin.challenge, icon: 'trophy-outline' as const,  color: '#FFD700' },
                      { key: 'checkin',    value: origin.checkin,   icon: 'qr-code-outline' as const, color: branding.primary },
                      { key: 'bonuses',    value: origin.bonus,     icon: 'gift-outline' as const,    color: '#4CD964' },
                    ] as const).filter((r) => r.value > 0).map((row, idx) => {
                      const pct = originPct(row.value);
                      return (
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
                            <View
                              style={[
                                styles.originBarInner,
                                { width: `${Math.max(pct, 3)}%`, backgroundColor: hexToRgba(row.color, 0.6) },
                              ]}
                            />
                          </View>
                          <Text style={[styles.originCount, getNumberStyle(12)]}>{formatNumber(row.value)}</Text>
                          <Text style={[styles.originPct, getNumberStyle(11)]}>{pct}%</Text>
                        </View>
                      );
                    })}
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Streak / This week ── */}
            {weekDays.length > 0 && (
              <Animated.View entering={FadeInDown.delay(260).duration(300)}>
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
              </Animated.View>
            )}

            {/* ── Machines ── */}
            {machines.length > 0 && (
              <Animated.View entering={FadeInDown.delay(300).duration(300)}>
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
              </Animated.View>
            )}

            {/* ── Achievements ── */}
            <Animated.View entering={FadeInDown.delay(340).duration(300)}>
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
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // ── Scope toggle ──
  scopeToggle: {
    borderRadius: appTheme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  scopeToggleBlur: {
    flexDirection: 'row',
    borderRadius: appTheme.borderRadius.xl,
    overflow: 'hidden',
    padding: 4,
    backgroundColor: GLASS_BG,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: appTheme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scopeTabActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  scopeTabText: {
    ...fontStyles.heading,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  scopeTabTextActive: {
    color: '#FFFFFF',
  },

  // ── Period selector ──
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  periodPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  periodPillActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  periodText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.2,
  },
  periodTextActive: {
    color: '#FFFFFF',
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
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
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
