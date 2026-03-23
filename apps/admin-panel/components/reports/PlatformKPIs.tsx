'use client';

import { Building2, Users, Activity, Droplets, ShoppingCart, Swords, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PlatformData {
  total_gyms: number;
  total_users: number;
  mau: number;
  total_sessions: number;
  total_drops_earned: number;
  total_redemptions: number;
  total_arenas: number;
  per_gym: GymBreakdownRow[];
}

export interface GymBreakdownRow {
  gym_id: string;
  gym_name: string;
  sessions_count: number;
  active_members: number;
  drops_earned: number;
  redemptions_count: number;
  registered_members: number;
}

function KPICard({ label, value, icon: Icon, accent }: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent || 'text-white'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

interface PlatformKPIsProps {
  data: PlatformData;
}

export function PlatformKPIs({ data }: PlatformKPIsProps) {
  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Platform Overview</h3>
      <div className="border-t border-zinc-800 pt-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Active Gyms" value={data.total_gyms} icon={Building2} />
          <KPICard label="Total Users" value={data.total_users} icon={Users} />
          <KPICard label="MAU" value={data.mau} icon={UserCheck} accent="text-[#00E5FF]" />
          <KPICard label="Total Sessions" value={data.total_sessions} icon={Activity} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard label="Drops Earned" value={data.total_drops_earned} icon={Droplets} accent="text-[#00E5FF]" />
          <KPICard label="Redemptions" value={data.total_redemptions} icon={ShoppingCart} />
          <KPICard label="Arenas Created" value={data.total_arenas} icon={Swords} />
        </div>
      </div>
    </section>
  );
}
