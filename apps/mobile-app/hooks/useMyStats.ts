import { useState, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export type StatsPeriod = 'today' | 'week' | 'month' | 'all';

export interface DropsBreakdown {
  today: number;
  week: number;
  month: number;
  all: number;
}

export interface DropsOrigin {
  session: number;
  challenge: number;
  checkin: number;
  bonus: number;
}

export interface MachineStats {
  type: string;
  sessions: number;
  avgMinutes: number;
}

export interface Achievements {
  bestSessionDrops: number;
  bestSessionDate: string | null;
  bestStreak: number;
  happyHoursUsed: number;
  challengesCompleted: number;
  memberSince: string | null;
}

export interface PeriodAchievements {
  bestSessionDrops: number;
  bestSessionDate: string | null;
  happyHoursUsed: number;
  challengesCompleted: number;
}

export interface WeekDay {
  dayLabel: string;
  active: boolean;
  drops: number;
}

// Shape matching WeeklyActivityChart's DayData — used for all activity viz in My Stats
export interface ChartBarData {
  day: string;     // label shown below bar (Mon, W1, Jan…)
  drops: number;
  isToday: boolean;
}

export interface WeeklyTrend {
  weekLabel: string;
  drops: number;
  sessions: number;
  activeDays: number;
}

export interface TodaySession {
  id: string;
  startedAt: string;
  durationSeconds: number;
  dropsEarned: number;
  machineType: string | null;
}

export interface MonthTrend {
  month: string;
  label: string;
  drops: number;
  sessions: number;
}

export interface PeriodStats {
  rank: number;
  streak: number;
  sessions: number;
  hours: number;
  totalDrops: number;
  activeDays: number;
  totalDaysInPeriod: number;
  avgDropsPerSession: number;
  periodBestStreak: number; // longest consecutive-day streak within this period only
}

export interface MyStatsState {
  periodStats: PeriodStats;
  breakdown: DropsBreakdown;
  origin: DropsOrigin;
  weekDays: WeekDay[];
  weekActive: number;
  weeklyTrend: WeeklyTrend[];
  todaySessions: TodaySession[];
  monthlyTrend: MonthTrend[];
  // Unified bar chart data for WeeklyActivityChart component
  activityChart: ChartBarData[];    // week: 7 bars (days), month: 4-5 bars (weeks), all: 6 bars (months)
  activityChartActive: number;      // count of bars with drops > 0
  machines: MachineStats[];
  achievements: Achievements;
  periodAchievements: PeriodAchievements;
  loading: boolean;
}

const EMPTY_ACHIEVEMENTS: Achievements = {
  bestSessionDrops: 0, bestSessionDate: null, bestStreak: 0,
  happyHoursUsed: 0, challengesCompleted: 0, memberSince: null,
};
const EMPTY_PERIOD_ACHIEVEMENTS: PeriodAchievements = {
  bestSessionDrops: 0, bestSessionDate: null, happyHoursUsed: 0, challengesCompleted: 0,
};

const EMPTY: MyStatsState = {
  periodStats: { rank: 0, streak: 0, sessions: 0, hours: 0, totalDrops: 0, activeDays: 0, totalDaysInPeriod: 1, avgDropsPerSession: 0, periodBestStreak: 0 },
  breakdown: { today: 0, week: 0, month: 0, all: 0 },
  origin: { session: 0, challenge: 0, checkin: 0, bonus: 0 },
  weekDays: [],
  weekActive: 0,
  weeklyTrend: [],
  todaySessions: [],
  monthlyTrend: [],
  activityChart: [],
  activityChartActive: 0,
  machines: [],
  achievements: EMPTY_ACHIEVEMENTS,
  periodAchievements: EMPTY_PERIOD_ACHIEVEMENTS,
  loading: true,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(): Date {
  const d = startOfToday();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}
function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const cache = new Map<string, MyStatsState>();

export function useMyStats(gymId: string | null | undefined) {
  const { session } = useSession();

  const [states, setStates] = useState<Record<StatsPeriod, MyStatsState>>(() => ({
    today: { ...EMPTY, loading: false },
    week:  { ...EMPTY, loading: false },
    month: { ...EMPTY, loading: false },
    all:   { ...EMPTY, loading: false },
  }));

  const [activePeriod, setActivePeriod] = useState<StatsPeriod>('week');
  const state = states[activePeriod];

  const load = useCallback(async (period: StatsPeriod, forceRefresh = false, { updateActive = true } = {}) => {
    if (!session?.user) return;
    if (updateActive) setActivePeriod(period);

    const cacheKey = `${gymId ?? 'global'}:${period}`;
    const cached = cache.get(cacheKey);

    // Return immediately from cache unless explicitly refreshing
    if (cached && !forceRefresh) {
      setStates((prev) => ({ ...prev, [period]: { ...cached, loading: false } }));
      return;
    }

    setStates((prev) => ({ ...prev, [period]: { ...prev[period], loading: true } }));
    const userId = session.user.id;

    try {
      const now = new Date();
      const todayISO = startOfToday().toISOString();
      const weekISO = startOfWeek().toISOString();
      const monthISO = startOfMonth().toISOString();

      let periodStart: string | null = null;
      if (period === 'today') periodStart = todayISO;
      else if (period === 'week') periodStart = weekISO;
      else if (period === 'month') periodStart = monthISO;

      // ── 1. Sessions for the selected period (RPC) ──
      const { data: rpcSessionData } = await supabase.rpc('get_my_sessions', {
        p_gym_id: gymId ?? null,
        p_active_only: false,
        p_since: periodStart ?? null,
        p_limit: 5000,
      });
      const sessionRows = (rpcSessionData ?? []).filter((s: any) => !s.is_active && (s.drops_earned ?? 0) > 0);

      const sessions: any[] = sessionRows ?? [];
      const totalSessions = sessions.length;
      const totalSeconds = sessions.reduce((s: number, r: any) => s + (r.duration_seconds ?? 0), 0);
      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
      const totalDropsSessions = sessions.reduce((s: number, r: any) => s + (r.drops_earned ?? 0), 0);
      const avgDropsPerSession = totalSessions > 0 ? Math.round(totalDropsSessions / totalSessions) : 0;

      // ── 2. Profile ──
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('streak_days, total_drops, created_at')
        .eq('id', userId)
        .single();
      const streak = profileRow?.streak_days ?? 0;
      const memberSince = profileRow?.created_at ?? null;

      // ── 3. Rank ──
      // today  → use weekly rank (no meaningful daily rank exists)
      // week   → weekly
      // month  → monthly
      // all    → all_time
      let rank = 0;
      if (gymId) {
        const rpcPeriod =
          period === 'month' ? 'monthly' :
          period === 'all'   ? 'all_time' :
          'weekly'; // covers both 'today' and 'week'
        try {
          const { data: lb } = await supabase.rpc('get_leaderboard', {
            p_type: 'gym',
            p_scope_id: gymId,
            p_period: rpcPeriod,
            p_limit: 200,
            p_newcomer_only: false,
          });
          if (lb && Array.isArray(lb)) {
            const idx = lb.findIndex((e: any) => e.user_id === userId);
            rank = idx >= 0 ? idx + 1 : 0; // 0 = not ranked (outside top 200)
          }
        } catch { /* non-critical */ }
      }

      // ── 4 + 5. Drops origin + period total — single query, single source of truth ──
      // Using one query for both breakdown and totalDrops guarantees they are always
      // consistent (origin.session + origin.challenge + origin.checkin + origin.bonus === periodDrops).
      // limit(5000) avoids the default PostgREST 1000-row cap for heavy users.
      const earnedTypes = ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward'];

      const { data: rpcOriginData } = await supabase.rpc('get_my_drops', {
        p_gym_id: gymId ?? null,
        p_types: earnedTypes,
        p_since: periodStart ?? null,
        p_limit: 5000,
      });
      const originRows = (rpcOriginData ?? []).filter((d: any) => (d.amount ?? 0) > 0);

      const origin: DropsOrigin = { session: 0, challenge: 0, checkin: 0, bonus: 0 };
      for (const row of originRows ?? []) {
        const t = row.transaction_type;
        const a = row.amount ?? 0;
        if (t === 'session' || t === 'workout') origin.session += a;
        else if (t === 'challenge' || t === 'friend_challenge_reward') origin.challenge += a;
        else if (t === 'checkin') origin.checkin += a;
        else origin.bonus += a;
      }

      // Total for this period = sum of all origin buckets (guaranteed consistent)
      const periodDrops = origin.session + origin.challenge + origin.checkin + origin.bonus;

      // Breakdown by time window — needed for stats.tsx breakdown card & chart
      // We still need today/week/month sums for the non-'all' periods shown in breakdown card.
      // Compute them cheaply from the same originRows (already in memory, no extra DB calls).
      const sumFrom = (from: Date) => {
        const fromMs = from.getTime();
        return (originRows ?? [])
          .filter((r: any) => r.created_at && new Date(r.created_at).getTime() >= fromMs)
          .reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
      };
      const dropsToday = sumFrom(startOfToday());
      const dropsWeek  = sumFrom(startOfWeek());
      const dropsMonth = sumFrom(startOfMonth());
      const dropsAll   = periodDrops;

      // ── 6. Period checkins (for activity viz + activeDays) ──
      const { data: periodCheckinRows } = await supabase.rpc('get_my_checkins', {
        p_gym_id: gymId ?? null,
        p_since: periodStart ?? null,
        p_limit: 5000,
      });

      // Active days (distinct dates with session or checkin)
      const activeDateStrings = new Set<string>();
      for (const s of sessions) {
        if (s.started_at) activeDateStrings.add(new Date(s.started_at).toISOString().slice(0, 10));
      }
      for (const c of periodCheckinRows ?? []) {
        if (c.checked_in_at) activeDateStrings.add(new Date(c.checked_in_at).toISOString().slice(0, 10));
      }
      const activeDays = activeDateStrings.size;

      // Per-period best streak (consecutive active days within this period's sessions/checkins)
      const periodBestStreak = (() => {
        if (activeDateStrings.size === 0) return 0;
        const sorted = [...activeDateStrings].sort();
        let best = 1;
        let cur = 1;
        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1]);
          const curr = new Date(sorted[i]);
          const diff = (curr.getTime() - prev.getTime()) / 86400000;
          if (diff === 1) { cur++; best = Math.max(best, cur); }
          else if (diff > 1) { cur = 1; }
        }
        return best;
      })();

      let totalDaysInPeriod = 1;
      if (period === 'today') totalDaysInPeriod = 1;
      else if (period === 'week') totalDaysInPeriod = 7;
      else if (period === 'month') totalDaysInPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      else {
        const memberDate = memberSince ? new Date(memberSince) : now;
        totalDaysInPeriod = Math.max(1, Math.ceil((now.getTime() - memberDate.getTime()) / 86400000));
      }

      // ── 7. Period-specific visualizations ──

      // Build a per-date map of drops+activity for reuse across all viz
      const dateDropMap = new Map<string, { drops: number; active: boolean }>();
      for (const s of sessions) {
        if (!s.started_at) continue;
        const key = new Date(s.started_at).toISOString().slice(0, 10);
        const existing = dateDropMap.get(key) ?? { drops: 0, active: false };
        existing.drops += s.drops_earned ?? 0;
        existing.active = true;
        dateDropMap.set(key, existing);
      }
      for (const c of periodCheckinRows ?? []) {
        if (!c.checked_in_at) continue;
        const key = new Date(c.checked_in_at).toISOString().slice(0, 10);
        const existing = dateDropMap.get(key) ?? { drops: 0, active: false };
        existing.active = true;
        dateDropMap.set(key, existing);
      }

      // Week dots (week tab only) — still kept for backward compat if needed
      let weekDays: WeekDay[] = [];
      let weekActive = 0;
      if (period === 'week') {
        const weekStart = startOfWeek();
        weekDays = DAY_LABELS.map((label, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          const data = dateDropMap.get(key);
          return { dayLabel: label, active: !!data?.active, drops: data?.drops ?? 0 };
        });
        weekActive = weekDays.filter((d) => d.active).length;
      }

      // ── Unified activity chart data (WeeklyActivityChart format) ──
      // Always built from drops_transactions (originRows) so chart matches the
      // totalDrops hero number and origin breakdown — includes all earn types.
      let activityChart: ChartBarData[] = [];
      let activityChartActive = 0;

      const txRows = originRows ?? [];

      if (period === 'week') {
        // 7 bars: Mon–Sun, each = one day's total earned drops
        const todayStr = startOfToday().toISOString().slice(0, 10);
        const weekStart = startOfWeek();
        const dayDropMap = new Map<string, number>();
        for (const tx of txRows) {
          if (!tx.created_at) continue;
          const key = new Date(tx.created_at).toISOString().slice(0, 10);
          dayDropMap.set(key, (dayDropMap.get(key) ?? 0) + (tx.amount ?? 0));
        }
        activityChart = DAY_LABELS.map((label, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          return { day: label, drops: dayDropMap.get(key) ?? 0, isToday: key === todayStr };
        });
        activityChartActive = activityChart.filter((b) => b.drops > 0).length;

      } else if (period === 'month') {
        // 4–5 bars: W1–W5, each = total earned drops for that week of the month
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const totalWeeks = Math.ceil(daysInMonth / 7);
        const weekBuckets = new Map<number, number>();
        for (const tx of txRows) {
          if (!tx.created_at) continue;
          const d = new Date(tx.created_at);
          // Only include transactions from the current calendar month
          if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
          const weekNum = Math.ceil(d.getDate() / 7);
          weekBuckets.set(weekNum, (weekBuckets.get(weekNum) ?? 0) + (tx.amount ?? 0));
        }
        const todayWeekNum = Math.ceil(now.getDate() / 7);
        activityChart = [];
        for (let w = 1; w <= totalWeeks; w++) {
          activityChart.push({ day: `W${w}`, drops: weekBuckets.get(w) ?? 0, isToday: w === todayWeekNum });
        }
        activityChartActive = activityChart.filter((b) => b.drops > 0).length;

      } else if (period === 'all') {
        // 6 bars: last 6 calendar months, each = total earned drops for that month
        const monthDropMap = new Map<string, number>();
        for (const tx of txRows) {
          if (!tx.created_at) continue;
          const d = new Date(tx.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthDropMap.set(key, (monthDropMap.get(key) ?? 0) + (tx.amount ?? 0));
        }
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        activityChart = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          activityChart.push({ day: MONTH_LABELS[d.getMonth()], drops: monthDropMap.get(key) ?? 0, isToday: key === currentMonthKey });
        }
        activityChartActive = activityChart.filter((b) => b.drops > 0).length;
      }

      // Weekly trend (kept for backward compat)
      let weeklyTrend: WeeklyTrend[] = [];

      // Monthly trend (all tab only — kept for backward compat, uses tx data for consistency)
      let monthlyTrend: MonthTrend[] = [];
      if (period === 'all') {
        const sessionCountMap = new Map<string, number>();
        for (const s of sessions) {
          if (!s.started_at) continue;
          const d = new Date(s.started_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          sessionCountMap.set(key, (sessionCountMap.get(key) ?? 0) + 1);
        }
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          // drops from chart (already tx-based) — reuse activityChart[5-i]
          const chartBar = activityChart[5 - i];
          monthlyTrend.push({ month: key, label: MONTH_LABELS[d.getMonth()], drops: chartBar?.drops ?? 0, sessions: sessionCountMap.get(key) ?? 0 });
        }
      }

      // ── 8. Machines breakdown ──
      // RPC returns machine_type flat; also look up from machines table for sessions missing it
      const machineIds = [...new Set(sessions.filter((s: any) => s.machine_id).map((s: any) => s.machine_id!))];
      let machines: MachineStats[] = [];
      const machineTypeMap = new Map<string, string>();
      // Populate from RPC flat columns first
      for (const s of sessions) {
        if (s.machine_id && s.machine_type) machineTypeMap.set(s.machine_id, s.machine_type);
      }
      // Fallback: fetch any missing machine types from the machines table
      const missingIds = machineIds.filter((id: string) => !machineTypeMap.has(id));
      if (missingIds.length > 0) {
        const { data: machineRows } = await supabase
          .from('machines')
          .select('id, type')
          .in('id', missingIds);
        for (const m of machineRows ?? []) machineTypeMap.set(m.id, m.type);
      }
      if (machineIds.length > 0) {
        const grouped = new Map<string, { count: number; totalMin: number }>();
        for (const s of sessions) {
          if (!s.machine_id) continue;
          const type = machineTypeMap.get(s.machine_id) ?? 'unknown';
          const existing = grouped.get(type) ?? { count: 0, totalMin: 0 };
          existing.count++;
          existing.totalMin += (s.duration_seconds ?? 0) / 60;
          grouped.set(type, existing);
        }
        machines = Array.from(grouped.entries())
          .map(([type, d]) => ({ type, sessions: d.count, avgMinutes: Math.round(d.totalMin / d.count) }))
          .sort((a, b) => b.sessions - a.sessions);
      }

      // Today sessions (today tab only)
      let todaySessions: TodaySession[] = [];
      if (period === 'today') {
        todaySessions = sessions
          .map((s: any) => ({
            id: s.id,
            startedAt: s.started_at!,
            durationSeconds: s.duration_seconds ?? 0,
            dropsEarned: s.drops_earned ?? 0,
            machineType: s.machine_id ? (machineTypeMap.get(s.machine_id) ?? null) : null,
          }))
          .sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      }

      // ── 9. Period achievements ──
      const periodBest = sessions.reduce(
        (best: { drops: number; date: string | null }, s: any) => {
          const drops = s.drops_earned ?? 0;
          return drops > best.drops ? { drops, date: s.started_at ?? null } : best;
        },
        { drops: 0, date: null },
      );

      const periodHappyHours = sessions.filter((s: any) => {
        try {
          const m = s.raw_metrics as any;
          return m?.drop_calc_v2?.happy_hour?.active === true;
        } catch { return false; }
      }).length;

      const { data: rpcChallengeData } = await supabase.rpc('get_my_challenges', {
        p_gym_id: gymId ?? null,
      });
      const periodChallengesCompleted = (rpcChallengeData ?? []).filter((c: any) =>
        c.is_completed && (!periodStart || new Date(c.completed_at) >= new Date(periodStart))
      ).length;

      const periodAchievements: PeriodAchievements = {
        bestSessionDrops: periodBest.drops,
        bestSessionDate: periodBest.date,
        happyHoursUsed: periodHappyHours,
        challengesCompleted: periodChallengesCompleted,
      };

      // ── 10. Lifetime achievements ──
      // When viewing 'all', period data IS lifetime — avoid duplicate queries
      let lifetimeBestDrops: number;
      let lifetimeBestDate: string | null;
      let happyHoursUsed: number;
      let challengesCompleted: number;

      if (period === 'all') {
        lifetimeBestDrops = periodBest.drops;
        lifetimeBestDate = periodBest.date;
        happyHoursUsed = periodHappyHours;
        challengesCompleted = periodChallengesCompleted;
      } else {
        const { data: allSessionsData } = await supabase.rpc('get_my_sessions', {
          p_gym_id: null,
          p_active_only: false,
          p_since: null,
          p_limit: 5000,
        });
        const allCompletedSessions = (allSessionsData ?? []).filter((s: any) => !s.is_active && (s.drops_earned ?? 0) > 0);

        const bestSession = [...allCompletedSessions].sort((a: any, b: any) => (b.drops_earned ?? 0) - (a.drops_earned ?? 0))[0] ?? null;
        lifetimeBestDrops = bestSession?.drops_earned ?? 0;
        lifetimeBestDate = bestSession?.started_at ?? null;

        happyHoursUsed = allCompletedSessions.filter((s: any) => {
          try {
            const m = s.raw_metrics as any;
            return m?.drop_calc_v2?.happy_hour?.active === true;
          } catch { return false; }
        }).length;

        challengesCompleted = (rpcChallengeData ?? []).filter((c: any) => c.is_completed).length;
      }

      // Best streak (always all-time)
      let bestStreak = streak;
      try {
        const [allSessionsForStreak, allCheckinsForStreak] = await Promise.all([
          supabase.rpc('get_my_sessions', {
            p_gym_id: null,
            p_active_only: false,
            p_since: null,
            p_limit: 5000,
          }),
          supabase.rpc('get_my_checkins', {
            p_gym_id: null,
            p_since: null,
            p_limit: 5000,
          }),
        ]);

        const dateSet = new Set<string>();
        for (const s of (allSessionsForStreak.data ?? []).filter((s: any) => !s.is_active && (s.drops_earned ?? 0) > 0)) {
          if (s.started_at) dateSet.add(new Date(s.started_at).toISOString().slice(0, 10));
        }
        for (const c of allCheckinsForStreak.data ?? []) {
          if (c.checked_in_at) dateSet.add(new Date(c.checked_in_at).toISOString().slice(0, 10));
        }
        const sorted = [...dateSet].sort();
        let maxStreak = 0;
        let cur = 1;
        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1]);
          const curr = new Date(sorted[i]);
          const diff = (curr.getTime() - prev.getTime()) / 86400000;
          if (diff === 1) { cur++; }
          else if (diff > 1) { maxStreak = Math.max(maxStreak, cur); cur = 1; }
        }
        maxStreak = Math.max(maxStreak, cur);
        bestStreak = Math.max(maxStreak, streak);
      } catch { /* non-critical */ }

      const newState: MyStatsState = {
        periodStats: {
          rank, streak,
          sessions: totalSessions, hours: totalHours, totalDrops: periodDrops,
          activeDays, totalDaysInPeriod, avgDropsPerSession, periodBestStreak,
        },
        breakdown: { today: dropsToday, week: dropsWeek, month: dropsMonth, all: dropsAll },
        origin,
        weekDays,
        weekActive,
        weeklyTrend,
        todaySessions,
        monthlyTrend,
        activityChart,
        activityChartActive,
        machines,
        achievements: {
          bestSessionDrops: lifetimeBestDrops,
          bestSessionDate: lifetimeBestDate,
          bestStreak,
          happyHoursUsed,
          challengesCompleted,
          memberSince,
        },
        periodAchievements,
        loading: false,
      };

      cache.set(cacheKey, newState);
      setStates((prev) => ({ ...prev, [period]: newState }));
    } catch (err) {
      log.error('[useMyStats] Error:', err);
      setStates((prev) => ({ ...prev, [period]: { ...prev[period], loading: false } }));
    }
  }, [session?.user?.id, gymId]);

  const loadIfNeeded = useCallback((period: StatsPeriod) => {
    const cacheKey = `${gymId ?? 'global'}:${period}`;
    if (!cache.has(cacheKey)) load(period, false, { updateActive: false });
  }, [load, gymId]);

  // Force-refresh current period (used by pull-to-refresh)
  const refresh = useCallback((period: StatsPeriod) => load(period, true), [load]);

  // Invalidate all cache entries for this gymId (e.g. when scope changes)
  const invalidateCache = useCallback(() => {
    const prefix = `${gymId ?? 'global'}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }, [gymId]);

  return { state, states, load, loadIfNeeded, refresh, invalidateCache };
}
