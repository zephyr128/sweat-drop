'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bar } from 'react-chartjs-2';
import { ArrowRight, Cpu, Clock, Zap } from 'lucide-react';
import '@/lib/chart-setup';
import type { DashboardOverview } from '@/lib/actions/dashboard-actions';

interface MachineOpsPanelProps {
  machineOps: DashboardOverview['machineOps'];
  gymId: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  available: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  maintenance: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  offline: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500' },
};

function StatusPill({ label, value, colorKey }: { label: string; value: number; colorKey: string }) {
  const c = STATUS_COLORS[colorKey] || STATUS_COLORS.offline;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${c.bg}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot} ${colorKey === 'active' && value > 0 ? 'animate-pulse' : ''}`} />
      <span className={`text-lg font-bold ${c.text}`}>{value}</span>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function MachineOpsPanel({ machineOps, gymId }: MachineOpsPanelProps) {
  const { liveSummary, usageTrend7d, typeSplit, peakHour } = machineOps;
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const chartData = {
    labels: usageTrend7d.map((d) => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString('en-GB', { weekday: 'short' });
    }),
    datasets: [{
      label: 'Sessions',
      data: usageTrend7d.map((d) => d.sessions),
      backgroundColor: 'rgba(0, 229, 255, 0.3)',
      borderColor: '#00E5FF',
      borderWidth: 1.5,
      borderRadius: 4,
      barPercentage: 0.6,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0A0A0A',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
        padding: 8,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#555', font: { size: 10 } },
      },
      y: {
        grid: { color: '#1A1A1A' },
        ticks: { color: '#555', font: { size: 10 }, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  const hasSessions = usageTrend7d.some((d) => d.sessions > 0);

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#00E5FF]" />
            Machine Operations
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">{liveSummary.total} machines registered</p>
        </div>
        <Link
          href={`/dashboard/gym/${gymId}/machines/analytics`}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-[#00E5FF] transition-colors"
        >
          Machine Hub
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Live status strip */}
      <div className="px-5 pb-4">
        <div className="grid grid-cols-4 gap-2">
          <StatusPill label="In Use" value={liveSummary.active} colorKey="active" />
          <StatusPill label="Ready" value={liveSummary.available} colorKey="available" />
          <StatusPill label="Maint." value={liveSummary.maintenance} colorKey="maintenance" />
          <StatusPill label="Offline" value={liveSummary.offline} colorKey="offline" />
        </div>
      </div>

      <div className="border-t border-[#1A1A1A]" />

      {/* Chart + sidebar info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#1A1A1A]">
        {/* Usage trend chart */}
        <div className="lg:col-span-2 p-5">
          <p className="text-xs text-zinc-500 mb-3">Sessions / day (7d)</p>
          <div className="h-44">
            {isClient && hasSessions ? (
              <Bar data={chartData} options={chartOptions} />
            ) : isClient && !hasSessions ? (
              <div className="flex items-center justify-center h-full border border-dashed border-zinc-800 rounded-lg">
                <p className="text-xs text-zinc-600">No sessions this week</p>
              </div>
            ) : (
              <div className="h-full bg-zinc-800/30 animate-pulse rounded-lg" />
            )}
          </div>
        </div>

        {/* Type split + Peak hour */}
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-zinc-500 mb-2">Machine types</p>
            {typeSplit.length > 0 ? (
              <div className="space-y-1.5">
                {typeSplit.slice(0, 5).map((t) => (
                  <div key={t.type} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-300 capitalize">{t.type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00E5FF]/60 rounded-full"
                          style={{ width: `${t.sharePct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-600 w-8 text-right">{t.sharePct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No machines</p>
            )}
          </div>

          {peakHour && (
            <div className="pt-2 border-t border-[#1A1A1A]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Peak hour</p>
                  <p className="text-sm text-white font-semibold">
                    {String(peakHour.hour).padStart(2, '0')}:00
                    <span className="text-zinc-500 font-normal ml-1">({peakHour.sessions} sessions)</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {liveSummary.active > 0 && (
            <div className="pt-2 border-t border-[#1A1A1A]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Live now</p>
                  <p className="text-sm text-emerald-400 font-semibold">
                    {liveSummary.active} machine{liveSummary.active !== 1 ? 's' : ''} in use
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
