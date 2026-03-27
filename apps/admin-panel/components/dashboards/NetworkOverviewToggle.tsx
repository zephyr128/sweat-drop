'use client';

import { useState } from 'react';
import { getNetworkOverviewStats } from '@/lib/actions/gym-actions';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Pause,
  Users,
  Droplet,
  Dumbbell,
} from 'lucide-react';

interface NetworkOverviewToggleProps {
  ownerId: string;
  currentGymId: string;
}

interface NetworkStats {
  total_gyms: number;
  active_gyms: number;
  suspended_gyms: number;
  total_members: number;
  total_drops_earned: number;
  total_machines: number;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accentBg: string;
  accentBorder: string;
}

function StatCard({ label, value, icon, accentBg, accentBorder }: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-[#0A0A0A] border border-[#1A1A1A] ${accentBorder} border-t-2 p-4 transition-all duration-200 hover:border-zinc-700/60 hover:-translate-y-0.5`}
    >
      <div className={`w-8 h-8 rounded-lg ${accentBg} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <span className="text-2xl font-bold text-white leading-none block">
        {value.toLocaleString()}
      </span>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1 font-medium">{label}</p>
    </div>
  );
}

export function NetworkOverviewToggle({ ownerId, currentGymId: _currentGymId }: NetworkOverviewToggleProps) {
  const [showNetwork, setShowNetwork] = useState(false);
  const [loading, setLoading] = useState(false);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);

  const handleToggle = async () => {
    if (!showNetwork && !networkStats) {
      setLoading(true);
      const result = await getNetworkOverviewStats(ownerId) as {
        success: boolean;
        data?: NetworkStats | null;
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
          className="flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700/60 transition-all text-xs font-medium"
        >
          <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
          View Network Overview
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          Network Overview
        </h2>
        <button
          onClick={handleToggle}
          className="px-3 py-1.5 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-zinc-400 hover:text-white hover:border-zinc-700/60 transition-all text-xs font-medium"
        >
          Close
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" />
        </div>
      ) : networkStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            label="Total Gyms"
            value={networkStats.total_gyms}
            icon={<Building2 className="w-4 h-4 text-blue-400" />}
            accentBg="bg-blue-500/10"
            accentBorder="border-t-blue-500/60"
          />
          <StatCard
            label="Active Gyms"
            value={networkStats.active_gyms}
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            accentBg="bg-emerald-500/10"
            accentBorder="border-t-emerald-500/60"
          />
          <StatCard
            label="Suspended"
            value={networkStats.suspended_gyms}
            icon={<Pause className="w-4 h-4 text-amber-400" />}
            accentBg="bg-amber-500/10"
            accentBorder="border-t-amber-500/60"
          />
          <StatCard
            label="Total Members"
            value={networkStats.total_members}
            icon={<Users className="w-4 h-4 text-cyan-400" />}
            accentBg="bg-cyan-500/10"
            accentBorder="border-t-cyan-500/60"
          />
          <StatCard
            label="Drops Earned"
            value={networkStats.total_drops_earned}
            icon={<Droplet className="w-4 h-4 text-blue-400" />}
            accentBg="bg-blue-500/10"
            accentBorder="border-t-blue-500/60"
          />
          <StatCard
            label="Machines"
            value={networkStats.total_machines}
            icon={<Dumbbell className="w-4 h-4 text-purple-400" />}
            accentBg="bg-purple-500/10"
            accentBorder="border-t-purple-500/60"
          />
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-600 text-xs">
          Failed to load network stats
        </div>
      )}
    </div>
  );
}
