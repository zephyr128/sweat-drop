import { View, Text, StyleSheet, SectionList, TouchableOpacity, Pressable, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import Svg, { Circle } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { formatDate as fmtDate, formatTime as fmtTime, formatMonthYear } from '@/lib/utils/formatDate';

// AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.5)
// Workout History screen with calendar dots and session cards.
// Data comes from `sessions` table. Machine type comes from joined `machines` table.

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Days of week will be localized in the component
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 48 - 6 * 8) / 7); // 48=padding, 6*8=gaps
interface HappyHourInfo {
  active: boolean;
  multiplier: number;
  rule_name?: string | null;
}

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
  drop_calc_v2?: {
    happy_hour?: HappyHourInfo;
    applied_multiplier?: number;
  };
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
  return fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return fmtTime(iso, { hour: '2-digit', minute: '2-digit', hour12: i18n.language !== 'sr' });
}

export default function WorkoutHistoryScreen() {
  const { t } = useTranslation('history');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();

  const DAYS_OF_WEEK = [t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat'), t('sun')];

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [profileStreakDays, setProfileStreakDays] = useState<number | null>(null);
  const [maxDropsPerDay, setMaxDropsPerDay] = useState<number>(300);

  const loadSessions = useCallback(async () => {
    if (!session?.user) return;

    try {
      const [sessionRes, profileRes] = await Promise.all([
        supabase
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
          .limit(100),
        supabase
          .from('profiles')
          .select('streak_days, last_visit_date, home_gym_id')
          .eq('id', session.user.id)
          .single(),
      ]);

      // Fetch daily drop limit from the user's home gym
      if (!profileRes.error && profileRes.data?.home_gym_id) {
        const limitsRes = await supabase.rpc('get_user_drop_limits', {
          p_gym_id: profileRes.data.home_gym_id,
        });
        const row = Array.isArray(limitsRes.data) ? limitsRes.data[0] : limitsRes.data;
        if (row?.max_drops_per_day) {
          setMaxDropsPerDay(Number(row.max_drops_per_day));
        }
      }

      if (sessionRes.error) {
        log.error('[WorkoutHistory] Error loading sessions:', sessionRes.error);
      } else {
        setSessions((sessionRes.data as unknown as SessionRow[]) || []);
      }

      if (!profileRes.error && profileRes.data) {
        const rawStreak = profileRes.data.streak_days ?? 0;
        const lastVisitStr = profileRes.data.last_visit_date;
        let displayStreak = rawStreak;
        if (lastVisitStr && rawStreak > 0) {
          const belgradeTodayStr = new Date().toLocaleDateString('sv-SE', {
            timeZone: 'Europe/Belgrade',
          });
          const belgradeTodayMs = new Date(belgradeTodayStr + 'T00:00:00').getTime();
          const lastVisitMs = new Date(lastVisitStr + 'T00:00:00').getTime();
          const diffDays = Math.floor((belgradeTodayMs - lastVisitMs) / (1000 * 60 * 60 * 24));
          if (diffDays > 1) {
            displayStreak = 0;
          }
        }
        setProfileStreakDays(displayStreak);
      }
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

  // drops earned per calendar day (for progress ring)
  const dropsPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.started_at) continue;
      const key = toLocalDate(new Date(s.started_at));
      map.set(key, (map.get(key) ?? 0) + (s.drops_earned ?? 0));
    }
    return map;
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

    const days: { date: number | null; dateStr: string; hasWorkout: boolean; isToday: boolean; drops: number }[] = [];

    // Empty leading cells
    for (let i = 0; i < startOffset; i++) {
      days.push({ date: null, dateStr: '', hasWorkout: false, isToday: false, drops: 0 });
    }

    const todayStr = toLocalDate(new Date());

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: d,
        dateStr,
        hasWorkout: workoutDates.has(dateStr),
        isToday: dateStr === todayStr,
        drops: dropsPerDay.get(dateStr) ?? 0,
      });
    }

    return days;
  }, [selectedMonth, workoutDates, dropsPerDay]);

  const monthLabel = formatMonthYear(selectedMonth);
  const today = new Date();
  const canGoForward = selectedMonth.getFullYear() < today.getFullYear() ||
    (selectedMonth.getFullYear() === today.getFullYear() && selectedMonth.getMonth() < today.getMonth());

  const prevMonth = () => {
    setSelectedDate(null);
    setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    if (canGoForward) {
      setSelectedDate(null);
      setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const handleDayPress = (dateStr: string, hasWorkout: boolean) => {
    if (!hasWorkout) return;
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    setExpandedSessionId(null);
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

  // ── Group sessions by day (optionally filtered to selectedDate) ──
  const groupedByDay = useMemo(() => {
    const source = selectedDate
      ? filteredSessions.filter(s => toLocalDate(new Date(s.started_at)) === selectedDate)
      : filteredSessions;

    const groups: { dateStr: string; label: string; sessions: SessionRow[] }[] = [];
    const map = new Map<string, SessionRow[]>();
    for (const s of source) {
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
        : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
      groups.push({ dateStr, label, sessions: daySessions });
    }
    return groups;
  }, [filteredSessions, selectedDate]);

  // ── Day summary (when a date is selected) ──
  const daySummary = useMemo(() => {
    if (!selectedDate) return null;
    const daySessions = filteredSessions.filter(s => toLocalDate(new Date(s.started_at)) === selectedDate);
    const drops = daySessions.reduce((acc, s) => acc + (s.drops_earned || 0), 0);
    const duration = daySessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    return { count: daySessions.length, drops, duration };
  }, [filteredSessions, selectedDate]);

  // ── Month-specific longest streak ──
  const monthStreak = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const monthDates = Array.from(workoutDates)
      .filter(d => {
        const parsed = new Date(d + 'T12:00:00');
        return parsed.getFullYear() === year && parsed.getMonth() === month;
      })
      .sort();

    if (monthDates.length === 0) return 0;
    let best = 1;
    let streak = 1;
    for (let i = 1; i < monthDates.length; i++) {
      const prev = new Date(monthDates[i - 1] + 'T12:00:00');
      const curr = new Date(monthDates[i] + 'T12:00:00');
      const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        streak++;
        best = Math.max(best, streak);
      } else {
        streak = 1;
      }
    }
    return best;
  }, [workoutDates, selectedMonth]);

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
      <View style={styles.container}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      <SectionList
        sections={groupedByDay.map(group => ({ title: group.label, dateStr: group.dateStr, data: group.sessions }))}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={branding.primary} />
        }
        ListHeaderComponent={
          <>
            {/* ── Calendar card ── */}
            <Animated.View entering={FadeInDown.delay(80).duration(400)}>
              <View style={[styles.calendarCard, {
                borderTopColor: hexToRgba(branding.primary, 0.30),
                borderLeftColor: hexToRgba(branding.primary, 0.12),
                borderRightColor: 'rgba(255,255,255,0.05)',
                borderBottomColor: 'rgba(255,255,255,0.04)',
              }]}>
                <PlatformBlur intensity={55} tint="dark" style={styles.calendarBlur} androidColor="rgba(12,12,22,0.97)">
                  <LinearGradient
                    colors={[hexToRgba(branding.primary, 0.10), 'rgba(255,255,255,0.02)', 'rgba(12,12,22,0.0)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.monthNav}>
                    <TouchableOpacity onPress={prevMonth} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[styles.monthNavBtn, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
                      <Ionicons name="chevron-back" size={18} color={branding.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.monthLabel, { color: '#FFFFFF' }]}>{monthLabel}</Text>
                    <TouchableOpacity onPress={nextMonth} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={!canGoForward}
                      style={[styles.monthNavBtn, { borderColor: hexToRgba(branding.primary, canGoForward ? 0.18 : 0.06) }]}>
                      <Ionicons name="chevron-forward" size={18} color={canGoForward ? branding.primary : hexToRgba(branding.primary, 0.25)} />
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
                    {calendarDays.map((cell, i) => {
                      const isSelected = cell.dateStr === selectedDate;
                      const cappedPercent = maxDropsPerDay > 0
                        ? Math.min(cell.drops / maxDropsPerDay, 1)
                        : 0;
                      const ringFull = cappedPercent >= 1;
                      const arcColor = ringFull ? '#4CD964' : hexToRgba(branding.primary, 0.85);
                      const trackColor = hexToRgba(ringFull ? '#4CD964' : branding.primary, 0.15);

                      // SVG ring geometry
                      const cellPx = CELL_SIZE;
                      const strokeW = 2.5;
                      const radius = (cellPx - strokeW) / 2;
                      const circ = 2 * Math.PI * radius;
                      const dash = cappedPercent * circ;

                      return (
                        <Pressable
                          key={i}
                          style={styles.calendarCell}
                          onPress={() => cell.date !== null ? handleDayPress(cell.dateStr, cell.hasWorkout) : undefined}
                        >
                          {cell.date !== null ? (
                            <View style={styles.cellWrapper}>
                              {/* Progress ring SVG — only when there are drops */}
                              {cell.drops > 0 && !isSelected && (
                                <Svg
                                  width={cellPx}
                                  height={cellPx}
                                  style={StyleSheet.absoluteFillObject}
                                >
                                  {/* Track */}
                                  <Circle
                                    cx={cellPx / 2}
                                    cy={cellPx / 2}
                                    r={radius}
                                    stroke={trackColor}
                                    strokeWidth={strokeW}
                                    fill="none"
                                  />
                                  {/* Fill arc — starts at top (-90deg = rotate -90) */}
                                  <Circle
                                    cx={cellPx / 2}
                                    cy={cellPx / 2}
                                    r={radius}
                                    stroke={arcColor}
                                    strokeWidth={strokeW}
                                    fill="none"
                                    strokeDasharray={`${dash} ${circ}`}
                                    strokeLinecap="round"
                                    rotation={-90}
                                    origin={`${cellPx / 2}, ${cellPx / 2}`}
                                  />
                                </Svg>
                              )}

                              <View style={[
                                styles.dateCircle,
                                cell.isToday && !isSelected && { borderColor: branding.primary, borderWidth: 1.5 },
                                cell.hasWorkout && !isSelected && { backgroundColor: hexToRgba(branding.primary, 0.18) },
                                isSelected && { backgroundColor: branding.primary },
                              ]}>
                                <Text style={[
                                  styles.dateText,
                                  cell.isToday && !isSelected && { color: branding.primary, ...fontStyles.bodySemiBold },
                                  cell.hasWorkout && !isSelected && { color: '#FFFFFF' },
                                  isSelected && { color: '#000000', ...fontStyles.bodySemiBold },
                                ]}>
                                  {cell.date}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Selected date clear pill */}
                  {selectedDate && (
                    <TouchableOpacity
                      style={[styles.clearDayPill, { borderColor: hexToRgba(branding.primary, 0.35) }]}
                      onPress={() => setSelectedDate(null)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="close-circle" size={14} color={branding.primary} />
                      <Text style={[styles.clearDayLabel, { color: branding.primary }]}>{t('showAllMonth')}</Text>
                    </TouchableOpacity>
                  )}
                </PlatformBlur>
              </View>
            </Animated.View>

            {/* ── Combined streak + month stats card ── */}
            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <View style={[styles.summaryCard, {
                borderTopColor: hexToRgba(branding.primary, 0.28),
                borderLeftColor: hexToRgba(branding.primary, 0.10),
                borderRightColor: 'rgba(255,255,255,0.05)',
                borderBottomColor: 'rgba(255,255,255,0.03)',
              }]}>
                <PlatformBlur intensity={50} tint="dark" style={styles.summaryBlur} androidColor="rgba(12,12,22,0.97)">
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {/* Top row: streak pair */}
                  <View style={styles.summaryTopRow}>
                    {/* Current streak — uses server-authoritative streak_days from profile */}
                    {(() => {
                      const currentStreak = profileStreakDays ?? streakInfo.current;
                      const active = currentStreak > 0;
                      return (
                        <View style={[styles.summaryStreakItem, { borderColor: active ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.07)' }]}>
                          <View style={[styles.summaryStreakIconBg, { backgroundColor: active ? 'rgba(255,107,0,0.15)' : 'rgba(255,255,255,0.05)' }]}>
                            <Ionicons name="flame" size={18} color={active ? '#FF6B00' : 'rgba(255,255,255,0.25)'} />
                          </View>
                          <View style={styles.summaryStreakText}>
                            <Text style={[styles.summaryStreakValue, getNumberStyle(22), { color: active ? '#FF6B00' : 'rgba(255,255,255,0.5)' }]}>
                              {currentStreak === 0 ? '—' : currentStreak}
                            </Text>
                            <Text style={styles.summaryStreakLabel}>{t('currentStreak')}</Text>
                          </View>
                        </View>
                      );
                    })()}
                    <View style={[styles.summaryStreakItem, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                      <View style={[styles.summaryStreakIconBg, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                        <Ionicons name="trophy" size={18} color={branding.primary} />
                      </View>
                      <View style={styles.summaryStreakText}>
                        <Text style={[styles.summaryStreakValue, getNumberStyle(22), { color: branding.primary }]}>
                          {streakInfo.max === 0 ? '—' : streakInfo.max}
                        </Text>
                        <Text style={styles.summaryStreakLabel}>{t('maxStreak')}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Bottom row: stats — switches to day view when a date is selected */}
                  <View style={[styles.summaryBottomRow, { borderTopColor: hexToRgba(branding.primary, 0.08) }]}>
                    {(daySummary ? [
                      { icon: 'barbell' as const,     value: daySummary.count.toString(),                                                label: t('workouts') },
                      { icon: 'water' as const,        value: daySummary.drops === 0 ? '—' : daySummary.drops.toLocaleString(),          label: t('drops') },
                      { icon: 'time-outline' as const, value: formatDuration(daySummary.duration) || '—',                                label: t('total') },
                      { icon: 'calendar-outline' as const, value: fmtDate(selectedDate!, { day: 'numeric', month: 'short' }),            label: t('day') },
                    ] : [
                      { icon: 'barbell' as const,     value: monthStats.workouts.toString(),                                              label: t('workouts') },
                      { icon: 'water' as const,        value: monthStats.totalDrops === 0 ? '—' : monthStats.totalDrops.toLocaleString(), label: t('drops') },
                      { icon: 'time-outline' as const, value: formatDuration(monthStats.totalDuration) || '—',                            label: t('total') },
                      { icon: 'flame' as const,        value: monthStreak === 0 ? '—' : `${monthStreak}d`,                               label: t('monthStreak') },
                    ]).map((s, i) => (
                      <View key={i} style={styles.summaryMonthItem}>
                        {i > 0 && <View style={[styles.summaryMonthDivider, { backgroundColor: hexToRgba(branding.primary, 0.10) }]} />}
                        <Ionicons name={s.icon} size={13} color={daySummary ? hexToRgba(branding.primary, 0.85) : branding.primary} />
                        <Text style={[styles.summaryMonthValue, getNumberStyle(16), { color: '#FFFFFF' }]}>{s.value}</Text>
                        <Text style={styles.summaryMonthLabel}>{s.label}</Text>
                      </View>
                    ))}
                  </View>

                </PlatformBlur>
              </View>
            </Animated.View>
          </>
        }
        ListEmptyComponent={
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={48} color={hexToRgba(branding.primary, 0.3)} />
            <Text style={styles.emptyTitle}>{selectedDate ? t('noWorkoutsThisDay') : t('noWorkoutsThisMonth')}</Text>
            <Text style={styles.emptySubtitle}>{selectedDate ? t('tapDayAgain') : t('scanQrToStart')}</Text>
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
            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setExpandedSessionId(isExpanded ? null : s.id)}
                style={[styles.sessionCard, {
                  borderTopColor: hexToRgba(branding.primary, isExpanded ? 0.40 : 0.22),
                  borderLeftColor: hexToRgba(branding.primary, isExpanded ? 0.18 : 0.10),
                  borderRightColor: 'rgba(255,255,255,0.05)',
                  borderBottomColor: 'rgba(255,255,255,0.03)',
                }]}
              >
                <PlatformBlur intensity={45} tint="dark" style={styles.sessionCardBlur} androidColor="rgba(12,12,22,0.97)">
                  <LinearGradient
                    colors={isExpanded
                      ? [hexToRgba(branding.primary, 0.10), 'rgba(255,255,255,0.02)', 'transparent']
                      : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />

                  {/* Main row */}
                  <View style={styles.sessionCardRow}>
                    <View style={[styles.machineIconCircle, {
                      backgroundColor: hexToRgba(branding.primary, 0.12),
                      borderColor: hexToRgba(branding.primary, 0.20),
                    }]}>
                      <Ionicons name={iconName} size={22} color={branding.primary} />
                    </View>

                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionMachine} numberOfLines={1}>{machineName}</Text>
                      <Text style={styles.sessionDate}>
                        {formatTime(s.started_at)} · {formatDuration(s.duration_seconds)}
                        {gymName ? ` · ${gymName}` : ''}
                      </Text>
                    </View>

                    <View style={styles.sessionStats}>
                      <View style={styles.sessionStatRow}>
                        <Ionicons name="water" size={13} color={branding.primary} />
                        <Text style={[styles.sessionDrops, getNumberStyle(16), { color: branding.primary }]}>
                          {(s.drops_earned || 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.chevronWrap}>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={13}
                          color={hexToRgba('#FFFFFF', 0.35)}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Inline chips: calories + happy hour */}
                  {(() => {
                    const happyHour = metrics?.drop_calc_v2?.happy_hour;
                    const hhActive = happyHour?.active && (happyHour?.multiplier ?? 1) > 1;
                    const hasChips = !!(s.calories || hhActive);
                    if (!hasChips) return null;
                    return (
                      <View style={[styles.sessionDetailRow, { borderTopColor: hexToRgba(branding.primary, 0.07) }]}>
                        {s.calories ? (
                          <View style={[styles.detailChip, { backgroundColor: 'rgba(255,145,0,0.10)', borderColor: 'rgba(255,145,0,0.18)' }]}>
                            <Ionicons name="flame-outline" size={11} color={theme.colors.secondary} />
                            <Text style={[styles.detailChipText, { color: theme.colors.secondary }]}>
                              ~{Math.round(Number(s.calories))} {t('cal')}
                            </Text>
                          </View>
                        ) : null}
                        {hhActive ? (
                          <View style={[styles.detailChip, { backgroundColor: 'rgba(255,215,0,0.12)', borderColor: 'rgba(255,215,0,0.30)' }]}>
                            <Ionicons name="flash" size={11} color="#FFD700" />
                            <Text style={[styles.detailChipText, { color: '#FFD700' }]}>
                              ×{happyHour!.multiplier.toFixed(1)} Happy Hour
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}

                  {/* Expanded metrics grid */}
                  {isExpanded && (
                    <View style={[styles.expandedPanel, { borderTopColor: hexToRgba(branding.primary, 0.09) }]}>
                      <View style={styles.expandedGrid}>
                        {[
                          { icon: 'time-outline' as const,       value: formatDuration(s.duration_seconds),                           label: t('duration'),  color: branding.primary },
                          { icon: 'flame-outline' as const,       value: s.calories ? `${Math.round(Number(s.calories))}` : null,      label: t('kcal'),      color: theme.colors.secondary },
                          metrics?.total_distance && metrics.total_distance > 0
                            ? { icon: 'navigate-outline' as const,
                                value: metrics.total_distance >= 1000
                                  ? `${(metrics.total_distance / 1000).toFixed(1)}`
                                  : `${Math.round(metrics.total_distance)}`,
                                label: metrics.total_distance >= 1000 ? t('km') : 'm',
                                color: branding.primary }
                            : null,
                          metrics?.avg_speed_kmh && metrics.avg_speed_kmh > 0
                            ? { icon: 'speedometer-outline' as const, value: metrics.avg_speed_kmh.toFixed(1), label: 'km/h avg', color: branding.primary }
                            : null,
                          metrics?.max_speed_kmh && metrics.max_speed_kmh > 0
                            ? { icon: 'flash-outline' as const, value: metrics.max_speed_kmh.toFixed(1), label: 'km/h max', color: branding.primary }
                            : null,
                          metrics?.avg_cadence && metrics.avg_cadence > 0
                            ? { icon: 'sync-outline' as const, value: `${Math.round(metrics.avg_cadence)}`, label: `${machineType === 'treadmill' ? 'spm' : 'rpm'} avg`, color: branding.primary }
                            : null,
                          metrics?.avg_power_watts && metrics.avg_power_watts > 0
                            ? { icon: 'pulse-outline' as const, value: `${metrics.avg_power_watts}`, label: 'W avg', color: branding.primary }
                            : null,
                          metrics?.max_power_watts && metrics.max_power_watts > 0
                            ? { icon: 'pulse-outline' as const, value: `${metrics.max_power_watts}`, label: 'W max', color: branding.primary }
                            : null,
                        ].filter(Boolean).map((stat, i) => stat && (
                          <View key={i} style={[styles.expandedStat, {
                            backgroundColor: stat.color === theme.colors.secondary
                              ? 'rgba(255,145,0,0.07)'
                              : hexToRgba(branding.primary, 0.07),
                            borderColor: stat.color === theme.colors.secondary
                              ? 'rgba(255,145,0,0.12)'
                              : hexToRgba(branding.primary, 0.12),
                          }]}>
                            <Ionicons name={stat.icon} size={15} color={stat.color} />
                            <Text style={[styles.expandedStatValue, getNumberStyle(17), { color: '#FFFFFF' }]}>
                              {stat.value ?? '—'}
                            </Text>
                            <Text style={styles.expandedStatLabel}>{stat.label}</Text>
                          </View>
                        ))}
                      </View>

                      {metrics?.ble_protocol && (
                        <View style={styles.protocolRow}>
                          <View style={[styles.protocolBadge, { backgroundColor: hexToRgba(branding.primary, 0.07), borderColor: hexToRgba(branding.primary, 0.12) }]}>
                            <Ionicons name="bluetooth" size={10} color={theme.colors.textTertiary} />
                            <Text style={styles.protocolText}>{metrics.ble_protocol.toUpperCase()}</Text>
                          </View>
                          {metrics.calories_source === 'device' && (
                            <View style={[styles.protocolBadge, { backgroundColor: 'rgba(255,145,0,0.07)', borderColor: 'rgba(255,145,0,0.12)' }]}>
                              <Ionicons name="checkmark-circle" size={10} color={theme.colors.secondary} />
                              <Text style={[styles.protocolText, { color: theme.colors.secondary }]}>Device calories</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </PlatformBlur>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        ListFooterComponent={<View style={{ height: 20 }} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 14 }} />}
      />
    </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },

  // ── Calendar card ──
  calendarCard: {
    borderRadius: 18,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  calendarBlur: {
    padding: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  monthLabel: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  dayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  dayHeaderCell: {
    width: CELL_SIZE,
    alignItems: 'center',
  },
  dayHeaderText: {
    ...fontStyles.bodyMedium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  cellWrapper: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  clearDayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  clearDayLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  daySummaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  daySummaryText: {
    ...fontStyles.body,
    fontSize: 12,
    letterSpacing: 0.2,
    flex: 1,
  },

  // ── Summary card (streak + month stats merged) ──
  summaryCard: {
    borderRadius: 18,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  summaryBlur: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  // Top row: two streak cells side by side
  summaryTopRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    paddingBottom: 12,
  },
  summaryStreakItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  summaryStreakIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryStreakText: {
    flex: 1,
    gap: 2,
  },
  summaryStreakValue: {
    color: '#FFFFFF',
    lineHeight: 26,
  },
  summaryStreakLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.2,
  },
  // Bottom row: 3 month stats
  summaryBottomRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  summaryMonthItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  summaryMonthDivider: {
    position: 'absolute',
    left: 0,
    top: '10%',
    height: '80%',
    width: StyleSheet.hairlineWidth,
  },
  summaryMonthValue: {
    color: '#FFFFFF',
  },
  summaryMonthLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.2,
  },
  summaryHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  summaryHint: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.32)',
    letterSpacing: 0.2,
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

  // ── Day Section Header ──
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  daySectionLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    textTransform: 'capitalize',
    letterSpacing: 0.4,
  },
  daySectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dayGroup: {
    gap: 10,
  },

  // ── Session Cards ──
  sessionCard: {
    borderRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    overflow: 'hidden',
  },
  sessionCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  sessionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  machineIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionInfo: {
    flex: 1,
    gap: 3,
  },
  sessionMachine: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  sessionDate: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.1,
  },
  sessionStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  sessionStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionDrops: {
    ...fontStyles.number,
    fontSize: 16,
  },
  chevronWrap: {
    alignItems: 'flex-end',
  },
  sessionDetailRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  detailChipText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.1,
  },

  // ── Expanded Detail Panel ──
  expandedPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  expandedStatValue: {
    color: '#FFFFFF',
    lineHeight: 20,
  },
  expandedStatLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
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
    borderWidth: 1,
  },
  protocolText: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.4,
  },
});
