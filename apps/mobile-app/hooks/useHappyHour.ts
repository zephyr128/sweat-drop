import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

export interface HappyHourInfo {
  active: boolean;
  multiplier: number;
  ruleName: string | null;
  startTime: string | null;
  endTime: string | null;
}

const EMPTY: HappyHourInfo = {
  active: false,
  multiplier: 1.0,
  ruleName: null,
  startTime: null,
  endTime: null,
};

const POLL_INTERVAL_MS = 60_000;

/**
 * Checks whether Happy Hour is active for the given gym.
 * Polls every 60s while mounted. Returns EMPTY when no gym.
 * When machineType is provided, the backend filters rules by machine type
 * so the badge only shows when the boost applies to the current machine.
 */
export function useHappyHour(
  gymId: string | null | undefined,
  machineType?: string | null,
) {
  const [info, setInfo] = useState<HappyHourInfo>(EMPTY);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!gymId) {
      setInfo(EMPTY);
      return;
    }
    try {
      const rpcParams: Record<string, string> = { p_gym_id: gymId };
      if (machineType) {
        rpcParams.p_machine_type = machineType;
      }
      const { data, error } = await supabase.rpc('get_active_drop_boost', rpcParams);

      if (error) {
        log.warn('[HappyHour] RPC error:', error.message);
        return;
      }

      const d = data as Record<string, unknown> | null;
      if (d && d.active === true) {
        setInfo({
          active: true,
          multiplier: Number(d.multiplier ?? 1),
          ruleName: (d.rule_name as string) || null,
          startTime: (d.start_time as string) || null,
          endTime: (d.end_time as string) || null,
        });
      } else {
        setInfo(EMPTY);
      }
    } catch (err) {
      log.warn('[HappyHour] fetch error:', err);
    }
  }, [gymId, machineType]);

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch]);

  return info;
}
