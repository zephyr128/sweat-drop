'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import type { LiveMachine } from '@/lib/actions/machine-analytics-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

export interface MachineCardAction {
  type: 'edit' | 'maintenance' | 'qr' | 'toggle_status' | 'delete' | 'ble' | 'view';
  machineId: string;
}

interface MachineGridProps {
  machines: LiveMachine[];
  fetchedAt: number;
  tick: number;
  gymId: string;
  onAction?: (action: MachineCardAction) => void;
  canEdit?: boolean;
  isSuperAdmin?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  treadmill: '🏃',
  bike: '🚴',
  elliptical: '⭕',
  weight: '🏋️',
  rower: '🚣',
  stepper: '🪜',
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function isStaleHeartbeat(lastHeartbeat: string | null): boolean {
  if (!lastHeartbeat) return true;
  const diff = Date.now() - new Date(lastHeartbeat).getTime();
  return diff > 60_000;
}

export function MachineGrid({ machines, fetchedAt, tick, gymId }: MachineGridProps) {
  const sorted = useMemo(() => {
    return [...machines].sort((a, b) => {
      const order = (m: LiveMachine) => {
        if (m.is_busy) return 0;
        if (!m.is_under_maintenance && m.is_active) return 1;
        if (m.is_under_maintenance) return 2;
        return 3;
      };
      return order(a) - order(b);
    });
  }, [machines]);

  if (sorted.length === 0) {
    return (
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-12 text-center">
        <p className="text-[#808080] text-sm">No machines configured yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Gym Floor
        </h3>
        <span className="text-xs text-[#808080]">{sorted.length} machines</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sorted.map((m) => (
          <MachineCard
            key={m.id}
            machine={m}
            fetchedAt={fetchedAt}
            tick={tick}
            gymId={gymId}
          />
        ))}
      </div>
    </div>
  );
}

function MachineCard({
  machine: m,
  fetchedAt,
  tick,
  gymId,
}: {
  machine: LiveMachine;
  fetchedAt: number;
  tick: number;
  gymId: string;
}) {
  const typeIcon = TYPE_ICONS[m.type?.toLowerCase()] || '⚙️';
  const zoneName = m.zone === 'Unassigned' || !m.zone ? 'Cardio Zone' : m.zone;
  const href = `/dashboard/gym/${gymId}/machines/${m.id}`;

  if (m.is_busy && m.active_session) {
    const elapsed =
      m.active_session.elapsed_seconds +
      Math.floor((Date.now() - fetchedAt) / 1000);
    const stale = isStaleHeartbeat(m.last_heartbeat);
    void tick;

    return (
      <Link href={href} className="block bg-[#0A0A0A] border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-[0_0_20px_rgba(16,185,129,0.08)] hover:shadow-[0_0_24px_rgba(16,185,129,0.15)] transition-all cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-sm font-medium text-white truncate">{m.name}</span>
          </div>
          <span className="text-sm shrink-0">{typeIcon}</span>
        </div>

        {m.current_user && (
          <div className="flex items-center gap-2 mb-3">
            <MemberAvatar
              avatarUrl={m.current_user.avatar_url}
              username={m.current_user.username}
              size="sm"
            />
            <span className="text-xs text-zinc-300 truncate">
              {m.current_user.username}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
          <span className="text-emerald-400 font-mono tabular-nums font-bold">
            ⏱ {formatDuration(elapsed)}
          </span>
          <span className="text-[#808080]">
            🔄 {m.last_rpm && m.last_rpm > 0 ? `${m.last_rpm} RPM` : '-- RPM'}
          </span>
          <span className="text-[#808080]">🔥 {m.active_session.calories} cal</span>
          <span className="text-[#808080]">
            💧 {m.active_session.drops_earned > 0
              ? `${m.active_session.drops_earned} drops`
              : 'earning...'}
          </span>
        </div>

        {stale && (
          <div className="text-[10px] text-amber-400 mb-1">⚠ No signal</div>
        )}

        <div className="flex items-center justify-between mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#1A1A1A] text-[#808080]">
            {zoneName}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400">In Use</span>
        </div>
      </Link>
    );
  }

  if (m.is_under_maintenance) {
    return (
      <Link href={href} className="block bg-[#0A0A0A] border-l-4 border-l-amber-500 rounded-xl p-4 opacity-80 hover:opacity-100 transition-all cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white truncate">{m.name}</span>
          <span className="text-sm shrink-0">{typeIcon}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-3 gap-1">
          <Wrench className="w-5 h-5 text-amber-500" />
          <span className="text-xs text-amber-400">Maintenance</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#1A1A1A] text-[#808080]">
            {zoneName}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400">Maintenance</span>
        </div>
      </Link>
    );
  }

  if (!m.is_active) {
    return (
      <Link href={href} className="block bg-[#0A0A0A]/50 border border-[#1A1A1A] rounded-xl p-4 opacity-40 hover:opacity-70 transition-all cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white truncate">{m.name}</span>
          <span className="text-sm shrink-0">{typeIcon}</span>
        </div>
        <p className="text-xs text-center text-zinc-600 py-3">Inactive</p>
        <div className="flex items-center justify-between mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#1A1A1A] text-zinc-700">
            {zoneName}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/10 text-red-400">Inactive</span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="block bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4 hover:border-[#00E5FF]/30 transition-all cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#00E5FF]/50 shrink-0" />
          <span className="text-sm font-medium text-white truncate">{m.name}</span>
        </div>
        <span className="text-sm shrink-0">{typeIcon}</span>
      </div>
      <p className="text-xs text-center text-zinc-400 py-3">Available</p>
      <div className="flex items-center justify-between mt-1">
        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#1A1A1A] text-[#808080]">
          {zoneName}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#00E5FF]/10 text-[#00E5FF]">Active</span>
      </div>
    </Link>
  );
}
