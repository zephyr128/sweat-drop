'use client';

import { useState, useMemo } from 'react';

interface MachineStat {
  id: string;
  name: string;
  type: string;
  zone: string | null;
  is_active: boolean;
  is_busy: boolean;
  is_under_maintenance: boolean;
  sessions: number;
  unique_users: number;
  total_drops: number;
  avg_duration_min: number;
  total_hours: number;
  utilization_pct: number;
  sparkline: number[];
}

interface MachineFleetTableProps {
  machines: MachineStat[];
}

type SortKey = 'name' | 'sessions' | 'avg_duration_min' | 'utilization_pct' | 'unique_users';
type SortDir = 'asc' | 'desc';

const TYPE_ICONS: Record<string, string> = {
  treadmill: '🏃',
  bike: '🚴',
  elliptical: '⭕',
  weight: '🏋️',
  rower: '🚣',
  stepper: '🪜',
};

function StatusDot({ machine }: { machine: MachineStat }) {
  if (machine.is_under_maintenance) {
    return <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" title="Maintenance" />;
  }
  if (machine.is_busy) {
    return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block animate-pulse" title="Busy" />;
  }
  if (!machine.is_active) {
    return <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 inline-block" title="Inactive" />;
  }
  return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" title="Active" />;
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const barWidth = 4;
  const gap = 2;
  const height = 16;
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      {data.map((val, i) => {
        const barHeight = Math.max((val / max) * height, 1);
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={val > 0 ? '#00E5FF' : '#333'}
          />
        );
      })}
    </svg>
  );
}

export function MachineFleetTable({ machines }: MachineFleetTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('sessions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const types = useMemo(() => {
    const set = new Set(machines.map((m) => m.type));
    return Array.from(set).sort();
  }, [machines]);

  const sorted = useMemo(() => {
    const list = typeFilter
      ? machines.filter((m) => m.type === typeFilter)
      : [...machines];

    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av) || 0;
      const bn = Number(bv) || 0;
      return sortDir === 'asc' ? an - bn : bn - an;
    });

    return list;
  }, [machines, sortKey, sortDir, typeFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
        onClick={() => toggleSort(field)}
      >
        {label}
        {active && (
          <span className="ml-1 text-[#00E5FF]">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </th>
    );
  }

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
      <div className="p-6 pb-3 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Machine Fleet
        </h3>

        {/* Type filter pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !typeFilter
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#0A0A0A] text-[#808080] border border-[#333] hover:text-white'
            }`}
          >
            All
          </button>
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                typeFilter === type
                  ? 'bg-[#00E5FF] text-black'
                  : 'bg-[#0A0A0A] text-[#808080] border border-[#333] hover:text-white'
              }`}
            >
              {TYPE_ICONS[type.toLowerCase()] || '⚙️'} {type}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#0A0A0A]">
            <tr>
              <th className="w-8 px-4 py-3" />
              <SortHeader label="Machine" field="name" />
              <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase tracking-wider">
                Zone
              </th>
              <SortHeader label="Sessions" field="sessions" />
              <SortHeader label="Users" field="unique_users" />
              <SortHeader label="Avg Min" field="avg_duration_min" />
              <SortHeader label="Util %" field="utilization_pct" />
              <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase tracking-wider">
                7d trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2A2A]">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[#808080] text-sm">
                  No machines found
                </td>
              </tr>
            ) : (
              sorted.map((m) => (
                <tr key={m.id} className="hover:bg-[#0A0A0A]/60 transition-colors">
                  <td className="px-4 py-3">
                    <StatusDot machine={m} />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-white">{m.name}</td>
                  <td className="px-4 py-3 text-sm text-[#808080] capitalize">
                    <span className="mr-1">{TYPE_ICONS[m.type.toLowerCase()] || '⚙️'}</span>
                    {m.type}
                  </td>
                  <td className="px-4 py-3">
                    {m.zone ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#0A0A0A] text-[#808080] border border-[#333]">
                        {m.zone === 'Unassigned' ? 'Cardio Zone' : m.zone}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#0A0A0A] text-[#808080] border border-[#333]">Cardio Zone</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-white tabular-nums">
                    {m.sessions}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#808080] tabular-nums">
                    {m.unique_users}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#808080] tabular-nums">
                    {m.avg_duration_min}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#0A0A0A] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(m.utilization_pct, 100)}%`,
                            backgroundColor:
                              m.utilization_pct >= 75
                                ? '#00E5FF'
                                : m.utilization_pct >= 40
                                ? '#FF9100'
                                : '#808080',
                          }}
                        />
                      </div>
                      <span className="text-xs text-[#808080] tabular-nums min-w-[32px]">
                        {m.utilization_pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Sparkline data={m.sparkline || []} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-[#2A2A2A] flex items-center gap-4 text-[10px] text-[#808080]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Active
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Busy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Maintenance
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" /> Inactive
        </span>
      </div>
    </div>
  );
}
