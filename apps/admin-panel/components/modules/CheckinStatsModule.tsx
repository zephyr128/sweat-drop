'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Shield, ShieldAlert, Filter } from 'lucide-react';
import { getGymCheckinStats, getGymCheckins } from '@/lib/actions/gym-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

interface Checkin {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  checked_in_at: string;
  drops_earned: number;
  gps_verified: boolean;
  gps_distance_m: number | null;
}

interface CheckinStatsModuleProps {
  gymId: string;
}

function GPSBadge({ verified, distance }: { verified: boolean; distance: number | null }) {
  if (distance === null) return <span className="text-[#555] text-xs">GPS N/A</span>;
  if (verified) return <span className="text-emerald-400 text-xs flex items-center gap-1"><Shield className="w-3 h-3" /> {distance}m</span>;
  return <span className="text-red-400 text-xs flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> {distance}m</span>;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CheckinStatsModule({ gymId }: CheckinStatsModuleProps) {
  const router = useRouter();
  const [stats, setStats] = useState<{ today: number; week: number; total: number } | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnverified, setShowUnverified] = useState(false);

  useEffect(() => {
    async function load() {
      const [statsRes, checkinsRes] = await Promise.all([
        getGymCheckinStats(gymId),
        getGymCheckins(gymId),
      ]);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (checkinsRes.success && checkinsRes.data) setCheckins(checkinsRes.data);
      setLoading(false);
    }
    load();
  }, [gymId]);

  const filteredCheckins = showUnverified
    ? checkins.filter((c) => !c.gps_verified)
    : checkins;

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-[#1A1A1A] rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-20 bg-[#1A1A1A] rounded-lg" />
            <div className="h-20 bg-[#1A1A1A] rounded-lg" />
            <div className="h-20 bg-[#1A1A1A] rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!stats || stats.total === 0) return null;

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <MapPin className="w-5 h-5 text-[#00E5FF]" />
        Check-in Overview
      </h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Today', value: stats.today },
          { label: 'This Week', value: stats.week },
          { label: 'Total', value: stats.total },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#111] border border-[#222] rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-white">{kpi.value}</div>
            <div className="text-xs text-[#808080] mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filter toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#808080]">Last {filteredCheckins.length} check-ins</span>
        <button
          onClick={() => setShowUnverified(!showUnverified)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
            showUnverified
              ? 'bg-red-500/10 text-red-400 border-red-500/30'
              : 'bg-[#1A1A1A] text-[#808080] border-[#333] hover:text-white'
          }`}
        >
          <Filter className="w-3 h-3" />
          {showUnverified ? 'Showing unverified only' : 'Filter unverified GPS'}
        </button>
      </div>

      {/* Table */}
      {filteredCheckins.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#222]">
                <th className="text-left text-xs text-[#808080] font-medium py-2 px-3">User</th>
                <th className="text-left text-xs text-[#808080] font-medium py-2 px-3">Time</th>
                <th className="text-right text-xs text-[#808080] font-medium py-2 px-3">Drops</th>
                <th className="text-center text-xs text-[#808080] font-medium py-2 px-3">GPS Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredCheckins.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/dashboard/gym/${gymId}/members/${c.user_id}`)}
                  className="border-b border-[#111] hover:bg-[#111] transition-colors cursor-pointer"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <MemberAvatar
                        avatarUrl={c.avatar_url}
                        username={c.username}
                        size="sm"
                      />
                      <span className="text-sm text-white truncate max-w-[120px]">{c.username}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-sm text-[#808080]">{formatTime(c.checked_in_at)}</td>
                  <td className="py-3 px-3 text-sm text-right">
                    {c.drops_earned > 0 ? (
                      <span className="text-[#00E5FF] font-medium">+{c.drops_earned}</span>
                    ) : (
                      <span className="text-[#555]">0</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex justify-center">
                      <GPSBadge verified={c.gps_verified} distance={c.gps_distance_m} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#555] text-center py-4">
          {showUnverified ? 'No unverified check-ins found' : 'No check-ins yet'}
        </p>
      )}
    </div>
  );
}
