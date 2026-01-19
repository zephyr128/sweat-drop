'use client';

import { useState, useEffect } from 'react';
import { Activity, DollarSign, Users, TrendingUp } from 'lucide-react';
import { getWorkoutPlansStats } from '@/lib/actions/workout-plan-actions';
import { toast } from 'sonner';

interface PlanStat {
  plan_id: string;
  plan_name: string;
  access_type: string;
  price: number;
  currency: string;
  active_live_sessions: number;
  revenue: number;
}

interface SmartCoachOverviewProps {
  gymId: string;
}

export function SmartCoachOverview({ gymId }: SmartCoachOverviewProps) {
  const [stats, setStats] = useState<PlanStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      setRefreshing(true);
      const result = await getWorkoutPlansStats(gymId);
      
      if (result.success && result.data) {
        setStats(result.data as PlanStat[]);
      } else {
        toast.error(result.error || 'Failed to load statistics');
      }
    } catch (error: any) {
      console.error('[SmartCoachOverview] Error loading stats:', error);
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [gymId]);

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      RSD: 'din',
    };
    const symbol = symbols[currency] || currency;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const totalLiveSessions = stats.reduce((sum, stat) => sum + stat.active_live_sessions, 0);
  const totalRevenue = stats.reduce((sum, stat) => sum + stat.revenue, 0);

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF] mx-auto"></div>
        <p className="text-[#808080] mt-4">Loading statistics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-[#808080] mb-1">Total Plans</p>
              <p className="text-3xl font-bold text-white">{stats.length}</p>
            </div>
            <div className="p-3 bg-[#00E5FF]/10 rounded-lg">
              <Activity className="w-6 h-6 text-[#00E5FF]" />
            </div>
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-[#808080] mb-1">Active Sessions</p>
              <p className="text-3xl font-bold text-white">{totalLiveSessions}</p>
            </div>
            <div className="p-3 bg-[#00E5FF]/10 rounded-lg">
              <Users className="w-6 h-6 text-[#00E5FF]" />
            </div>
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-[#808080] mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-white">
                {stats.length > 0 ? formatCurrency(totalRevenue, stats[0].currency) : '$0.00'}
              </p>
            </div>
            <div className="p-3 bg-[#00E5FF]/10 rounded-lg">
              <DollarSign className="w-6 h-6 text-[#00E5FF]" />
            </div>
          </div>
        </div>
      </div>

      {/* Plans List with Stats */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#1A1A1A] flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">SmartCoach Plans Overview</h2>
            <p className="text-sm text-[#808080] mt-1">Real-time statistics for all workout plans</p>
          </div>
          <button
            onClick={loadStats}
            disabled={refreshing}
            className="px-4 py-2 bg-[#1A1A1A] text-[#00E5FF] rounded-lg hover:bg-[#2A2A2A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <TrendingUp className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {stats.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#808080]">No workout plans found. Create your first plan to see statistics.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1A1A1A]">
                  <th className="text-left p-4 text-sm font-medium text-[#808080]">Plan Name</th>
                  <th className="text-left p-4 text-sm font-medium text-[#808080]">Access Type</th>
                  <th className="text-right p-4 text-sm font-medium text-[#808080]">Price</th>
                  <th className="text-right p-4 text-sm font-medium text-[#808080]">Active Sessions</th>
                  <th className="text-right p-4 text-sm font-medium text-[#808080]">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr
                    key={stat.plan_id}
                    className="border-b border-[#1A1A1A] hover:bg-[#1A1A1A]/50 transition-colors"
                  >
                    <td className="p-4">
                      <p className="font-medium text-white">{stat.plan_name}</p>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          stat.access_type === 'free'
                            ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                            : stat.access_type === 'membership_required'
                            ? 'bg-[#FFA500]/10 text-[#FFA500]'
                            : 'bg-[#4CAF50]/10 text-[#4CAF50]'
                        }`}
                      >
                        {stat.access_type === 'free'
                          ? 'Free'
                          : stat.access_type === 'membership_required'
                          ? 'Membership'
                          : 'Paid'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <p className="text-white">
                        {stat.access_type === 'free'
                          ? 'Free'
                          : formatCurrency(stat.price, stat.currency)}
                      </p>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Users className="w-4 h-4 text-[#808080]" />
                        <p className="text-white font-medium">{stat.active_live_sessions}</p>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DollarSign className="w-4 h-4 text-[#4CAF50]" />
                        <p className="text-white font-medium">{formatCurrency(stat.revenue, stat.currency)}</p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
