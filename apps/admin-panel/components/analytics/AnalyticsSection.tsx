'use client';

import { useEffect, useState } from 'react';
import { getGymAnalytics, GymAnalytics } from '@/lib/actions/analytics-actions';
import { MachineHeatmapWidget } from './MachineHeatmapWidget';
import { PopularHoursWidget } from './PopularHoursWidget';
import { TopPerformersWidget } from './TopPerformersWidget';
import { LiveFeedWidget } from './LiveFeedWidget';

interface AnalyticsSectionProps {
  gymId: string;
}

export function AnalyticsSection({ gymId }: AnalyticsSectionProps) {
  const [analytics, setAnalytics] = useState<GymAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [gymId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <p className="text-[#808080]">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <p className="text-[#808080]">No analytics data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column: Usage Analytics */}
      <div className="space-y-6">
        <MachineHeatmapWidget machineUsage={analytics.machine_usage} />
        <PopularHoursWidget hourlyTraffic={analytics.hourly_traffic} />
        
        {/* Economy Stats Card */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Economy Stats (Current Month)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg">
              <div>
                <p className="text-sm text-[#808080]">Drops Issued</p>
                <p className="text-2xl font-bold text-[#00E5FF]">
                  {analytics.economy_stats.drops_issued.toLocaleString()}
                </p>
              </div>
              <div className="text-4xl">💧</div>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg">
              <div>
                <p className="text-sm text-[#808080]">Drops Redeemed</p>
                <p className="text-2xl font-bold text-[#FF6B6B]">
                  {analytics.economy_stats.drops_redeemed.toLocaleString()}
                </p>
              </div>
              <div className="text-4xl">🛒</div>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg border border-[#00E5FF]/30">
              <div>
                <p className="text-sm text-[#808080]">Net Circulation</p>
                <p className="text-2xl font-bold text-white">
                  {(analytics.economy_stats.drops_issued - analytics.economy_stats.drops_redeemed).toLocaleString()}
                </p>
              </div>
              <div className="text-4xl">📊</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Feed and Top Performers */}
      <div className="space-y-6">
        <LiveFeedWidget gymId={gymId} />
        <TopPerformersWidget gymId={gymId} />
      </div>
    </div>
  );
}
