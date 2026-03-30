import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

// AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.5)
// Workout History screen with calendar dots and session cards.
// Data comes from `sessions` table. Machine type comes from joined `machines` table.

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Days of week will be localized in the component
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 48 - 6 * 8) / 7); // 48=padding, 6*8=gaps
interface RawMetrics {
  avg_cadence?: number | null;
  avg_speed_kmh?: number | null;
  max_speed_kmh?: number | null;
  avg_power_watts?: number | null;
  max_power_watts?: number | null;
  total_distance?: number | null;
  device_calories?: number | null;
  calories_source?: string;
  ble_protocol?: string;
}

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  drops_earned: number;
  calories: number | null;
  multiplier: number | null;
  raw_metrics: RawMetrics | null;
  gym_id: string;
  machines: { name: string; type: string } | null;
  gyms: { name: string } | null;
}

const MACHINE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  treadmill: 'walk-outline',
  bike: 'bicycle-outline',
  elliptical: 'fitness-outline',
  weight: 'barbell-outline',
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}${i18n.t('history:hours')} ${m}${i18n.t('history:minutes')}`;
  return `${m}${i18n.t('history:minutes')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const locale = i18n.language === 'sr' ? 'sr-RS' : 'en-US';
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const locale = i18n.language === 'sr' ? 'sr-RS' : 'en-US';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: i18n.language !== 'sr' });
}

