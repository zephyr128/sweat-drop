'use client';

import { useEffect, useState } from 'react';
import { getTopPerformers, TopPerformer } from '@/lib/actions/top-performers-actions';

interface TopPerformersWidgetProps {
  gymId: string;
  compact?: boolean;
}

export function TopPerformersWidget({ gymId }: TopPerformersWidgetProps) {
  const [performers, setPerformers] = useState<TopPerformer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTopPerformers() {
      try {
        const data = await getTopPerformers(gymId);
        setPerformers(data);
      } catch (error) {
        console.error('Error fetching top performers:', error);
        setPerformers([]);
      } finally {
        setLoading(false);
      }
    }

    fetchTopPerformers();
  }, [gymId]);

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
        <h3 className="text-base font-semibold text-white mb-1">Top Performers</h3>
        <p className="text-[#808080] text-sm">Loading...</p>
      </div>
    );
  }

  if (performers.length === 0) {
    return (
      <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
        <h3 className="text-base font-semibold text-white mb-1">Top Performers</h3>
        <p className="text-xs text-[#808080] mb-3">By Drops</p>
        <p className="text-[#808080] text-sm">No performers data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4">
      <h3 className="text-base font-semibold text-white mb-1">Top Performers</h3>
      <p className="text-xs text-[#808080] mb-3">By Drops</p>
      <div className="space-y-2">
        {performers.map((performer, index) => (
          <div
            key={performer.id}
            className="flex items-center gap-2 p-2 bg-[#1A1A1A] rounded-lg border border-[#333] hover:border-[#00E5FF]/30 transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#00B8CC] text-black font-bold text-sm flex-shrink-0">
              {index + 1}
            </div>
            {performer.avatar_url ? (
              <img
                src={performer.avatar_url}
                alt={performer.username}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF] font-bold text-xs flex-shrink-0">
                {performer.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{performer.username}</p>
              <p className="text-xs text-[#808080]">
                {performer.total_drops.toLocaleString()} drops
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
