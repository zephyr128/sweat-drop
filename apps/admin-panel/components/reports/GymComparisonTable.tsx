'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown } from 'lucide-react';
import type { GymBreakdownRow } from './PlatformKPIs';

interface GymComparisonTableProps {
  data: GymBreakdownRow[];
}

type SortKey = 'gym_name' | 'registered_members' | 'sessions_count' | 'active_members' | 'drops_earned' | 'redemptions_count';

export function GymComparisonTable({ data }: GymComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('sessions_count');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (!data || data.length === 0) {
    return (
      <section>
        <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Per Gym Breakdown</h3>
        <div className="border-t border-zinc-800 pt-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 text-center text-zinc-500">
            No gym data available
          </div>
        </div>
      </section>
    );
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortHeader({ label, field, align }: { label: string; field: SortKey; align?: string }) {
    return (
      <th
        className={`px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium cursor-pointer select-none hover:text-zinc-300 transition-colors ${align || ''}`}
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={`w-3 h-3 ${sortKey === field ? 'text-[#00E5FF]' : ''}`} />
        </span>
      </th>
    );
  }

  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Per Gym Breakdown</h3>
      <div className="border-t border-zinc-800 pt-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <SortHeader label="Gym" field="gym_name" />
                  <SortHeader label="Members" field="registered_members" align="text-right" />
                  <SortHeader label="Sessions" field="sessions_count" align="text-right" />
                  <SortHeader label="MAU" field="active_members" align="text-right" />
                  <SortHeader label="Drops Earned" field="drops_earned" align="text-right" />
                  <SortHeader label="Redemptions" field="redemptions_count" align="text-right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((g) => (
                  <tr key={g.gym_id} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/gym/${g.gym_id}/reports`}
                        className="text-sm text-white hover:text-[#00E5FF] transition-colors"
                      >
                        {g.gym_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{g.registered_members}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{g.sessions_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-[#00E5FF] text-right tabular-nums">{g.active_members}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{g.drops_earned.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{g.redemptions_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