export default function WorkoutHistoryScreen() {
  const { t } = useTranslation('history');
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();

  const DAYS_OF_WEEK = [t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat'), t('sun')];

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          started_at,
          ended_at,
          duration_seconds,
          drops_earned,
          calories,
          multiplier,
          raw_metrics,
          gym_id,
          machines ( name, type ),
          gyms ( name )
        `)
        .eq('user_id', session.user.id)
        .eq('is_active', false)
        .order('started_at', { ascending: false })
        .limit(100);

      if (error) {
        log.error('[WorkoutHistory] Error loading sessions:', error);
        return;
      }

      setSessions((data as unknown as SessionRow[]) || []);
    } catch (err) {
      log.error('[WorkoutHistory] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  // ── Calendar Logic ──
  const toLocalDate = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const workoutDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.started_at) {
        set.add(toLocalDate(new Date(s.started_at)));
      }
    }
    return set;
  }, [sessions]);

  const calendarDays = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // getDay(): 0=Sun, adjust for Mon-start: Mon=0, Sun=6
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const days: { date: number | null; dateStr: string; hasWorkout: boolean; isToday: boolean }[] = [];

    // Empty leading cells
    for (let i = 0; i < startOffset; i++) {
      days.push({ date: null, dateStr: '', hasWorkout: false, isToday: false });
    }

    const todayStr = toLocalDate(new Date());

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: d,
        dateStr,
        hasWorkout: workoutDates.has(dateStr),
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [selectedMonth, workoutDates]);

  const monthLabel = selectedMonth.toLocaleDateString(
    i18n.language === 'sr' ? 'sr-RS' : 'en-US',
    { month: 'long', year: 'numeric' }
  );
  const today = new Date();
  const canGoForward = selectedMonth.getFullYear() < today.getFullYear() ||
    (selectedMonth.getFullYear() === today.getFullYear() && selectedMonth.getMonth() < today.getMonth());

  const prevMonth = () => {
    setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    if (canGoForward) {
      setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  // ── Filtered sessions for selected month ──
  const filteredSessions = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    return sessions.filter(s => {
      const d = new Date(s.started_at);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [sessions, selectedMonth]);

  // ── Group sessions by day ──
  const groupedByDay = useMemo(() => {
    const groups: { dateStr: string; label: string; sessions: SessionRow[] }[] = [];
    const map = new Map<string, SessionRow[]>();
    for (const s of filteredSessions) {
      const d = new Date(s.started_at);
      const key = toLocalDate(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const [dateStr, daySessions] of map) {
      const d = new Date(dateStr + 'T12:00:00');
      const isToday = dateStr === toLocalDate(new Date());
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = dateStr === toLocalDate(yesterday);
      const label = isToday
        ? t('today')
        : isYesterday
        ? t('yesterday')
        : d.toLocaleDateString(i18n.language === 'sr' ? 'sr-RS' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
      groups.push({ dateStr, label, sessions: daySessions });
    }
    return groups;
  }, [filteredSessions]);

  // ── Streak calculations (current + max) ──
  const streakInfo = useMemo(() => {
    if (sessions.length === 0) return { current: 0, max: 0 };

    const toLocalDateStr = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const uniqueDates = new Set<string>();
    for (const s of sessions) {
      if (s.started_at) {
        uniqueDates.add(toLocalDateStr(new Date(s.started_at)));
      }
    }

    if (uniqueDates.size === 0) return { current: 0, max: 0 };

    const now = new Date();
    const todayStr = toLocalDateStr(now);
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterdayDate);

    let current = 0;
    let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!uniqueDates.has(todayStr)) {
      if (!uniqueDates.has(yesterdayStr)) {
        current = 0;
      } else {
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    if (uniqueDates.has(todayStr) || uniqueDates.has(yesterdayStr)) {
      while (true) {
        const ds = toLocalDateStr(checkDate);
        if (uniqueDates.has(ds)) {
          current++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    let maxStreak = 0;
    let streak = 1;
    const ascending = Array.from(uniqueDates).sort();
    for (let i = 1; i < ascending.length; i++) {
      const prev = new Date(ascending[i - 1] + 'T12:00:00');
      const curr = new Date(ascending[i] + 'T12:00:00');
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak++;
      } else {
        maxStreak = Math.max(maxStreak, streak);
        streak = 1;
      }
    }
    maxStreak = Math.max(maxStreak, streak);

    return { current, max: maxStreak };
  }, [sessions]);

  // ── Stats for selected month ──
  const monthStats = useMemo(() => {
    let totalDrops = 0;
    let totalDuration = 0;
    let totalCalories = 0;
    for (const s of filteredSessions) {
      totalDrops += s.drops_earned || 0;
      totalDuration += s.duration_seconds || 0;
      totalCalories += s.calories ? Number(s.calories) : 0;
    }
    return {
      workouts: filteredSessions.length,
      totalDrops,
      totalDuration,
      totalCalories: Math.round(totalCalories),
    };
  }, [filteredSessions]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
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

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionList
        sections={groupedByDay.map(group => ({ title: group.label, dateStr: group.dateStr, data: group.sessions }))}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={branding.primary} />
        }
        ListHeaderComponent={
          <>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <View style={[styles.calendarCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                <BlurView intensity={50} tint="dark" style={[styles.calendarBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  <View style={styles.monthNav}>
                    <TouchableOpacity onPress={prevMonth} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="chevron-back" size={24} color={branding.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.monthLabel, { color: branding.primary }]}>{monthLabel}</Text>
                    <TouchableOpacity onPress={nextMonth} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={!canGoForward}>
                      <Ionicons name="chevron-forward" size={24} color={canGoForward ? branding.primary : hexToRgba(branding.primary, 0.3)} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dayHeaders}>
                    {DAYS_OF_WEEK.map(day => (
                      <View key={day} style={styles.dayHeaderCell}>
                        <Text style={styles.dayHeaderText}>{day}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.calendarGrid}>
                    {calendarDays.map((cell, i) => (
                      <View key={i} style={styles.calendarCell}>
                        {cell.date !== null ? (
                          <View style={[
                            styles.dateCircle,
                            cell.isToday && { borderColor: branding.primary, borderWidth: 1.5 },
                            cell.hasWorkout && { backgroundColor: hexToRgba(branding.primary, 0.2) },
                          ]}>
                            <Text style={[
                              styles.dateText,
                              cell.isToday && { color: branding.primary, ...fontStyles.bodySemiBold },
                              cell.hasWorkout && { color: '#fff' },
                            ]}>
                              {cell.date}
                            </Text>
                            {cell.hasWorkout && (
                              <View style={[styles.workoutDot, { backgroundColor: branding.primary }]} />
                            )}
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </BlurView>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).duration(400)}>
              <View style={[styles.streakCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                <BlurView intensity={50} tint="dark" style={[styles.streakCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  <View style={styles.streakRow}>
                    <View style={styles.streakItem}>
                      <View style={[styles.streakIconBg, { backgroundColor: streakInfo.current > 0 ? 'rgba(255, 107, 53, 0.2)' : hexToRgba(branding.primary, 0.1) }]}>
                        <Ionicons name="flame" size={22} color={streakInfo.current > 0 ? '#FF6B35' : '#808080'} />
                      </View>
                      <Text style={[styles.streakValue, getNumberStyle(28), streakInfo.current > 0 && { color: '#FF6B35' }]}>
                        {streakInfo.current}
                      </Text>
                      <Text style={styles.streakLabel}>{t('currentStreak')}</Text>
                      <Text style={styles.streakUnit}>{t('days')}</Text>
                    </View>
                    <View style={[styles.streakDivider, { backgroundColor: hexToRgba(branding.primary, 0.12) }]} />
                    <View style={styles.streakItem}>
                      <View style={[styles.streakIconBg, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                        <Ionicons name="trophy" size={22} color={branding.primary} />
                      </View>
                      <Text style={[styles.streakValue, getNumberStyle(28), { color: branding.primary }]}>
                        {streakInfo.max}
                      </Text>
                      <Text style={styles.streakLabel}>{t('maxStreak')}</Text>
                      <Text style={styles.streakUnit}>{t('days')}</Text>
                    </View>
                  </View>
                  <Text style={styles.streakHint}>
                    {streakInfo.current > 0 ? t('streakActive') : t('streakInactive')}
                  </Text>
                </BlurView>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(260).duration(400)}>
              <View style={styles.statsRow}>
                <View style={[styles.statPill, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="barbell-outline" size={16} color={branding.primary} />
                  <Text style={[styles.statPillValue, getNumberStyle(16), { color: branding.primary }]}>{monthStats.workouts}</Text>
                  <Text style={styles.statPillLabel}>{t('workouts')}</Text>
                </View>
                <View style={[styles.statPill, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="water" size={16} color={branding.primary} />
                  <Text style={[styles.statPillValue, getNumberStyle(16), { color: branding.primary }]}>{monthStats.totalDrops}</Text>
                  <Text style={styles.statPillLabel}>{t('drops')}</Text>
                </View>
                <View style={[styles.statPill, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="time-outline" size={16} color={branding.primary} />
                  <Text style={[styles.statPillValue, getNumberStyle(16), { color: branding.primary }]}>{formatDuration(monthStats.totalDuration)}</Text>
                  <Text style={styles.statPillLabel}>{t('total')}</Text>
                </View>
              </View>
            </Animated.View>
          </>
        }
        ListEmptyComponent={
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={48} color={hexToRgba(branding.primary, 0.3)} />
            <Text style={styles.emptyTitle}>{t('noWorkoutsThisMonth')}</Text>
            <Text style={styles.emptySubtitle}>{t('scanQrToStart')}</Text>
          </Animated.View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayGroup}>
            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
              <View style={styles.daySectionHeader}>
                <Text style={[styles.daySectionLabel, { color: branding.primary }]}>
                  {section.title}
                </Text>
                <View style={[styles.daySectionLine, { backgroundColor: hexToRgba(branding.primary, 0.15) }]} />
              </View>
            </Animated.View>
          </View>
        )}
        renderItem={({ item: s }) => {
          const machineType = s.machines?.type || 'treadmill';
          const machineName = s.machines?.name || t('unknownMachine');
          const gymName = s.gyms?.name || '';
          const iconName = MACHINE_ICONS[machineType] || 'fitness-outline';
          const isExpanded = expandedSessionId === s.id;
          const metrics = s.raw_metrics as RawMetrics | null;

          return (
            <Animated.View entering={FadeInDown.delay(350).duration(400)}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setExpandedSessionId(isExpanded ? null : s.id)}
                style={[styles.sessionCard, { borderColor: hexToRgba(branding.primary, isExpanded ? 0.3 : 0.12) }]}
              >
                <BlurView intensity={40} tint="dark" style={[styles.sessionCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                  <View style={styles.sessionCardRow}>
                    <View style={[styles.machineIconCircle, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                      <Ionicons name={iconName} size={24} color={branding.primary} />
                    </View>

                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionMachine} numberOfLines={1}>{machineName}</Text>
                      <Text style={styles.sessionDate}>
                        {formatTime(s.started_at)} • {formatDuration(s.duration_seconds)}
                        {gymName ? ` • ${gymName}` : ''}
                      </Text>
                    </View>

                    <View style={styles.sessionStats}>
                      <View style={styles.sessionStatRow}>
                        <Ionicons name="water" size={14} color={branding.primary} />
                        <Text style={[styles.sessionDrops, getNumberStyle(16), { color: branding.primary }]}>
                          {s.drops_earned || 0}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={theme.colors.textTertiary}
                      />
                    </View>
                  </View>

                  {(s.calories || (s.multiplier && s.multiplier > 1)) && (
                    <View style={[styles.sessionDetailRow, { borderTopColor: hexToRgba(branding.primary, 0.08) }]}>
                      {s.calories ? (
                        <View style={styles.detailChip}>
                          <Ionicons name="flame-outline" size={12} color={theme.colors.secondary} />
                          <Text style={[styles.detailChipText, { color: theme.colors.secondary }]}>
                            ~{Math.round(Number(s.calories))} {t('cal')}
                          </Text>
                        </View>
                      ) : null}
                      {s.multiplier && s.multiplier > 1 ? (
                        <View style={[styles.detailChip, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                          <Ionicons name="flash" size={12} color={branding.primary} />
                          <Text style={[styles.detailChipText, { color: branding.primary }]}>
                            ×{s.multiplier.toFixed(1)} {t('multiplier')}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {isExpanded && (
                    <View style={[styles.expandedPanel, { borderTopColor: hexToRgba(branding.primary, 0.1) }]}>
                      <View style={styles.expandedGrid}>
                        <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                          <Ionicons name="time-outline" size={16} color={branding.primary} />
                          <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                            {formatDuration(s.duration_seconds)}
                          </Text>
                          <Text style={styles.expandedStatLabel}>{t('duration')}</Text>
                        </View>

                        <View style={[styles.expandedStat, { backgroundColor: 'rgba(255, 145, 0, 0.06)' }]}>
                          <Ionicons name="flame-outline" size={16} color={theme.colors.secondary} />
                          <Text style={[styles.expandedStatValue, getNumberStyle(18), { color: theme.colors.secondary }]}>
                            {s.calories ? `${Math.round(Number(s.calories))}` : '—'}
                          </Text>
                          <Text style={styles.expandedStatLabel}>{t('kcal')}</Text>
                        </View>

                        {metrics?.total_distance != null && metrics.total_distance > 0 && (
                          <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                            <Ionicons name="navigate-outline" size={16} color={branding.primary} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                              {metrics.total_distance >= 1000
                                ? `${(metrics.total_distance / 1000).toFixed(1)}`
                                : `${Math.round(metrics.total_distance)}`}
                            </Text>
                            <Text style={styles.expandedStatLabel}>
                              {metrics.total_distance >= 1000 ? t('km') : 'm'}
                            </Text>
                          </View>
                        )}

                        {metrics?.avg_speed_kmh != null && metrics.avg_speed_kmh > 0 && (
                          <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                            <Ionicons name="speedometer-outline" size={16} color={branding.primary} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                              {metrics.avg_speed_kmh.toFixed(1)}
                            </Text>
                            <Text style={styles.expandedStatLabel}>km/h avg</Text>
                          </View>
                        )}

                        {metrics?.max_speed_kmh != null && metrics.max_speed_kmh > 0 && (
                          <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                            <Ionicons name="flash-outline" size={16} color={branding.primary} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                              {metrics.max_speed_kmh.toFixed(1)}
                            </Text>
                            <Text style={styles.expandedStatLabel}>km/h max</Text>
                          </View>
                        )}

                        {metrics?.avg_cadence != null && metrics.avg_cadence > 0 && (
                          <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                            <Ionicons name="sync-outline" size={16} color={branding.primary} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                              {Math.round(metrics.avg_cadence)}
                            </Text>
                            <Text style={styles.expandedStatLabel}>
                              {machineType === 'treadmill' ? 'spm' : 'rpm'} avg
                            </Text>
                          </View>
                        )}

                        {metrics?.avg_power_watts != null && metrics.avg_power_watts > 0 && (
                          <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                            <Ionicons name="pulse-outline" size={16} color={branding.primary} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                              {metrics.avg_power_watts}
                            </Text>
                            <Text style={styles.expandedStatLabel}>W avg</Text>
                          </View>
                        )}

                        {metrics?.max_power_watts != null && metrics.max_power_watts > 0 && (
                          <View style={[styles.expandedStat, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                            <Ionicons name="pulse-outline" size={16} color={branding.primary} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(18)]}>
                              {metrics.max_power_watts}
                            </Text>
                            <Text style={styles.expandedStatLabel}>W max</Text>
                          </View>
                        )}
                      </View>

                      {metrics?.ble_protocol && (
                        <View style={styles.protocolRow}>
                          <View style={[styles.protocolBadge, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                            <Ionicons name="bluetooth" size={10} color={theme.colors.textTertiary} />
                            <Text style={styles.protocolText}>
                              {metrics.ble_protocol.toUpperCase()}
                            </Text>
                          </View>
                          {metrics.calories_source === 'device' && (
                            <View style={[styles.protocolBadge, { backgroundColor: 'rgba(255, 145, 0, 0.08)' }]}>
                              <Ionicons name="checkmark-circle" size={10} color={theme.colors.secondary} />
                              <Text style={[styles.protocolText, { color: theme.colors.secondary }]}>
                                Device calories
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </BlurView>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        ListFooterComponent={<View style={{ height: 40 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 14 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },

  // ── Calendar ──
  calendarCard: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  calendarBlur: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  monthLabel: {
    ...fontStyles.heading,
    fontSize: 20,
  },
  dayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.sm,
  },
  dayHeaderCell: {
    width: CELL_SIZE,
    alignItems: 'center',
  },
  dayHeaderText: {
    ...fontStyles.bodyMedium,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateCircle: {
    width: CELL_SIZE - 8,
    height: CELL_SIZE - 8,
    borderRadius: (CELL_SIZE - 8) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateText: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  workoutDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // ── Streak Card ──
  streakCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  streakCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  streakIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  streakValue: {
    color: '#FFFFFF',
    lineHeight: 32,
  },
  streakLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  streakUnit: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  streakDivider: {
    width: 1,
    height: 60,
    marginHorizontal: 16,
  },
  streakHint: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 14,
    letterSpacing: 0.2,
  },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
    gap: 8,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statPillValue: {
    ...fontStyles.number,
  },
  statPillLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
  },

  // ── Empty State ──
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  emptySubtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textTertiary,
  },

  // ── Day Section ──
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  daySectionLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  daySectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },

  // ── Session Cards ──
  sessionsList: {
    gap: 24,
  },
  dayGroup: {
    gap: 10,
  },
  sessionCard: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sessionCardBlur: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  sessionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  machineIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionMachine: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  sessionDate: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  sessionStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sessionStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionDrops: {
    ...fontStyles.number,
  },
  sessionDuration: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  sessionDetailRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 145, 0, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  detailChipText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
  },

  // ── Expanded Detail Panel ──
  expandedPanel: {
    borderTopWidth: 1,
    padding: 14,
    gap: 10,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expandedStat: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    gap: 2,
  },
  expandedStatValue: {
    color: '#FFFFFF',
    lineHeight: 22,
  },
  expandedStatLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  protocolRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  protocolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  protocolText: {
    ...fontStyles.body,
    fontSize: 9,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
  },
});
