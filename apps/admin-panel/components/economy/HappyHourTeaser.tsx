'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Zap, ChevronRight, Clock } from 'lucide-react';
import {
  getActiveBoost,
  getSchedulePreview,
  type ActiveBoostStatus,
  type ScheduleWindow,
} from '@/lib/actions/happy-hour-actions';

interface HappyHourTeaserProps {
  gymId: string;
}

export function HappyHourTeaser({ gymId }: HappyHourTeaserProps) {
  const [boost, setBoost] = useState<ActiveBoostStatus | null>(null);
  const [nextWindow, setNextWindow] = useState<ScheduleWindow | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchStatus = useCallback(async () => {
    const [boostRes, scheduleRes] = await Promise.all([
      getActiveBoost(gymId),
      getSchedulePreview(gymId, 2),
    ]);
    if (boostRes.success && boostRes.data) setBoost(boostRes.data);
    if (scheduleRes.success && scheduleRes.data) {
      const upcoming = scheduleRes.data.find((w) => !w.is_past);
      setNextWindow(upcoming ?? null);
    }
    setLoaded(true);
  }, [gymId]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!loaded) return null;

  const isLive = boost?.active;
  const economyUrl = `/dashboard/gym/${gymId}/economy#happy-hour`;

  if (!isLive && !nextWindow) return null;

  return (
    <Link
      href={economyUrl}
      className="group flex items-center gap-2.5 px-3.5 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl hover:border-amber-500/30 transition-colors"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
        isLive ? 'bg-amber-500/20' : 'bg-zinc-800'
      }`}>
        <Zap className={`w-3.5 h-3.5 ${isLive ? 'text-amber-400' : 'text-zinc-500'}`} />
      </div>

      {isLive ? (
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          <span className="text-xs font-bold text-amber-400">Happy Hour Live</span>
          <span className="text-[10px] text-amber-400/70 font-semibold">×{boost!.multiplier}</span>
        </div>
      ) : nextWindow ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-400">
            Happy Hour
          </span>
          <span className="text-xs text-zinc-300 font-medium">
            {nextWindow.day_name} {formatTime(nextWindow.start_time)}
          </span>
        </div>
      ) : null}

      <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 ml-auto shrink-0 transition-colors" />
    </Link>
  );
}

function formatTime(t: string) {
  return t.slice(0, 5);
}
