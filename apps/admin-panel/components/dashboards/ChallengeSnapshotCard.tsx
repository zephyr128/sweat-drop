'use client';

import Link from 'next/link';
import { Target, Trophy, ArrowRight } from 'lucide-react';
import type { DashboardOverview } from '@/lib/actions/dashboard-types';

interface ChallengeSnapshotCardProps {
  snapshot: DashboardOverview['challengeSnapshot'];
  basePath: string;
}

export function ChallengeSnapshotCard({ snapshot, basePath }: ChallengeSnapshotCardProps) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-400" />
          Challenges
        </h3>
        <Link
          href={`${basePath}/challenges`}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-[#00E5FF] transition-colors"
        >
          Manage
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {snapshot.active > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-white">{snapshot.active}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Active</p>
            </div>
            {snapshot.completionRatePct > 0 && (
              <div className="pl-4 border-l border-[#1A1A1A]">
                <p className="text-2xl font-bold text-emerald-400">{snapshot.completionRatePct}%</p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Completion</p>
              </div>
            )}
          </div>

          {snapshot.mostPopular && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-xs text-zinc-400 truncate">
                Most popular: <span className="text-white font-medium">{snapshot.mostPopular}</span>
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-xs text-zinc-600 mb-2">No active challenges</p>
          <Link
            href={`${basePath}/challenges`}
            className="inline-flex items-center gap-1.5 text-xs text-[#00E5FF] hover:text-[#00B8CC] transition-colors"
          >
            Create one
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
