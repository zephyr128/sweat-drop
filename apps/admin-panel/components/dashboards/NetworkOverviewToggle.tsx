'use client';

import { useState } from 'react';
import { getNetworkOverviewStats } from '@/lib/actions/gym-actions';
import { StatsCard } from '../StatsCard';
import { BarChart3, Dumbbell, CheckCircle2, Pause, Users, Droplet } from 'lucide-react';

interface NetworkOverviewToggleProps {
  ownerId: string;
  currentGymId: string;
}

export function NetworkOverviewToggle({ ownerId, currentGymId: _currentGymId }: NetworkOverviewToggleProps) {
  const [showNetwork, setShowNetwork] = useState(false);
  const [loading, setLoading] = useState(false);
  const [networkStats, setNetworkStats] = useState<{
    total_gyms: number;
    active_gyms: number;
    suspended_gyms: number;
    total_members: number;
    total_drops_earned: number;
    total_machines: number;
  } | null>(null);

  const handleToggle = async () => {
    if (!showNetwork && !networkStats) {
      // Load network stats
      setLoading(true);
      const result = await getNetworkOverviewStats(ownerId) as {
        success: boolean;
        data?: {
          total_gyms: number;
          active_gyms: number;
          suspended_gyms: number;
          total_members: number;
          total_drops_earned: number;
          total_machines: number;
        } | null;
        error?: string;
      };
      if (result.success && result.data) {
        setNetworkStats(result.data);
      }
      setLoading(false);
    }
    setShowNetwork(!showNetwork);
  };

  if (!showNetwork) {
    return (
      <div className="mb-6">
        <button
          onClick={handleToggle}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white hover:bg-[#2A2A2A] transition-colors text-sm font-medium"
        >
          <BarChart3 className="w-4 h-4" strokeWidth={1.5} />
          View Network Overview
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Network Overview</h2>
        <button
          onClick={handleToggle}
          className="px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white hover:bg-[#2A2A2A] transition-colors text-sm font-medium"
        >
          View Single Gym
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF]"></div>
        </div>
      ) : networkStats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatsCard
            title="Total Gyms"
            value={networkStats.total_gyms}
            icon="Building2"
            accent="blue"
            priority="primary"
          />
          <StatsCard
            title="Active Gyms"
            value={networkStats.active_gyms}
            icon="CheckCircle2"
            accent="emerald"
            priority="secondary"
          />
          <StatsCard
            title="Suspended Gyms"
            value={networkStats.suspended_gyms}
            icon="Pause"
            accent="amber"
            priority="secondary"
          />
          <StatsCard
            title="Total Members"
            value={networkStats.total_members}
            icon="Users"
            accent="cyan"
            priority="secondary"
          />
          <StatsCard
            title="Total Drops Earned"
            value={networkStats.total_drops_earned}
            icon="Droplet"
            accent="cyan"
            priority="secondary"
          />
          <StatsCard
            title="Total Machines"
            value={networkStats.total_machines}
            icon="Dumbbell"
            accent="purple"
            priority="secondary"
          />
        </div>
      ) : (
        <div className="text-center py-12 text-[#808080]">
          Failed to load network stats
        </div>
      )}
    </div>
  );
}
