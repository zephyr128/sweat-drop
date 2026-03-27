'use client';

import Link from 'next/link';
import { MemberAvatar } from '@/components/MemberAvatar';

interface Performer {
  id: string;
  username: string;
  avatar_url: string | null;
  earnedDrops: number;
}

interface TopPerformersWidgetProps {
  gymId: string;
  performers: Performer[];
}

export function TopPerformersWidget({ gymId, performers }: TopPerformersWidgetProps) {
  if (performers.length === 0) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-0.5">Top Performers</h3>
        <p className="text-[10px] text-zinc-600 mb-3">By drops earned</p>
        <p className="text-xs text-zinc-600 text-center py-4">No performer data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-0.5">Top Performers</h3>
      <p className="text-[10px] text-zinc-600 mb-3">By drops earned</p>
      <div className="space-y-2">
        {performers.map((performer, index) => (
          <Link
            key={performer.id}
            href={`/dashboard/gym/${gymId}/members/${performer.id}`}
            className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/40 border border-[#1A1A1A] hover:border-[#00E5FF]/30 transition-colors"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#00B8CC] text-black font-bold text-xs flex-shrink-0">
              {index + 1}
            </div>
            <MemberAvatar
              avatarUrl={performer.avatar_url}
              username={performer.username}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{performer.username}</p>
              <p className="text-[10px] text-zinc-500">
                {performer.earnedDrops.toLocaleString()} drops earned
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
