'use client';

import { createClient } from '@/lib/supabase-client';
import { useEffect, useState } from 'react';

interface TopPerformer {
  id: string;
  username: string;
  avatar_url: string | null;
  total_drops: number;
}

interface TopPerformersWidgetProps {
  gymId: string;
}

export function TopPerformersWidget({ gymId }: TopPerformersWidgetProps) {
  const [performers, setPerformers] = useState<TopPerformer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTopPerformers() {
      try {
        const supabase = createClient();
        
        // Get top 3 users by total_drops for this gym
        const { data: memberships, error } = await supabase
          .from('gym_memberships')
          .select('user_id, local_drops_balance')
          .eq('gym_id', gymId)
          .order('local_drops_balance', { ascending: false })
          .limit(3);

        if (error) throw error;

        if (!memberships || memberships.length === 0) {
          setPerformers([]);
          setLoading(false);
          return;
        }

        // Get user profiles
        const userIds = memberships.map((m) => m.user_id);
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, total_drops')
          .in('id', userIds);

        if (profileError) throw profileError;

        // Combine data and sort by local_drops_balance
        const combined = memberships
          .map((membership) => {
            const profile = profiles?.find((p) => p.id === membership.user_id);
            if (!profile) return null;
            return {
              id: profile.id,
              username: profile.username,
              avatar_url: profile.avatar_url,
              total_drops: membership.local_drops_balance || 0,
            };
          })
          .filter((p): p is TopPerformer => p !== null)
          .sort((a, b) => b.total_drops - a.total_drops);

        setPerformers(combined);
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
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Top Performers</h3>
        <p className="text-[#808080]">Loading...</p>
      </div>
    );
  }

  if (performers.length === 0) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Top Performers</h3>
        <p className="text-[#808080]">No performers data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Top Performers</h3>
      <div className="space-y-4">
        {performers.map((performer, index) => (
          <div
            key={performer.id}
            className="flex items-center gap-4 p-4 bg-[#1A1A1A] rounded-lg border border-[#1A1A1A] hover:border-[#00E5FF]/30 transition-colors"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#00B8CC] text-black font-bold text-lg">
              {index + 1}
            </div>
            {performer.avatar_url ? (
              <img
                src={performer.avatar_url}
                alt={performer.username}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF] font-bold">
                {performer.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-white font-medium">{performer.username}</p>
              <p className="text-sm text-[#808080]">
                {performer.total_drops.toLocaleString()} drops
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
