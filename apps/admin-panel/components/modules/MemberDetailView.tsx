'use client';

import { useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
import { MemberIdentityVerifyDrawer } from '@/components/modules/MemberIdentityVerifyDrawer';

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

// ── Pagination helper ────────────────────────────────────────────

const PAGE_SIZE = 10;

function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safeP = Math.min(page, totalPages);
  const start = (safeP - 1) * PAGE_SIZE;
  const paged = items.slice(start, start + PAGE_SIZE);
  return { paged, page: safeP, totalPages, total, setPage };
}

function PaginationFooter({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between pt-3 border-t border-[#1A1A1A] mt-3">
      <span className="text-xs text-zinc-500">{start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded border border-[#1A1A1A] text-zinc-500 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="px-3 text-xs text-zinc-400">{page} / {totalPages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded border border-[#1A1A1A] text-zinc-500 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Section tables with pagination ───────────────────────────────

function SessionsTable({ sessions }: { sessions: MemberSession[] }) {
  const { paged, page, totalPages, total, setPage } = usePagination(sessions);
  if (sessions.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No sessions recorded</p>;
  }
  return (
    <div>
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
            {paged.map((s) => (
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
      <PaginationFooter page={page} totalPages={totalPages} total={total} onPage={setPage} />
    </div>
  );
}

function TransactionsTable({ transactions }: { transactions: MemberTransaction[] }) {
  const { paged, page, totalPages, total, setPage } = usePagination(transactions);
  if (transactions.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No transactions recorded</p>;
  }
  return (
    <div>
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
            {paged.map((t) => (
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
      <PaginationFooter page={page} totalPages={totalPages} total={total} onPage={setPage} />
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
  const { paged, page, totalPages, total, setPage } = usePagination(redemptions);
  if (redemptions.length === 0) {
    return <p className="text-sm text-[#808080] text-center py-6">No redemptions</p>;
  }
  return (
    <div>
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
            {paged.map((r) => (
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
      <PaginationFooter page={page} totalPages={totalPages} total={total} onPage={setPage} />
    </div>
  );
}

// ── Identity block with verify button ────────────────────────────

function IdentityVerificationBlock({
  identity,
  onVerifyClick,
}: {
  identity: MemberIdentityInfo | null;
  onVerifyClick: () => void;
}) {
  const verified = identity?.isVerified === true;

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
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
        <button
          onClick={onVerifyClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-colors bg-[#00E5FF] text-black hover:bg-[#00B8CC]"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {verified ? 'Update' : 'Verify Now'}
        </button>
      </div>

      {!identity ? (
        <p className="text-sm text-zinc-500">No identity record yet. Click &quot;Verify Now&quot; to verify this member.</p>
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

// ── Main view ────────────────────────────────────────────────────

export function MemberDetailView({ gymId, data }: MemberDetailViewProps) {
  const { profile: member, sessions, transactions, badges, redemptions, expiry, ledger, identity } = data;

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [localIdentity, setLocalIdentity] = useState<MemberIdentityInfo | null>(identity);

  const handleVerified = () => {
    setLocalIdentity((prev) => (prev ? { ...prev, isVerified: true } : { isVerified: true, fullNameVerified: null, externalMembershipId: null, verifiedByName: null, verifiedAt: new Date().toISOString(), notes: null }));
  };

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

      {/* Identity Verification — with action button */}
      <IdentityVerificationBlock
        identity={localIdentity}
        onVerifyClick={() => setVerifyOpen(true)}
      />

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

      {/* Activity — with pagination */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <SectionHeader icon={Activity} title="Recent Sessions" count={sessions.length} />
        <SessionsTable sessions={sessions} />
      </div>

      {/* Drops History — with pagination */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <SectionHeader icon={Droplet} title="Drops History" count={transactions.length} />
        <TransactionsTable transactions={transactions} />
      </div>

      {/* Badges */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mb-6">
        <SectionHeader icon={Award} title="Badges" count={badges.length} />
        <BadgesGrid badges={badges} />
      </div>

      {/* Redemptions — with pagination */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <SectionHeader icon={ShoppingBag} title="Redemptions" count={redemptions.length} />
        <RedemptionsTable redemptions={redemptions} />
      </div>

      {/* Identity verify drawer */}
      {verifyOpen && (
        <MemberIdentityVerifyDrawer
          gymId={gymId}
          userId={member.id}
          username={member.username}
          avatarUrl={member.avatar_url}
          onClose={() => setVerifyOpen(false)}
          onVerified={handleVerified}
        />
      )}
    </div>
  );
}
