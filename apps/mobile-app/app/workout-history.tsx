import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  drops_earned: number;
  calories: number | null;
  multiplier: number | null;
  machines: { name: string; type: string } | null;
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
          machines ( name, type )
        `)
        .eq('user_id', session.user.id)
        .eq('is_active', false)
        .order('started_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[WorkoutHistory] Error loading sessions:', error);
        return;
      }

      setSessions((data as unknown as SessionRow[]) || []);
    } catch (err) {
      console.error('[WorkoutHistory] Error:', err);
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
  const workoutDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.started_at) {
        set.add(new Date(s.started_at).toISOString().split('T')[0]);
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

    const todayStr = new Date().toISOString().split('T')[0];

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
      const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const [dateStr, daySessions] of map) {
      const d = new Date(dateStr + 'T12:00:00');
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = dateStr === yesterday.toISOString().split('T')[0];
      const label = isToday
        ? t('today')
        : isYesterday
        ? t('yesterday')
        : d.toLocaleDateString(i18n.language === 'sr' ? 'sr-RS' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
      groups.push({ dateStr, label, sessions: daySessions });
    }
    return groups;
  }, [filteredSessions]);

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={branding.primary} />
        }
      >
        {/* ═══════════════════════════════════════════ */}
        {/* CALENDAR SECTION                            */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.calendarCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.calendarBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {/* Month Navigation */}
              <View style={styles.monthNav}>
                <TouchableOpacity onPress={prevMonth} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={24} color={branding.primary} />
                </TouchableOpacity>
                <Text style={[styles.monthLabel, { color: branding.primary }]}>{monthLabel}</Text>
                <TouchableOpacity onPress={nextMonth} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={!canGoForward}>
                  <Ionicons name="chevron-forward" size={24} color={canGoForward ? branding.primary : hexToRgba(branding.primary, 0.3)} />
                </TouchableOpacity>
              </View>

              {/* Day-of-week headers */}
              <View style={styles.dayHeaders}>
                {DAYS_OF_WEEK.map(day => (
                  <View key={day} style={styles.dayHeaderCell}>
                    <Text style={styles.dayHeaderText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar Grid */}
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
                          cell.isToday && { color: branding.primary, fontWeight: '700' },
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

        {/* ═══════════════════════════════════════════ */}
        {/* MONTH STATS                                 */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
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

        {/* ═══════════════════════════════════════════ */}
        {/* SESSION CARDS                               */}
        {/* ═══════════════════════════════════════════ */}
        {filteredSessions.length === 0 ? (
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={48} color={hexToRgba(branding.primary, 0.3)} />
            <Text style={styles.emptyTitle}>{t('noWorkoutsThisMonth')}</Text>
            <Text style={styles.emptySubtitle}>{t('scanQrToStart')}</Text>
          </Animated.View>
        ) : (
          <View style={styles.sessionsList}>
            {groupedByDay.map((group, groupIdx) => (
              <View key={group.dateStr}>
                {/* Day section header */}
                <Animated.View entering={FadeInDown.delay(300 + groupIdx * 80).duration(400)}>
                  <View style={styles.daySectionHeader}>
                    <Text style={[styles.daySectionLabel, { color: branding.primary }]}>
                      {group.label}
                    </Text>
                    <View style={[styles.daySectionLine, { backgroundColor: hexToRgba(branding.primary, 0.15) }]} />
                  </View>
                </Animated.View>

                {group.sessions.map((s, index) => {
                  const machineType = s.machines?.type || 'treadmill';
                  const machineName = s.machines?.name || t('unknownMachine');
                  const iconName = MACHINE_ICONS[machineType] || 'fitness-outline';

                  return (
                    <Animated.View
                      key={s.id}
                      entering={FadeInDown.delay(350 + groupIdx * 80 + index * 60).duration(400)}
                    >
                      <View style={[styles.sessionCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
                        <BlurView intensity={40} tint="dark" style={[styles.sessionCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                          <View style={styles.sessionCardRow}>
                            {/* Machine Icon */}
                            <View style={[styles.machineIconCircle, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                              <Ionicons name={iconName} size={24} color={branding.primary} />
                            </View>

                            {/* Info */}
                            <View style={styles.sessionInfo}>
                              <Text style={styles.sessionMachine} numberOfLines={1}>{machineName}</Text>
                              <Text style={styles.sessionDate}>{formatTime(s.started_at)} • {formatDuration(s.duration_seconds)}</Text>
                            </View>

                            {/* Stats */}
                            <View style={styles.sessionStats}>
                              <View style={styles.sessionStatRow}>
                                <Ionicons name="water" size={14} color={branding.primary} />
                                <Text style={[styles.sessionDrops, getNumberStyle(16), { color: branding.primary }]}>
                                  {s.drops_earned || 0}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Bottom detail row */}
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
                        </BlurView>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
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
    flex: 1,
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
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
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
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
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    fontWeight: theme.typography.fontWeight.medium,
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
    fontWeight: '700',
  },
  statPillLabel: {
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
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textTertiary,
  },

  // ── Day Section ──
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  daySectionLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  daySectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },

  // ── Session Cards ──
  sessionsList: {
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
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  sessionDate: {
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
    fontWeight: '700',
  },
  sessionDuration: {
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
    fontSize: 11,
    fontWeight: '600',
  },
});
