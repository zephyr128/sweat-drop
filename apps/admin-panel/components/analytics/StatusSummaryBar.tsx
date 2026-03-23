'use client';

import type { LiveMachineSummary } from '@/lib/actions/machine-analytics-actions';

interface StatusSummaryBarProps {
  summary: LiveMachineSummary;
  isConnected: boolean;
}

const statuses = [
  { key: 'active_now' as const, label: 'Active', color: '#10B981', bg: 'bg-emerald-500/10' },
  { key: 'available' as const, label: 'Available', color: '#3B82F6', bg: 'bg-blue-500/10' },
  { key: 'maintenance' as const, label: 'Maintenance', color: '#F59E0B', bg: 'bg-amber-500/10' },
  { key: 'inactive' as const, label: 'Inactive', color: '#6B7280', bg: 'bg-gray-500/10' },
];

export function StatusSummaryBar({ summary, isConnected }: StatusSummaryBarProps) {
  return (
    <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Status Summary
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span className={`text-xs ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isConnected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statuses.map((s) => (
          <div
            key={s.key}
            className={`${s.bg} rounded-lg p-3 text-center transition-transform`}
          >
            <span
              className="text-3xl font-bold block tabular-nums"
              style={{ color: s.color }}
            >
              {summary[s.key]}
            </span>
            <span className="text-[10px] text-[#808080] uppercase tracking-wider mt-1 block">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
