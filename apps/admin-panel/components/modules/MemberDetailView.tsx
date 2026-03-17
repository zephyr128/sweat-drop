'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Droplet,
  Flame,
  Clock,
  Calendar,
  Award,
  ShoppingBag,
  Activity,
  Wallet,
  Shield,
} from 'lucide-react';
import type {
  MemberDetailResult,
  MemberSession,
  MemberTransaction,
  MemberBadge,
  MemberRedemption,
} from '@/lib/actions/member-detail-actions';

interface MemberDetailViewProps {
  gymId: string;
  data: MemberDetailResult;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${s}s`;
}

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    gym_admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    gym_owner: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    receptionist: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    user: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };
  const label: Record<string, string> = {
    gym_admin: 'Admin',
    gym_owner: 'Owner',
    receptionist: 'Staff',
    user: 'Member',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[role] || styles.user}`}>
      <Shield className="w-3 h-3" />
      {label[role] || 'Member'}
    </span>
  );
}

function txTypeBadge(type: string) {
  const isPositive = ['session_reward', 'checkin_reward', 'challenge_reward', 'manual_add', 'badge_reward', 'referral_reward', 'arena_reward'].includes(type);
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

function redemptionStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400',
    confirmed: 'bg-emerald-500/10 text-emerald-400',
    cancelled: 'bg-rose-500/10 text-rose-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${styles[status] || 'bg-zinc-500/10 text-zinc-400'}`}>
      {status}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Droplet; label: string; value: string; color: string }) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-[#808080] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: typeof Activity; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-5 h-5 text-[#00E5FF]" />
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {count !== undefined && (
        <span className="text-xs text-[#808080] bg-[#1A1A1A] px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function SessionsTable({ sessions }: { sessions: MemberSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No sessions recorded</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1A1A1A]">
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Date</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Duration</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Drops</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Machine</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1A1A1A]">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-[#111] transition-colors">
              <td className="px-4 py-3 text-sm text-white">{formatDate(s.started_at)}</td>
              <td className="px-4 py-3 text-sm text-[#808080]">{formatDuration(s.duration_seconds)}</td>
              <td className="px-4 py-3 text-sm font-medium text-[#00E5FF]">+{s.drops_earned}</td>
              <td className="px-4 py-3 text-sm text-[#808080]">{s.machine_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTable({ transactions }: { transactions: MemberTransaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No transactions recorded</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1A1A1A]">
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Date</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Type</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Amount</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1A1A1A]">
          {transactions.map((t) => (
            <tr key={t.id} className="hover:bg-[#111] transition-colors">
              <td className="px-4 py-3 text-sm text-white">{formatDate(t.created_at)}</td>
              <td className="px-4 py-3">{txTypeBadge(t.transaction_type)}</td>
              <td className={`px-4 py-3 text-sm font-medium ${t.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {t.amount >= 0 ? '+' : ''}{t.amount}
              </td>
              <td className="px-4 py-3 text-sm text-[#808080] max-w-[200px] truncate">{t.description || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BadgesGrid({ badges }: { badges: MemberBadge[] }) {
  if (badges.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No badges earned yet</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {badges.map((b) => (
        <div key={b.badge_id} className="bg-[#111] border border-[#1A1A1A] rounded-lg p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.badge_image_url}
            alt={b.badge_name}
            className="w-12 h-12 mx-auto mb-2 object-contain"
          />
          <p className="text-xs font-medium text-white truncate">{b.badge_name}</p>
          <p className="text-[10px] text-[#808080] mt-0.5">{formatDate(b.earned_at)}</p>
        </div>
      ))}
    </div>
  );
}

function RedemptionsTable({ redemptions }: { redemptions: MemberRedemption[] }) {
  if (redemptions.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No redemptions</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1A1A1A]">
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Date</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Reward</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Drops</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Status</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[#808080] uppercase">Code</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1A1A1A]">
          {redemptions.map((r) => (
            <tr key={r.id} className="hover:bg-[#111] transition-colors">
              <td className="px-4 py-3 text-sm text-white">{formatDate(r.created_at)}</td>
              <td className="px-4 py-3 text-sm text-white">{r.reward_name}</td>
              <td className="px-4 py-3 text-sm text-rose-400">-{r.drops_spent}</td>
              <td className="px-4 py-3">{redemptionStatusBadge(r.status)}</td>
              <td className="px-4 py-3 text-sm text-[#808080] font-mono">{r.redemption_code || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MemberDetailView({ gymId, data }: MemberDetailViewProps) {
  const { profile: member, sessions, transactions, badges, redemptions } = data;

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href={`/dashboard/gym/${gymId}/members`}
        className="inline-flex items-center gap-2 text-sm text-[#808080] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Members
      </Link>

      {/* Header */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <div className="flex items-center gap-5">
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={member.username}
              className="w-16 h-16 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-[#808080]">
                {member.username.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white truncate">{member.username}</h1>
              {roleBadge(member.role)}
            </div>
            <p className="text-sm text-[#808080]">{member.email}</p>
            <p className="text-xs text-[#555] mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Member since {formatDate(member.joined_at)}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Droplet} label="Total Drops" value={member.total_drops.toLocaleString()} color="text-[#00E5FF]" />
        <StatCard icon={Wallet} label="Available" value={member.available_drops.toLocaleString()} color="text-emerald-400" />
        <StatCard icon={Flame} label="Streak" value={`${member.streak_days} days`} color="text-amber-400" />
        <StatCard icon={Clock} label="Last Visit" value={member.last_visit_date ? formatDate(member.last_visit_date) : 'Never'} color="text-[#808080]" />
      </div>

      {/* Activity */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <SectionHeader icon={Activity} title="Recent Sessions" count={sessions.length} />
        <SessionsTable sessions={sessions} />
      </div>

      {/* Drops History */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <SectionHeader icon={Droplet} title="Drops History" count={transactions.length} />
        <TransactionsTable transactions={transactions} />
      </div>

      {/* Badges */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <SectionHeader icon={Award} title="Badges" count={badges.length} />
        <BadgesGrid badges={badges} />
      </div>

      {/* Redemptions */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <SectionHeader icon={ShoppingBag} title="Redemptions" count={redemptions.length} />
        <RedemptionsTable redemptions={redemptions} />
      </div>
    </div>
  );
}
