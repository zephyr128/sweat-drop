'use client';

import { useEffect, useState } from 'react';
import { getLiveFeed, LiveFeedItem } from '@/lib/actions/live-feed-actions';

interface LiveFeedWidgetProps {
  gymId: string;
}

export function LiveFeedWidget({ gymId }: LiveFeedWidgetProps) {
  const [feedItems, setFeedItems] = useState<LiveFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLiveFeed() {
      try {
        const items = await getLiveFeed(gymId);
        setFeedItems(items);
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
      <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4 flex flex-col h-full">
        <div className="flex-shrink-0 mb-3">
          <h3 className="text-base font-semibold text-white mb-1">Activity Hub</h3>
          <p className="text-xs text-[#808080]">Recent Activity</p>
        </div>
        <p className="text-[#808080] text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#333] rounded-xl p-4 flex flex-col h-full">
      <div className="flex-shrink-0 mb-3">
        <h3 className="text-base font-semibold text-white mb-1">Activity Hub</h3>
        <p className="text-xs text-[#808080]">Recent Activity</p>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1 custom-scrollbar">
        {feedItems.length === 0 ? (
          <p className="text-[#808080] text-sm">No recent activity</p>
        ) : (
          feedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 p-2 bg-[#1A1A1A] rounded-lg border border-[#333] hover:border-[#00E5FF]/30 transition-colors flex-shrink-0"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                  item.type === 'scan' ? 'bg-[#00E5FF]' : 'bg-[#FF6B6B]'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs leading-tight">
                  <span className="font-medium">{item.user_name}</span>{' '}
                  <span className="text-[#808080]">{item.description}</span>
                </p>
                {item.drops && (
                  <p className="text-xs text-[#00E5FF] mt-0.5">
                    {item.type === 'scan' ? '+' : '-'}
                    {item.drops} drops
                  </p>
                )}
                <p className="text-xs text-[#808080] mt-0.5">{formatTime(item.timestamp)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
