import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

export interface HappyHourWindow {
  ruleId: string;
  label: string;
  multiplier: number;
  startAt: string;
  endAt: string;
  minutesUntilStart: number;
  isToday: boolean;
}

export interface UpcomingHappyHoursState {
  windows: HappyHourWindow[];
  loading: boolean;
  /** Currently-live window (minutes_until_start ≤ 0 and not past end) */
  liveWindow: HappyHourWindow | null;
}

const EMPTY: UpcomingHappyHoursState = { windows: [], loading: false, liveWindow: null };
const POLL_MS = 60_000;

function parseWindows(raw: unknown): HappyHourWindow[] {
  const obj = raw as { windows?: unknown[] } | null;
  const arr = Array.isArray(obj?.windows) ? obj.windows : [];
  return arr.map((w: any) => ({
    ruleId: w.rule_id,
    label: w.label ?? '',
    multiplier: Number(w.multiplier ?? 1),
    startAt: w.start_at,
    endAt: w.end_at,
    minutesUntilStart: Number(w.minutes_until_start ?? 0),
    isToday: !!w.is_today,
  }));
}

function findLive(windows: HappyHourWindow[]): HappyHourWindow | null {
  const now = new Date();
  return windows.find((w) => {
    const start = new Date(w.startAt);
    const end = new Date(w.endAt);
    return start <= now && end > now;
  }) ?? null;
}

/**
 * Fetches upcoming happy hour windows for a gym.
 * @param gymId  Active gym UUID
 * @param limit  Max windows to fetch (default 2 for home card, 10 for detail page)
 */
export function useUpcomingHappyHours(
  gymId: string | null | undefined,
  limit: number = 2,
): UpcomingHappyHoursState & { refresh: () => void } {
  const [state, setState] = useState<UpcomingHappyHoursState>(EMPTY);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!gymId) {
      setState(EMPTY);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_upcoming_happy_hours', {
        p_gym_id: gymId,
        p_limit: limit,
      });

      if (error) {
        log.warn('[UpcomingHH] RPC error:', error.message);
        return;
      }

      const windows = parseWindows(data);
      const liveWindow = findLive(windows);

      setState({ windows, loading: false, liveWindow });
    } catch (err) {
      log.warn('[UpcomingHH] fetch error:', err);
    }
  }, [gymId, limit]);

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));
    load();
    intervalRef.current = setInterval(load, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return useMemo(() => ({ ...state, refresh: load }), [state, load]);
}
