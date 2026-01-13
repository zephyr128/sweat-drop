'use client';

import { useEffect, useState } from 'react';
import { getGymAnalytics, GymAnalytics } from '@/lib/actions/analytics-actions';
import { MachineHeatmapWidget } from './MachineHeatmapWidget';
import { PopularHoursWidget } from './PopularHoursWidget';
import { TopPerformersWidget } from './TopPerformersWidget';
import { LiveFeedWidget } from './LiveFeedWidget';

interface AnalyticsSectionProps {
  gymId: string;
  pendingRedemptions: number;
}

type TimeFilter = 'today' | '7days' | '30days';

export function AnalyticsSection({ gymId, pendingRedemptions }: AnalyticsSectionProps) {
  const [analytics, setAnalytics] = useState<GymAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30days');

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const data = await getGymAnalytics(gymId);
        setAnalytics(data);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [gymId, timeFilter]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
          <p className="text-[#808080]">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
          <p className="text-[#808080]">No analytics data available</p>
        </div>
      </div>
    );
  }

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
        <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#333] rounded-xl p-4 flex flex-col max-h-[395px]">
          <h3 className="text-base font-semibold text-white mb-1">Usage Overview</h3>
          <p className="text-xs text-[#808080] mb-4">{getTimeFilterLabel(timeFilter)}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start flex-1">
            <MachineHeatmapWidget 
              machineUsage={analytics.machine_usage} 
              timeFilter={timeFilter}
              maxValue={Math.max(
                ...analytics.machine_usage.map(m => m.scan_count),
                ...analytics.hourly_traffic.map(h => h.scan_count),
                1
              )}
            />
            <PopularHoursWidget 
              hourlyTraffic={analytics.hourly_traffic} 
              timeFilter={timeFilter}
              maxValue={Math.max(
                ...analytics.machine_usage.map(m => m.scan_count),
                ...analytics.hourly_traffic.map(h => h.scan_count),
                1
              )}
            />
          </div>
        </div>

        {/* Right Column: Activity Hub (Grid Span 1) */}
        <div className="lg:col-span-1 flex flex-col">
          <LiveFeedWidget gymId={gymId} />
        </div>
      </div>

      {/* Bottom Row: Economy Stats, Top Performers, Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Economy Stats */}
        <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
          <h3 className="text-base font-semibold text-white mb-1">Economy Stats</h3>
          <p className="text-xs text-[#808080] mb-3">Current Month</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#1A1A1A] rounded-lg border border-[#333]">
              <div>
                <p className="text-xs text-[#808080]">Issued</p>
                <p className="text-xl font-bold text-[#00E5FF]">
                  {analytics.economy_stats.drops_issued.toLocaleString()}
                </p>
              </div>
              <div className="text-3xl">💧</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#1A1A1A] rounded-lg border border-[#333]">
              <div>
                <p className="text-xs text-[#808080]">Redeemed</p>
                <p className="text-xl font-bold text-[#FF6B6B]">
                  {analytics.economy_stats.drops_redeemed.toLocaleString()}
                </p>
              </div>
              <div className="text-3xl">🛒</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#1A1A1A] rounded-lg border border-[#00E5FF]/30">
              <div>
                <p className="text-xs text-[#808080]">Net Circulation</p>
                <p className="text-xl font-bold text-white">
                  {(analytics.economy_stats.drops_issued - analytics.economy_stats.drops_redeemed).toLocaleString()}
                </p>
              </div>
              <div className="text-3xl">📊</div>
            </div>
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
