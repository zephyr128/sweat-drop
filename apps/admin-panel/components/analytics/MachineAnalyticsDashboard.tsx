'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { getMachineAnalytics } from '@/lib/actions/machine-analytics-actions';
import type { MachineAnalyticsData } from '@/lib/actions/machine-analytics-actions';
import { KPICards } from './KPICards';
import { HeatmapGrid } from './HeatmapGrid';
import { TypeZoneBreakdown } from './TypeZoneBreakdown';
import { MachineFleetTable } from './MachineFleetTable';

interface MachineAnalyticsDashboardProps {
  gymId: string;
}

const PERIOD_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-28" />
        ))}
      </div>
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-[400px]" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-48" />
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-48" />
      </div>
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-64" />
    </div>
  );
}

export function MachineAnalyticsDashboard({ gymId }: MachineAnalyticsDashboardProps) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<MachineAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getMachineAnalytics(gymId, days);
    if (result.success && result.data) {
      setData(result.data);
    } else {
      setError(result.error || 'Failed to load analytics');
    }
    setLoading(false);
  }, [gymId, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isEmpty = data && data.kpi.total_sessions === 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            onClick={() => setDays(opt.days)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              days === opt.days
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#1A1A1A] text-[#808080] border border-[#333] hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && <Skeleton />}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && isEmpty && (
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-16 text-center">
          <BarChart3 className="w-12 h-12 text-[#333] mx-auto mb-4" />
          <p className="text-[#808080] text-sm">No machine usage data for this period</p>
          <p className="text-[#555] text-xs mt-1">Sessions will appear once members start using machines</p>
        </div>
      )}

      {!loading && !error && data && !isEmpty && (
        <>
          <KPICards
            kpi={data.kpi}
            peakHour={data.peak_hour}
            busiestMachine={data.busiest_machine}
          />

          <HeatmapGrid data={data.hourly_heatmap} />

          <TypeZoneBreakdown
            typeStats={data.type_stats}
            zoneStats={data.zone_stats}
          />

          <MachineFleetTable machines={data.machine_stats} />
        </>
      )}
    </div>
  );
}
