'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { getLiveMachineStatus } from '@/lib/actions/machine-analytics-actions';
import type { LiveMachineData, LiveMachine } from '@/lib/actions/machine-analytics-actions';
import { StatusSummaryBar } from './StatusSummaryBar';
import { MachineGrid } from './MachineGrid';
import { ActiveWorkoutsList } from './ActiveWorkoutsList';

interface LiveMachineMonitorProps {
  gymId: string;
}

const POLL_INTERVAL = 15_000;

export function LiveMachineMonitor({ gymId }: LiveMachineMonitorProps) {
  const [data, setData] = useState<LiveMachineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    const result = await getLiveMachineStatus(gymId);
    if (result.success && result.data) {
      setData(result.data);
      setFetchedAt(Date.now());
      setError(null);
    } else {
      setError(result.error || 'Failed to load live status');
    }
    setLoading(false);
  }, [gymId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Tick every second for live timers
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  // Polling fallback — always refetch fresh data
  useEffect(() => {
    pollRef.current = setInterval(() => {
      getLiveMachineStatus(gymId).then((result) => {
        if (result.success && result.data) {
          setData(result.data);
          setFetchedAt(Date.now());
          setError(null);
        }
      });
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [gymId]);

  // Realtime subscriptions
  useEffect(() => {
    const machineChannel = supabase
      .channel(`machines-live-${gymId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'machines',
          filter: `gym_id=eq.${gymId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setData((prev) => {
            if (!prev) return prev;
            const machines = prev.machines.map((m) => {
              if (m.id !== updated.id) return m;
              return {
                ...m,
                is_busy: updated.is_busy as boolean,
                is_active: updated.is_active as boolean,
                is_under_maintenance: (updated.is_under_maintenance ?? false) as boolean,
                last_heartbeat: (updated.last_heartbeat as string) || null,
                last_rpm: (updated.last_rpm as number) || null,
              } satisfies LiveMachine;
            });
            const summary = {
              total_machines: machines.length,
              active_now: machines.filter((m) => m.is_busy).length,
              available: machines.filter(
                (m) => !m.is_busy && m.is_active && !m.is_under_maintenance
              ).length,
              maintenance: machines.filter((m) => m.is_under_maintenance).length,
              inactive: machines.filter((m) => !m.is_active).length,
            };
            return { ...prev, machines, summary };
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    const sessionChannel = supabase
      .channel(`sessions-live-${gymId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `gym_id=eq.${gymId}`,
        },
        () => {
          // Session changes need joined profile data, so do a full refetch
          getLiveMachineStatus(gymId).then((result) => {
            if (result.success && result.data) {
              setData(result.data);
              setFetchedAt(Date.now());
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(machineChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [gymId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl h-28" />
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-64" />
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-48" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <StatusSummaryBar summary={data.summary} isConnected={isConnected} />
      <MachineGrid machines={data.machines} fetchedAt={fetchedAt} tick={tick} />
      <ActiveWorkoutsList machines={data.machines} fetchedAt={fetchedAt} tick={tick} />
    </div>
  );
}
