'use client';

import { Users, UserX, Flame } from 'lucide-react';
import type { TopMember } from './EngagementKPIs';

interface MembersReportSectionProps {
  registered: number;
  active: number;
  inactive14d: number;
  avgStreak: number;
  topMembers: TopMember[];
}

function isImageUrl(val: string | null | undefined): boolean {
  if (!val) return false;
  return val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/');
}

function MemberAvatar({ avatar, username, size = 28 }: { avatar: string | null; username: string; size?: number }) {
  if (isImageUrl(avatar)) {
    return (
      <img
        src={avatar!}
        alt={username}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  if (avatar && avatar.length <= 4) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-zinc-800"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        {avatar}
      </span>
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium"
      style={{ width: size, height: size }}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  );
}

export function MembersReportSection({ registered, active, inactive14d, avgStreak, topMembers }: MembersReportSectionProps) {
  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Members</h3>
      <div className="border-t border-zinc-800 pt-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-zinc-500" />
              <span className="text-xs text-zinc-500 uppercase">Registered</span>
            </div>
            <div className="text-2xl font-bold text-white">{registered}</div>
          </div>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-green-400" />
              <span className="text-xs text-zinc-500 uppercase">Active</span>
            </div>
            <div className="text-2xl font-bold text-white">{active}</div>
            <div className="text-xs text-zinc-400 mt-1">trained in period</div>
          </div>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <UserX className="w-4 h-4 text-red-400" />
              <span className="text-xs text-zinc-500 uppercase">Inactive 14d+</span>
            </div>
            <div className="text-2xl font-bold text-white">{inactive14d}</div>
          </div>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-zinc-500 uppercase">Avg Streak</span>
            </div>
            <div className="text-2xl font-bold text-white">{avgStreak} days</div>
          </div>
        </div>

        {topMembers && topMembers.length > 0 && (
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Top 5 Members by Drops</span>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-2 text-xs text-zinc-500 font-medium w-10">#</th>
                  <th className="px-4 py-2 text-xs text-zinc-500 font-medium">Member</th>
                  <th className="px-4 py-2 text-xs text-zinc-500 font-medium text-right">Sessions</th>
                  <th className="px-4 py-2 text-xs text-zinc-500 font-medium text-right">Drops</th>
                  <th className="px-4 py-2 text-xs text-zinc-500 font-medium text-right">Streak</th>
                </tr>
              </thead>
              <tbody>
                {topMembers.map((m, i) => (
                  <tr key={m.username} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-2.5 text-sm text-zinc-400">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <MemberAvatar avatar={m.avatar_url} username={m.username} />
                        <span className="text-sm text-white">{m.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-zinc-300 text-right tabular-nums">{m.sessions_count}</td>
                    <td className="px-4 py-2.5 text-sm text-[#00E5FF] text-right tabular-nums">{m.drops_earned.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-sm text-zinc-300 text-right">
                      {m.streak_days > 0 ? `🔥 ${m.streak_days}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
