'use client';

import { useEffect, useState } from 'react';
import { getGymAnalytics, GymAnalytics } from '@/lib/actions/analytics-actions';
import { MachineHeatmapWidget } from './MachineHeatmapWidget';
import { PopularHoursWidget } from './PopularHoursWidget';
import { TopPerformersWidget } from './TopPerformersWidget';
import { LiveFeedWidget } from './LiveFeedWidget';
import { StatsCard } from '@/components/StatsCard';

interface AnalyticsSectionProps {
  gymId: string;
  pendingRedemptions: number;
}

type TimeFilter = 'today' | '7days' | '30days';

export function AnalyticsSection({ gymId, pendingRedemptions: _pendingRedemptions }: AnalyticsSectionProps) {
  const [analytics, setAnalytics] = useState<GymAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30days');

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        console.log('[AnalyticsSection] Fetching analytics for gymId:', gymId);
        const data = await getGymAnalytics(gymId);
        console.log('[AnalyticsSection] Fetched analytics data:', {
          hasData: !!data,
          machineUsage: data?.machine_usage,
          machineUsageLength: data?.machine_usage?.length || 0,
          hourlyTraffic: data?.hourly_traffic,
          hourlyTrafficLength: data?.hourly_traffic?.length || 0,
          economyStats: data?.economy_stats,
        });
        setAnalytics(data);
      } catch (error) {
        console.error('[AnalyticsSection] Error fetching analytics:', error);
        setAnalytics(null);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [gymId, timeFilter]);

  const getTimeFilterLabel = (filter: TimeFilter) => {
    switch (filter) {
      case 'today':
        return 'Today';
      case '7days':
        return 'Last 7 Days';
      case '30days':
        return 'Last 30 Days';
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-xl p-4">
          <h3 className="text-base font-semibold text-white mb-1">Usage Overview</h3>
          <p className="text-xs text-zinc-500 mb-4">{getTimeFilterLabel(timeFilter)}</p>
          <div className="flex flex-col items-center justify-center min-h-[320px] text-center">
            <p className="text-sm text-zinc-400">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-xl p-4">
          <h3 className="text-base font-semibold text-white mb-1">Usage Overview</h3>
          <p className="text-xs text-zinc-500 mb-4">{getTimeFilterLabel(timeFilter)}</p>
          <div className="flex flex-col items-center justify-center min-h-[320px] text-center">
            <p className="text-sm text-zinc-400 mb-1">No analytics data available</p>
            <p className="text-xs text-zinc-600">Analytics data will appear here once sessions are created</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Time Filter */}
      <div className="flex justify-end">
        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
          className="px-3 py-2 bg-[#0A0A0A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
        >
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>
      </div>

      {/* Middle Section: Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Left Column: Usage Overview (Grid Span 2) */}
        <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#333] rounded-xl p-4 flex flex-col">
          <h3 className="text-base font-semibold text-white mb-1">Usage Overview</h3>
          <p className="text-xs text-[#808080] mb-4">{getTimeFilterLabel(timeFilter)}</p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-6 min-h-[380px]">
              <MachineHeatmapWidget 
                machineUsage={Array.isArray(analytics.machine_usage) ? analytics.machine_usage : []} 
              />
            </div>
            <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-6 min-h-[380px]">
              <PopularHoursWidget 
                hourlyTraffic={Array.isArray(analytics.hourly_traffic) ? analytics.hourly_traffic : []} 
              />
            </div>
          </div>
        </div>

        {/* Right Column: Activity Hub (Grid Span 1) */}
        <div className="lg:col-span-1 flex flex-col h-full">
          <LiveFeedWidget gymId={gymId} />
        </div>
      </div>

      {/* Bottom Row: Economy Stats, Top Performers, Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Economy Stats */}
        <div className="bg-gradient-to-br from-[#0A0A0A] to-[#111] border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-base font-semibold text-white mb-1">Economy Stats</h3>
          <p className="text-xs text-zinc-400 mb-4">Current Month</p>
          <div className="space-y-3">
            <StatsCard
              title="Issued"
              value={analytics.economy_stats.drops_issued.toLocaleString()}
              icon="Droplet"
              accent="cyan"
              priority="secondary"
            />
            <StatsCard
              title="Redeemed"
              value={analytics.economy_stats.drops_redeemed.toLocaleString()}
              icon="ShoppingBag"
              accent="rose"
              priority="secondary"
            />
            <StatsCard
              title="Net Circulation"
              value={(analytics.economy_stats.drops_issued - analytics.economy_stats.drops_redeemed).toLocaleString()}
              icon="BarChart3"
              accent="emerald"
              priority="primary"
            />
          </div>
        </div>

        {/* Top Performers */}
        <TopPerformersWidget gymId={gymId} compact />

        {/* Quick Actions */}
        <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
          <h3 className="text-base font-semibold text-white mb-1">Quick Actions</h3>
          <div className="space-y-2 mt-3">
            <a
              href={`/dashboard/gym/${gymId}/challenges`}
              className="block px-3 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg hover:bg-[#00E5FF]/20 transition-colors text-sm"
            >
              Manage Challenges
            </a>
            <a
              href={`/dashboard/gym/${gymId}/store`}
              className="block px-3 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg hover:bg-[#00E5FF]/20 transition-colors text-sm"
            >
              Manage Store
            </a>
            <a
              href={`/dashboard/gym/${gymId}/branding`}
              className="block px-3 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg hover:bg-[#00E5FF]/20 transition-colors text-sm"
            >
              Update Branding
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
