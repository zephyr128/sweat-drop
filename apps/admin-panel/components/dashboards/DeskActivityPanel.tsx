'use client';

import Link from 'next/link';
import { ArrowRight, QrCode, Gift, Clock, Dumbbell, TimerOff } from 'lucide-react';
import type { DashboardOverview, DeskFeedKind } from '@/lib/actions/dashboard-actions';

interface DeskActivityPanelProps {
  deskFeed: DashboardOverview['deskFeed'];
  pendingPickups: number;
  basePath: string;
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '—';
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'pending' ? 'bg-amber-500' :
    status === 'confirmed' || status === 'completed' ? 'bg-emerald-500' :
    status === 'autofinished' ? 'bg-blue-500' :
    status === 'cancelled' ? 'bg-rose-500' :
    'bg-zinc-500';
  return <span className={`w-1.5 h-1.5 rounded-full ${color} shrink-0`} />;
}

function FeedKindIcon({ kind }: { kind: DeskFeedKind }) {
  switch (kind) {
    case 'checkin':
      return <QrCode className="w-3 h-3 text-cyan-500/40 shrink-0 mt-1" />;
    case 'redemption':
      return <Gift className="w-3 h-3 text-amber-500/40 shrink-0 mt-1" />;
    case 'workout_finished':
      return <Dumbbell className="w-3 h-3 text-emerald-500/40 shrink-0 mt-1" />;
    case 'workout_auto_finished':
      return <TimerOff className="w-3 h-3 text-blue-500/40 shrink-0 mt-1" />;
  }
}

export function DeskActivityPanel({ deskFeed, pendingPickups, basePath }: DeskActivityPanelProps) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden flex flex-col h-full">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#00E5FF]" />
            Activity Feed
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">Check-ins, workouts & redemptions</p>
        </div>
        <Link
          href={`${basePath}/activity`}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-[#00E5FF] transition-colors"
        >
          Open Activity Log
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Pending alert */}
      {pendingPickups > 0 && (
        <div className="mx-5 mb-3">
          <Link
            href={`${basePath}/store?tab=redemptions`}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-colors"
          >
            <Gift className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-amber-300 font-medium">
                {pendingPickups} pending pickup{pendingPickups !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-amber-400/60">Awaiting member collection</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-amber-400/60" />
          </Link>
        </div>
      )}

      {/* Feed (capped to 5 items; full log at /activity) */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1 min-h-0">
        {deskFeed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <QrCode className="w-6 h-6 text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-600">No recent activity</p>
          </div>
        ) : (
          deskFeed.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-900/40 transition-colors"
            >
              <div className="mt-1.5">
                <StatusDot status={item.status} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 leading-snug truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-zinc-600">{relativeTime(item.at)}</span>
                  {item.status === 'pending' && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">pending</span>
                  )}
                  {item.status === 'autofinished' && (
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">auto-finished</span>
                  )}
                </div>
              </div>
              <FeedKindIcon kind={item.kind} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
