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
  ShieldCheck,
  Trophy,
  AlertTriangle,
  Timer,
  User,
  CreditCard,
  FileText,
} from 'lucide-react';
import type {
  MemberDetailResult,
  MemberSession,
  MemberTransaction,
  MemberBadge,
  MemberRedemption,
  MemberExpiryInfo,
  MemberLedgerSummary,
  MemberIdentityInfo,
} from '@/lib/actions/member-detail-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

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

function IdentityVerificationBlock({ identity }: { identity: MemberIdentityInfo | null }) {
  const verified = identity?.isVerified === true;

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-5 h-5 text-[#00E5FF]" />
        <h2 className="text-lg font-bold text-white">Identity Verification</h2>
        {verified ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Needs verification
          </span>
        )}
      </div>

      {!identity ? (
        <p className="text-sm text-zinc-500">No identity record yet. Verify this member from the check-in desk.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <User className="w-3 h-3" />
              Verified Full Name
            </div>
            <p className="text-sm text-white font-medium">{identity.fullNameVerified || '—'}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <CreditCard className="w-3 h-3" />
              Membership ID
            </div>
            <p className="text-sm text-white font-medium font-mono">{identity.externalMembershipId || '—'}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Shield className="w-3 h-3" />
              Verified By
            </div>
            <p className="text-sm text-white">{identity.verifiedByName || '—'}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="w-3 h-3" />
              Verified At
            </div>
            <p className="text-sm text-white">
              {identity.verifiedAt
                ? new Date(identity.verifiedAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </p>
          </div>

          {identity.notes && (
            <div className="sm:col-span-2 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <FileText className="w-3 h-3" />
                Notes
              </div>
              <p className="text-sm text-zinc-300">{identity.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MemberDetailView({ gymId, data }: MemberDetailViewProps) {
  const { profile: member, sessions, transactions, badges, redemptions, expiry, ledger, identity } = data;

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
          <MemberAvatar
            avatarUrl={member.avatar_url}
            username={member.username}
            size="xl"
          />
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

      {/* Identity Verification */}
      <IdentityVerificationBlock identity={identity} />

      {/* KPI Stats — Wallet vs Earned */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard icon={Wallet} label="Wallet Balance" value={(ledger?.walletBalance ?? member.available_drops).toLocaleString()} color="text-emerald-400" />
        <StatCard icon={Trophy} label="Earned (All Time)" value={(ledger?.earnedScoreAllTime ?? member.total_drops).toLocaleString()} color="text-[#00E5FF]" />
        <StatCard icon={Flame} label="Streak" value={`${member.streak_days} days`} color="text-amber-400" />
        <StatCard icon={Clock} label="Last Visit" value={member.last_visit_date ? formatDate(member.last_visit_date) : 'Never'} color="text-[#808080]" />
      </div>

      {/* Earned score breakdown + Expiry */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {ledger && (
          <>
            <StatCard icon={Droplet} label="Earned (Week)" value={ledger.earnedScoreWeekly.toLocaleString()} color="text-cyan-300" />
            <StatCard icon={Droplet} label="Earned (Month)" value={ledger.earnedScoreMonthly.toLocaleString()} color="text-cyan-300" />
          </>
        )}
        {expiry && (
          <>
            <StatCard icon={Timer} label="Expiring (7d)" value={expiry.expiringIn7d.toLocaleString()} color={expiry.expiringIn7d > 0 ? 'text-amber-400' : 'text-zinc-500'} />
            <StatCard icon={AlertTriangle} label="Expiring (30d)" value={expiry.expiringIn30d.toLocaleString()} color={expiry.expiringIn30d > 0 ? 'text-rose-400' : 'text-zinc-500'} />
            <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <span className="text-xs text-[#808080] uppercase tracking-wider">Next Expiry</span>
              </div>
              <p className="text-lg font-bold text-white">{expiry.nextExpiryDate ? formatDate(expiry.nextExpiryDate) : '—'}</p>
            </div>
          </>
        )}
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
