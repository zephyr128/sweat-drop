'use client';

import { useState } from 'react';
import {
  UserPlus,
  UserCheck,
  BadgeCheck,
  Gift,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  ReferralStats,
  ReferralListItem,
  ReferralStage,
  ReferralData,
} from '@/lib/actions/referral-pilot-actions';

interface ReferralPilotCardProps {
  data: ReferralData;
}

const kpis: Array<{
  key: keyof ReferralStats;
  label: string;
  icon: typeof UserPlus;
  color: string;
}> = [
  { key: 'invitesSent', label: 'Invites', icon: UserPlus, color: 'text-blue-400' },
  { key: 'joined', label: 'Joined', icon: UserCheck, color: 'text-cyan-400' },
  { key: 'verifiedCheckin', label: 'Verified', icon: BadgeCheck, color: 'text-amber-400' },
  { key: 'rewarded', label: 'Rewarded', icon: Gift, color: 'text-emerald-400' },
  { key: 'capBlocked', label: 'Cap-Blocked', icon: ShieldAlert, color: 'text-red-400' },
];

const stageMeta: Record<ReferralStage, { label: string; bg: string; text: string }> = {
  invited:     { label: 'Invited',     bg: 'bg-zinc-500/10',    text: 'text-zinc-400' },
  registered:  { label: 'Registered',  bg: 'bg-cyan-500/10',    text: 'text-cyan-400' },
  checked_in:  { label: 'Checked In',  bg: 'bg-blue-500/10',    text: 'text-blue-400' },
  verified:    { label: 'Verified',    bg: 'bg-amber-500/10',   text: 'text-amber-400' },
  rewarded:    { label: 'Rewarded',    bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  cap_blocked: { label: 'Cap Blocked', bg: 'bg-red-500/10',     text: 'text-red-400' },
  blocked:     { label: 'Blocked',     bg: 'bg-red-500/10',     text: 'text-red-400' },
  expired:     { label: 'Expired',     bg: 'bg-zinc-700/20',    text: 'text-zinc-500' },
};

function StageBadge({ stage }: { stage: ReferralStage }) {
  const m = stageMeta[stage];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${m.bg} ${m.text}`}>
      {m.label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function ReferralRow({ item }: { item: ReferralListItem }) {
  return (
    <tr className="border-t border-[#1A1A1A] hover:bg-[#111] transition-colors">
      <td className="px-3 py-2.5 text-xs text-white truncate max-w-[120px]">{item.referrerName}</td>
      <td className="px-3 py-2.5 text-xs text-zinc-400 truncate max-w-[120px]">
        {item.inviteeName ?? <span className="text-zinc-600 italic">pending</span>}
      </td>
      <td className="px-3 py-2.5"><StageBadge stage={item.stage} /></td>
      <td className="px-3 py-2.5 text-xs text-zinc-500 tabular-nums">{fmtDate(item.createdAt)}</td>
      <td className="px-3 py-2.5 text-xs text-zinc-500 tabular-nums">{fmtDate(item.joinedAt)}</td>
      <td className="px-3 py-2.5 text-xs text-zinc-500 tabular-nums">{fmtDate(item.verifiedAt)}</td>
      <td className="px-3 py-2.5 text-xs text-zinc-500 tabular-nums">{fmtDate(item.rewardedAt)}</td>
    </tr>
  );
}

export function ReferralPilotCard({ data }: ReferralPilotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { stats, list } = data;
  const hasAny = stats.invitesSent > 0;

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-white">Referrals</h3>
        {hasAny && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500 hover:text-[#00E5FF] transition-colors"
          >
            {expanded ? 'Hide' : 'Show'} details
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* KPI row */}
      {hasAny ? (
        <div className="grid grid-cols-5 gap-3">
          {kpis.map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="text-center">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1.5`} />
              <p className="text-lg font-bold text-white">{stats[key]}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider leading-tight">
                {label}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-3">
          No referral invites yet.
        </p>
      )}

      {/* Expandable list */}
      {expanded && list.length > 0 && (
        <div className="mt-4 -mx-5 -mb-5 border-t border-[#1A1A1A] overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Referrer</th>
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Invitee</th>
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Status</th>
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Invited</th>
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Joined</th>
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Verified</th>
                <th className="px-3 py-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Rewarded</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <ReferralRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
