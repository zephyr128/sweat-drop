'use client';

import { Users, Clock, Activity, CalendarCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface EngagementData {
  total_sessions: number;
  avg_session_duration_min: number;
  total_active_members: number;
  total_registered_members: number;
  total_checkins: number;
  avg_visits_per_member: number;
  inactive_14d: number;
  total_drops_earned: number;
  total_drops_spent: number;
  challenges_completed: number;
  active_challenges_count: number;
  avg_streak_days: number;
  top_members: TopMember[];
}

export interface TopMember {
  username: string;
  avatar_url: string | null;
  sessions_count: number;
  drops_earned: number;
  streak_days: number;
}

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
}

function KPICard({ label, value, icon: Icon, sub }: KPICardProps) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

interface EngagementKPIsProps {
  data: EngagementData;
}

export function EngagementKPIs({ data }: EngagementKPIsProps) {
  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Engagement</h3>
      <div className="border-t border-zinc-800 pt-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Sessions"
            value={data.total_sessions}
            icon={Activity}
          />
          <KPICard
            label="Avg Duration"
            value={`${data.avg_session_duration_min} min`}
            icon={Clock}
          />
          <KPICard
            label="Active Members"
            value={data.total_active_members}
            icon={Users}
            sub={`trained here · ${data.total_registered_members} registered`}
          />
          <KPICard
            label="Avg Visits / Member"
            value={data.avg_visits_per_member ?? 0}
            icon={CalendarCheck}
            sub={`${data.total_checkins.toLocaleString()} total check-ins`}
          />
        </div>
      </div>
    </section>
  );
}
