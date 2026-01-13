'use client';

import { createClient } from '@/lib/supabase-client';
import { useEffect, useState } from 'react';

interface LiveFeedItem {
  id: string;
  type: 'scan' | 'redemption';
  user_name: string;
  description: string;
  timestamp: string;
  drops?: number;
}

interface LiveFeedWidgetProps {
  gymId: string;
}

export function LiveFeedWidget({ gymId }: LiveFeedWidgetProps) {
  const [feedItems, setFeedItems] = useState<LiveFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLiveFeed() {
      try {
        const supabase = createClient();

        // Fetch recent sessions (scans)
        const { data: sessions, error: sessionsError } = await supabase
          .from('sessions')
          .select('id, user_id, drops_earned, created_at')
          .eq('gym_id', gymId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (sessionsError) throw sessionsError;

        // Fetch recent redemptions
        const { data: redemptions, error: redemptionsError } = await supabase
          .from('redemptions')
          .select('id, user_id, drops_spent, created_at, reward_id')
          .eq('gym_id', gymId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (redemptionsError) throw redemptionsError;

        // Get user profiles
        const userIds = [
          ...(sessions?.map((s) => s.user_id) || []),
          ...(redemptions?.map((r) => r.user_id) || []),
        ].filter((id, index, self) => self.indexOf(id) === index);

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);

        // Get reward names
        const rewardIds = redemptions?.map((r) => r.reward_id).filter(Boolean) || [];
        const { data: rewards } = rewardIds.length > 0
          ? await supabase
              .from('rewards')
              .select('id, name')
              .in('id', rewardIds)
          : { data: null };

        // Combine and format
        const items: LiveFeedItem[] = [];

        sessions?.forEach((session) => {
          const profile = profiles?.find((p) => p.id === session.user_id);
          items.push({
            id: session.id,
            type: 'scan',
            user_name: profile?.username || 'Unknown',
            description: 'Started workout session',
            timestamp: session.created_at,
            drops: session.drops_earned,
          });
        });

        redemptions?.forEach((redemption) => {
          const profile = profiles?.find((p) => p.id === redemption.user_id);
          const reward = rewards?.find((r) => r.id === redemption.reward_id);
          items.push({
            id: redemption.id,
            type: 'redemption',
            user_name: profile?.username || 'Unknown',
            description: `Redeemed ${reward?.name || 'reward'}`,
            timestamp: redemption.created_at,
            drops: redemption.drops_spent,
          });
        });

        // Sort by timestamp (most recent first)
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setFeedItems(items.slice(0, 10));
      } catch (error) {
        console.error('Error fetching live feed:', error);
        setFeedItems([]);
      } finally {
        setLoading(false);
      }
    }

    fetchLiveFeed();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchLiveFeed, 30000);
    return () => clearInterval(interval);
  }, [gymId]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Live Feed</h3>
        <p className="text-[#808080]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Live Feed</h3>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {feedItems.length === 0 ? (
          <p className="text-[#808080]">No recent activity</p>
        ) : (
          feedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 bg-[#1A1A1A] rounded-lg border border-[#1A1A1A] hover:border-[#00E5FF]/30 transition-colors"
            >
              <div
                className={`w-2 h-2 rounded-full mt-2 ${
                  item.type === 'scan' ? 'bg-[#00E5FF]' : 'bg-[#FF6B6B]'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">
                  <span className="font-medium">{item.user_name}</span>{' '}
                  <span className="text-[#808080]">{item.description}</span>
                </p>
                {item.drops && (
                  <p className="text-xs text-[#00E5FF] mt-1">
                    {item.type === 'scan' ? '+' : '-'}
                    {item.drops} drops
                  </p>
                )}
                <p className="text-xs text-[#808080] mt-1">{formatTime(item.timestamp)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
