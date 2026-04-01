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
}

export interface WeekDay {
  dayLabel: string;
  active: boolean;
}

export interface PeriodStats {
  rank: number;
  streak: number;
  sessions: number;
  hours: number;
  totalDrops: number;
}

export interface MyStatsState {
  periodStats: PeriodStats;
  breakdown: DropsBreakdown;
  origin: DropsOrigin;
  weekDays: WeekDay[];
  weekActive: number;
  machines: MachineStats[];
  achievements: Achievements;
  loading: boolean;
}

const EMPTY: MyStatsState = {
  periodStats: { rank: 0, streak: 0, sessions: 0, hours: 0, totalDrops: 0 },
  breakdown: { today: 0, week: 0, month: 0, all: 0 },
  origin: { session: 0, challenge: 0, checkin: 0, bonus: 0 },
  weekDays: [],
  weekActive: 0,
  machines: [],
  achievements: { bestSessionDrops: 0, bestSessionDate: null, bestStreak: 0, happyHoursUsed: 0, challengesCompleted: 0 },
  loading: true,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

// Cache per gymId+period so switching tabs never blanks content
const cache = new Map<string, MyStatsState>();

export function useMyStats(gymId: string | null | undefined) {
  const { session } = useSession();

  // Initialize from cache if available
  const [states, setStates] = useState<Record<StatsPeriod, MyStatsState>>(() => ({
    today: { ...EMPTY, loading: false },
    week:  { ...EMPTY, loading: false },
    month: { ...EMPTY, loading: false },
    all:   { ...EMPTY, loading: false },
  }));

  // For backwards-compat: expose the active period's state
  const [activePeriod, setActivePeriod] = useState<StatsPeriod>('week');
  const state = states[activePeriod];

  const load = useCallback(async (period: StatsPeriod) => {
    if (!session?.user) return;
    setActivePeriod(period);

    const cacheKey = `${gymId ?? 'global'}:${period}`;
    const cached = cache.get(cacheKey);

    // If we have cached data, show it immediately and refresh silently
    if (cached) {
      setStates((prev) => ({ ...prev, [period]: { ...cached, loading: false } }));
    } else {
      // Only show loading spinner on the very first load of this period
      setStates((prev) => ({ ...prev, [period]: { ...prev[period], loading: true } }));
    }
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

      // ── 1. Sessions for the selected period ──
      let sessionsQuery = supabase
        .from('sessions')
        .select('id, duration_seconds, drops_earned, started_at, machine_id, multiplier')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gt('drops_earned', 0);
      if (gymId) sessionsQuery = sessionsQuery.eq('gym_id', gymId);
      if (periodStart) sessionsQuery = sessionsQuery.gte('started_at', periodStart);
      const { data: sessionRows } = await sessionsQuery;

      const sessions = sessionRows ?? [];
      const totalSessions = sessions.length;
      const totalSeconds = sessions.reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
      const totalDropsSessions = sessions.reduce((s, r) => s + (r.drops_earned ?? 0), 0);

      // ── 2. Profile for streak ──
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('streak_days, total_drops, created_at')
        .eq('id', userId)
        .single();
      const streak = profileRow?.streak_days ?? 0;

      // ── 3. Rank (weekly — consistent with leaderboard) ──
      let rank = 0;
      if (gymId) {
        try {
          const { data: lb } = await supabase.rpc('get_leaderboard', {
            p_type: 'gym',
            p_scope_id: gymId,
            p_period: period === 'all' ? 'weekly' : period === 'month' ? 'monthly' : 'weekly',
            p_limit: 200,
            p_newcomer_only: false,
          });
          if (lb && Array.isArray(lb)) {
            const idx = lb.findIndex((e: any) => e.user_id === userId);
            rank = idx >= 0 ? idx + 1 : lb.length + 1;
          }
        } catch { /* non-critical */ }
      }

      // ── 4. Drops breakdown (all 4 periods at once) ──
      const earnedTypes = ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward'];

      const fetchDropsSum = async (from?: string) => {
        let q = supabase
          .from('drops_transactions')
          .select('amount')
          .eq('user_id', userId)
          .gt('amount', 0)
          .in('transaction_type', earnedTypes);
        if (from) q = q.gte('created_at', from);
        if (gymId) q = q.eq('gym_id', gymId);
        const { data } = await q;
        return data?.reduce((s, t) => s + (t.amount ?? 0), 0) ?? 0;
      };

      const [dropsToday, dropsWeek, dropsMonth, dropsAll] = await Promise.all([
        fetchDropsSum(todayISO),
        fetchDropsSum(weekISO),
        fetchDropsSum(monthISO),
        gymId ? fetchDropsSum() : Promise.resolve(profileRow?.total_drops ?? 0),
      ]);

      const periodDrops =
        period === 'today' ? dropsToday
        : period === 'week' ? dropsWeek
        : period === 'month' ? dropsMonth
        : dropsAll;

      // ── 5. Drops origin (for current period) ──
      let originQuery = supabase
        .from('drops_transactions')
        .select('amount, transaction_type')
        .eq('user_id', userId)
        .gt('amount', 0);
      if (gymId) originQuery = originQuery.eq('gym_id', gymId);
      if (periodStart) originQuery = originQuery.gte('created_at', periodStart);
      const { data: originRows } = await originQuery;

      const origin: DropsOrigin = { session: 0, challenge: 0, checkin: 0, bonus: 0 };
      for (const row of originRows ?? []) {
        const t = row.transaction_type;
        const a = row.amount ?? 0;
        if (t === 'session' || t === 'workout') origin.session += a;
        else if (t === 'challenge' || t === 'friend_challenge_reward') origin.challenge += a;
        else if (t === 'checkin') origin.checkin += a;
        else origin.bonus += a;
      }

      // ── 6. This-week day activity ──
      const weekStart = startOfWeek();
      const { data: weekSessions } = await supabase
        .from('sessions')
        .select('started_at')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gt('drops_earned', 0)
        .gte('started_at', weekStart.toISOString());

      const { data: weekCheckins } = await supabase
        .from('gym_checkins')
        .select('checked_in_at')
        .eq('user_id', userId)
        .gte('checked_in_at', weekStart.toISOString());

      const activeDaySet = new Set<number>();
      for (const s of weekSessions ?? []) {
        if (s.started_at) {
          const d = new Date(s.started_at);
          const dow = d.getDay();
          activeDaySet.add(dow === 0 ? 6 : dow - 1);
        }
      }
      for (const c of weekCheckins ?? []) {
        if (c.checked_in_at) {
          const d = new Date(c.checked_in_at);
          const dow = d.getDay();
          activeDaySet.add(dow === 0 ? 6 : dow - 1);
        }
      }

      const todayDow = now.getDay();
      const todayIdx = todayDow === 0 ? 6 : todayDow - 1;
      const weekDays: WeekDay[] = DAY_LABELS.map((label, i) => ({
        dayLabel: label,
        active: activeDaySet.has(i),
      }));

      // ── 7. Machines breakdown ──
      const machineIds = [...new Set(sessions.filter((s) => s.machine_id).map((s) => s.machine_id!))];
      let machines: MachineStats[] = [];
      if (machineIds.length > 0) {
        const { data: machineRows } = await supabase
          .from('machines')
          .select('id, type')
          .in('id', machineIds);

        const machineTypeMap = new Map<string, string>();
        for (const m of machineRows ?? []) machineTypeMap.set(m.id, m.type);

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

      // ── 8. Achievements ──
      const { data: bestSession } = await supabase
        .from('sessions')
        .select('drops_earned, started_at')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gt('drops_earned', 0)
        .order('drops_earned', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Best streak: compute from historical session + checkin dates
      let bestStreak = streak;
      try {
        const { data: allDates } = await supabase
          .from('sessions')
          .select('started_at')
          .eq('user_id', userId)
          .eq('is_active', false)
          .gt('drops_earned', 0)
          .order('started_at', { ascending: true });
        const { data: allCheckins } = await supabase
          .from('gym_checkins')
          .select('checked_in_at')
          .eq('user_id', userId)
          .order('checked_in_at', { ascending: true });

        const dateSet = new Set<string>();
        for (const s of allDates ?? []) {
          if (s.started_at) dateSet.add(new Date(s.started_at).toISOString().slice(0, 10));
        }
        for (const c of allCheckins ?? []) {
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

      // Happy hours used: sessions where raw_metrics.drop_calc_v2.happy_hour.active = true
      const { data: hhSessions } = await supabase
        .from('sessions')
        .select('id, raw_metrics')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gt('drops_earned', 0);
      const happyHoursUsed = (hhSessions ?? []).filter((s) => {
        try {
          const m = s.raw_metrics as any;
          return m?.drop_calc_v2?.happy_hour?.active === true;
        } catch { return false; }
      }).length;

      // Challenges completed
      const { data: completedChallenges } = await supabase
        .from('challenge_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('is_completed', true);
      const challengesCompleted = completedChallenges?.length ?? 0;

      const newState: MyStatsState = {
        periodStats: { rank, streak, sessions: totalSessions, hours: totalHours, totalDrops: periodDrops },
        breakdown: { today: dropsToday, week: dropsWeek, month: dropsMonth, all: dropsAll },
        origin,
        weekDays,
        weekActive: activeDaySet.size,
        machines,
        achievements: {
          bestSessionDrops: bestSession?.drops_earned ?? 0,
          bestSessionDate: bestSession?.started_at ?? null,
          bestStreak,
          happyHoursUsed,
          challengesCompleted,
        },
        loading: false,
      };

      cache.set(cacheKey, newState);
      setStates((prev) => ({ ...prev, [period]: newState }));
    } catch (err) {
      log.error('[useMyStats] Error:', err);
      setStates((prev) => ({ ...prev, [period]: { ...prev[period], loading: false } }));
    }
  }, [session?.user?.id, gymId]);

  return { state, states, load }; // state kept for backwards-compat with other callers
}
