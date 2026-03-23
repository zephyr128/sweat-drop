'use client';

import { useMemo } from 'react';
import type { LiveMachine } from '@/lib/actions/machine-analytics-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

interface ActiveWorkoutsListProps {
  machines: LiveMachine[];
  fetchedAt: number;
  tick: number;
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

export function ActiveWorkoutsList({ machines, fetchedAt, tick }: ActiveWorkoutsListProps) {
  const active = useMemo(
    () =>
      machines
        .filter((m) => m.is_busy && m.active_session)
        .sort(
          (a, b) =>
            (b.active_session?.elapsed_seconds || 0) -
            (a.active_session?.elapsed_seconds || 0)
        ),
    [machines]
  );

  void tick;

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
      <div className="p-6 pb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Active Workouts
        </h3>
        <span className="text-xs text-[#808080]">
          {active.length} session{active.length !== 1 ? 's' : ''} now
        </span>
      </div>

      {active.length === 0 ? (
        <div className="px-6 pb-6 pt-2">
          <p className="text-sm text-[#808080] text-center py-6">
            No active workouts right now
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0A0A0A]">
              <tr>
                <th className="w-6 px-4 py-2" />
                <th className="px-4 py-2 text-left text-[10px] font-medium text-[#808080] uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-[#808080] uppercase tracking-wider">
                  Machine
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-[#808080] uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-[#808080] uppercase tracking-wider">
                  RPM
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-[#808080] uppercase tracking-wider">
                  Cal
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-[#808080] uppercase tracking-wider">
                  Drops
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]">
              {active.map((m) => {
                const session = m.active_session!;
                const elapsed =
                  session.elapsed_seconds +
                  Math.floor((Date.now() - fetchedAt) / 1000);
                const typeIcon = TYPE_ICONS[m.type?.toLowerCase()] || '⚙️';

                return (
                  <tr key={m.id} className="hover:bg-[#0A0A0A]/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    </td>
                    <td className="px-4 py-2.5">
                      {m.current_user ? (
                        <div className="flex items-center gap-2">
                          <MemberAvatar
                            avatarUrl={m.current_user.avatar_url}
                            username={m.current_user.username}
                            size="sm"
                          />
                          <span className="text-sm text-white truncate max-w-[120px]">
                            {m.current_user.username}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-[#808080]">
                      <span className="mr-1">{typeIcon}</span>
                      {m.name}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-emerald-400 font-mono tabular-nums font-bold">
                      {formatDuration(elapsed)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-[#808080] tabular-nums">
                      {m.last_rpm && m.last_rpm > 0 ? m.last_rpm : '--'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-[#808080] tabular-nums">
                      {session.calories}
                    </td>
                    <td className="px-4 py-2.5 text-sm tabular-nums">
                      {session.drops_earned > 0
                        ? <span className="text-[#808080]">{session.drops_earned}</span>
                        : <span className="text-zinc-600 italic">pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
