'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Trophy,
  Medal,
  Award,
  Users,
  Calendar,
  Building2,
  MapPin,
  Globe,
  Flame,
  RefreshCw,
  Flag,
  ArrowLeft,
  Ban,
  Lock,
  CheckCircle,
  XCircle,
  Ticket,
  Bell,
  Mail,
  Copy,
  ClipboardCheck,
} from 'lucide-react';
import {
  getArenaParticipants,
  finalizeArena,
  cancelArena,
  notifyArenaParticipants,
  type Arena,
  type ParticipantWithBreakdown,
  type ParticipantGymBreakdown,
} from '@/lib/actions/arena-actions';
import {
  getArenaResults,
  getArenaInvitations,
  type ArenaResult,
  type ArenaInvitation,
  type GymScoreEntry,
} from '@/lib/actions/arena-invitation-actions';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { MemberAvatar } from '@/components/MemberAvatar';

interface ArenaDetailProps {
  arena: Arena;
  isSuperadmin: boolean;
  viewingGymId?: string;
  onBack: () => void;
}

const RANK_ICONS = [Trophy, Medal, Award];
const RANK_COLORS = [
  'from-amber-400 to-yellow-500',
  'from-zinc-300 to-zinc-400',
  'from-amber-600 to-amber-700',
];
const RANK_TEXT_COLORS = ['text-amber-400', 'text-zinc-400', 'text-amber-600'];

const SCORING_LABELS: Record<string, string> = {
  total_drops: 'Total Drops',
  days_visited: 'Days Visited',
  variety_score: 'Machine Variety',
  streak_days: 'Streak Days',
};

const SCORING_UNITS: Record<string, string> = {
  total_drops: '💧',
  days_visited: 'days',
  variety_score: 'machines',
  streak_days: '🔥 days',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type Tab = 'leaderboard' | 'results' | 'invitations';

// Helper to check if a breakdown is an array (superadmin view)
function isFullBreakdown(b: ParticipantWithBreakdown['gym_breakdown']): b is ParticipantGymBreakdown[] {
  return Array.isArray(b);
}

// Helper to check if a breakdown is a privacy object (gym owner view)
function isPrivacyBreakdown(b: ParticipantWithBreakdown['gym_breakdown']): b is { own_gym_score: number; other_gyms_score: number; total_sessions: number } {
  return b !== null && !Array.isArray(b) && 'own_gym_score' in b;
}

// Helper to check if ArenaResult gym_breakdown is full array (superadmin)
function isResultFullBreakdown(b: ArenaResult['gym_breakdown']): b is GymScoreEntry[] {
  return Array.isArray(b);
}

export function ArenaDetail({ arena, isSuperadmin, viewingGymId, onBack }: ArenaDetailProps) {
  const router = useRouter();
  const [participants, setParticipants] = useState<ParticipantWithBreakdown[]>([]);
  const [results, setResults] = useState<ArenaResult[]>([]);
  const [invitations, setInvitations] = useState<ArenaInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');

  const loadParticipants = useCallback(async () => {
    const result = await getArenaParticipants(arena.id, viewingGymId);
    if (result.success && result.data) {
      setParticipants(result.data);
    }
  }, [arena.id, viewingGymId]);

  const loadResults = useCallback(async () => {
    if (!arena.is_finalized) return;
    const result = await getArenaResults(arena.id, viewingGymId);
    if (result.success && result.data) {
      setResults(result.data);
    }
  }, [arena.id, arena.is_finalized, viewingGymId]);

  const loadInvitations = useCallback(async () => {
    const result = await getArenaInvitations(arena.id);
    if (result.success && result.data) {
      setInvitations(result.data);
    }
  }, [arena.id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadParticipants(), loadResults(), loadInvitations()]).finally(() => setLoading(false));
  }, [loadParticipants, loadResults, loadInvitations]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadParticipants(), loadResults(), loadInvitations()]);
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const handleFinalize = async () => {
    if (!(await confirmAction({ title: 'Finalize Arena', message: 'This will calculate final rankings and distribute prizes. This cannot be undone.', confirmLabel: 'Finalize', variant: 'warning' }))) return;
    const result = await finalizeArena(arena.id);
    if (result.success) {
      toast.success(`Arena finalized! ${result.winnersCount || 0} prize(s) distributed.`);
      await loadResults();
      setActiveTab('results');
    } else {
      toast.error(result.error || 'Failed to finalize');
    }
  };

  const handleCancel = async () => {
    if (!(await confirmAction({ title: 'Cancel Arena', message: 'All participants will be refunded if drops were paid. This cannot be undone.', confirmLabel: 'Cancel Arena', variant: 'danger' }))) return;
    const result = await cancelArena(arena.id);
    if (result.success) {
      toast.success(`Arena cancelled. ${result.participantsRefunded || 0} participant(s) refunded.`);
      onBack();
    } else {
      toast.error(result.error || 'Failed to cancel arena');
    }
  };

  const handleNotify = async (winnersOnly: boolean) => {
    const label = winnersOnly ? 'winners' : 'all participants';
    if (!(await confirmAction({ title: 'Send Notifications', message: `Send push notifications to ${label}?`, confirmLabel: 'Send' }))) return;
    setNotifying(true);
    const result = await notifyArenaParticipants(arena.id, winnersOnly);
    setNotifying(false);
    if (result.success) {
      toast.success(`Notifications sent to ${result.notifiedCount || 0} ${label}`);
    } else {
      toast.error(result.error || 'Failed to send notifications');
    }
  };

  const handleCopyWinnerEmails = () => {
    const winnerEmails = results
      .filter((r) => r.prize && r.email)
      .map((r) => r.email!);
    if (winnerEmails.length === 0) {
      toast.error('No winner emails available');
      return;
    }
    navigator.clipboard.writeText(winnerEmails.join(', '));
    setCopiedEmails(true);
    toast.success(`Copied ${winnerEmails.length} winner email(s) to clipboard`);
    setTimeout(() => setCopiedEmails(false), 2000);
  };

  const now = new Date();
  const start = new Date(arena.start_date + 'T00:00:00');
  const end = new Date(arena.end_date + 'T23:59:59');
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const progressPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-[#808080] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">{arena.name}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-[#808080]">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {arena.sponsor_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(arena.start_date)} — {formatDate(arena.end_date)}
            </span>
            <span>{SCORING_LABELS[arena.scoring_model] || arena.scoring_model}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-sm text-[#808080] hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isSuperadmin && !arena.is_finalized && arena.is_active && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/30 rounded-lg text-sm text-orange-400 hover:bg-orange-500/20 transition-all"
            >
              <Ban className="w-4 h-4" />
              Cancel
            </button>
          )}
          {isSuperadmin && !arena.is_finalized && (
            <button
              onClick={handleFinalize}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400 hover:bg-amber-500/20 transition-all"
            >
              <Flag className="w-4 h-4" />
              Finalize
            </button>
          )}
        </div>
      </div>

      {/* Opt-In Info */}
      {arena.opt_in_type && arena.opt_in_type !== 'free' && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-300">
            {arena.opt_in_type === 'drops' ? `Entry fee: ${arena.opt_in_value} drops` :
             arena.opt_in_type === 'streak' ? `Requires ${arena.opt_in_value}-day streak` :
             `Requires ${arena.opt_in_value} total drops (level)`}
          </span>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Participants</p>
          <p className="text-2xl font-bold text-white">{participants.length}</p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Gyms</p>
          <p className="text-2xl font-bold text-white">{arena.gym_count || 0}</p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Progress</p>
          <p className="text-2xl font-bold text-[#00E5FF]">{progressPct}%</p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Prizes</p>
          <p className="text-2xl font-bold text-amber-400">{arena.prizes?.length || 0}</p>
        </div>
      </div>

      {/* Time Progress Bar */}
      <div className="bg-[#1A1A1A] rounded-lg p-4">
        <div className="flex items-center justify-between text-xs text-[#808080] mb-2">
          <span>{formatDate(arena.start_date)}</span>
          <span>{elapsedDays} / {totalDays} days</span>
          <span>{formatDate(arena.end_date)}</span>
        </div>
        <div className="w-full h-2 bg-[#0A0A0A] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00E5FF] to-[#00B8CC] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Prizes */}
      {arena.prizes && arena.prizes.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Prizes
          </h3>
          <div className="flex flex-wrap gap-3">
            {arena.prizes.map((prize, idx) => {
              const isTop3 = idx < 3;
              const RankIcon = isTop3 ? RANK_ICONS[idx] : Trophy;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#0A0A0A] border border-[#333] rounded-lg px-3 py-2"
                >
                  {isTop3 ? (
                    <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${RANK_COLORS[idx]} flex items-center justify-center`}>
                      <RankIcon className="w-3 h-3 text-black" />
                    </div>
                  ) : (
                    <span className="text-xs text-[#808080] font-mono">#{prize.rank}</span>
                  )}
                  <span className="text-sm text-white">{prize.prize}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#1A1A1A]">
        {(['leaderboard', ...(arena.is_finalized ? ['results'] as const : []), ...(isSuperadmin ? ['invitations'] as const : [])] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? 'text-[#00E5FF] border-[#00E5FF]'
                : 'text-[#808080] border-transparent hover:text-white'
            }`}
          >
            {tab === 'leaderboard' ? 'Leaderboard' :
             tab === 'results' ? 'Results' :
             `Invitations${invitations.length > 0 ? ` (${invitations.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#333]">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#00E5FF]" />
              Live Leaderboard
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-[#808080]">Loading participants...</div>
          ) : participants.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-[#333] mx-auto mb-3" />
              <p className="text-[#808080]">No participants yet</p>
              <p className="text-xs text-[#555] mt-1">Members need to opt-in to appear</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#1A1A1A]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase w-12">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Member</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Gym</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#808080] uppercase">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Gym Breakdown</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#808080] uppercase">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1A]">
                  {participants.map((p, idx) => {
                    const isTop3 = idx < 3;
                    const RankIcon = isTop3 ? RANK_ICONS[idx] : null;
                    const unit = SCORING_UNITS[arena.scoring_model] || '';
                    return (
                      <tr
                        key={p.user_id}
                        onClick={() =>
                          router.push(
                            `/dashboard/gym/${p.participant_gym_id}/members/${p.user_id}`
                          )
                        }
                        className={`hover:bg-[#1A1A1A]/50 cursor-pointer ${isTop3 ? 'bg-[#0A0A0A]' : ''}`}
                      >
                        <td className="px-4 py-3">
                          {isTop3 && RankIcon ? (
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[idx]} flex items-center justify-center`}>
                              <RankIcon className="w-4 h-4 text-black" />
                            </div>
                          ) : (
                            <span className="text-[#808080] font-mono text-sm">#{p.rank}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MemberAvatar
                              avatarUrl={p.avatar_url}
                              username={p.username}
                              size="md"
                            />
                            <span className={`text-sm font-medium ${isTop3 ? RANK_TEXT_COLORS[idx] : 'text-white'}`}>
                              {p.username}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-[#808080] flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {p.gym_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold ${isTop3 ? 'text-white' : 'text-[#808080]'}`}>
                            {Number(p.current_score).toLocaleString()} {unit}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {p.gym_breakdown ? (
                            isFullBreakdown(p.gym_breakdown) ? (
                              <div className="flex flex-col gap-0.5">
                                {p.gym_breakdown.map((gb) => (
                                  <span key={gb.gym_id} className="text-xs text-[#808080]">
                                    <span className="text-[#555]">{gb.gym_name}:</span>{' '}
                                    <span className="text-white font-medium">{gb.score.toLocaleString()}</span>
                                    <span className="text-[#555] ml-1">({gb.sessions}s)</span>
                                  </span>
                                ))}
                              </div>
                            ) : isPrivacyBreakdown(p.gym_breakdown) ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-[#808080]">
                                  <span className="text-emerald-400">Your gym:</span>{' '}
                                  <span className="text-white font-medium">{p.gym_breakdown.own_gym_score.toLocaleString()}</span>
                                </span>
                                <span className="text-xs text-[#808080]">
                                  <span className="text-[#555]">Other gyms:</span>{' '}
                                  <span className="text-white font-medium">{p.gym_breakdown.other_gyms_score.toLocaleString()}</span>
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-[#555]">—</span>
                            )
                          ) : (
                            <span className="text-xs text-[#555]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-[#808080]">
                            {new Date(p.opted_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Results Tab (finalized arenas only) */}
      {activeTab === 'results' && arena.is_finalized && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#333] flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Final Results
            </h3>
            {isSuperadmin && results.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleNotify(true)}
                  disabled={notifying}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {notifying ? 'Sending...' : 'Notify Winners'}
                </button>
                <button
                  onClick={() => handleNotify(false)}
                  disabled={notifying}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-xs text-[#808080] hover:text-white transition-all disabled:opacity-50"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {notifying ? 'Sending...' : 'Notify All'}
                </button>
                <button
                  onClick={handleCopyWinnerEmails}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-xs text-[#808080] hover:text-white transition-all"
                >
                  {copiedEmails ? (
                    <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedEmails ? 'Copied!' : 'Copy Winner Emails'}
                </button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="p-12 text-center">
              <Trophy className="w-12 h-12 text-[#333] mx-auto mb-3" />
              <p className="text-[#808080]">No results yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#1A1A1A]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase w-12">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Member</th>
                    {isSuperadmin && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Email</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Gym</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#808080] uppercase">Final Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Gym Breakdown</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Prize</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Redemption</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1A]">
                  {results.map((r, idx) => {
                    const isTop3 = idx < 3;
                    const RankIcon = isTop3 ? RANK_ICONS[idx] : null;
                    return (
                      <tr
                        key={r.user_id}
                        onClick={() => {
                          const gid = r.member_gym_id || viewingGymId;
                          if (gid) {
                            router.push(`/dashboard/gym/${gid}/members/${r.user_id}`);
                          }
                        }}
                        className={`hover:bg-[#1A1A1A]/50 ${r.member_gym_id || viewingGymId ? 'cursor-pointer' : ''} ${isTop3 ? 'bg-[#0A0A0A]' : ''}`}
                      >
                        <td className="px-4 py-3">
                          {isTop3 && RankIcon ? (
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[idx]} flex items-center justify-center`}>
                              <RankIcon className="w-4 h-4 text-black" />
                            </div>
                          ) : (
                            <span className="text-[#808080] font-mono text-sm">#{r.rank}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MemberAvatar
                              avatarUrl={r.avatar_url}
                              username={r.username}
                              size="md"
                            />
                            <span className={`text-sm font-medium ${isTop3 ? RANK_TEXT_COLORS[idx] : 'text-white'}`}>
                              {r.username}
                            </span>
                          </div>
                        </td>
                        {isSuperadmin && (
                          <td className="px-4 py-3">
                            {r.email ? (
                              <span className="text-xs text-[#808080] flex items-center gap-1">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[180px]">{r.email}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-[#555]">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="text-xs text-[#808080] flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {r.gym_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold ${isTop3 ? 'text-white' : 'text-[#808080]'}`}>
                            {Number(r.final_score).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.gym_breakdown ? (
                            isResultFullBreakdown(r.gym_breakdown) ? (
                              <div className="flex flex-col gap-0.5">
                                {r.gym_breakdown.map((gb) => (
                                  <span key={gb.gym_id} className="text-xs text-[#808080]">
                                    <span className="text-[#555]">{gb.gym_name}:</span>{' '}
                                    <span className="text-white font-medium">{gb.score.toLocaleString()}</span>
                                    <span className="text-[#555] ml-1">({gb.sessions}s)</span>
                                  </span>
                                ))}
                              </div>
                            ) : !Array.isArray(r.gym_breakdown) && 'own_gym_score' in r.gym_breakdown ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-[#808080]">
                                  <span className="text-emerald-400">Your gym:</span>{' '}
                                  <span className="text-white font-medium">{r.gym_breakdown.own_gym_score.toLocaleString()}</span>
                                </span>
                                <span className="text-xs text-[#808080]">
                                  <span className="text-[#555]">Other gyms:</span>{' '}
                                  <span className="text-white font-medium">{r.gym_breakdown.other_gyms_score.toLocaleString()}</span>
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-[#555]">—</span>
                            )
                          ) : (
                            <span className="text-xs text-[#555]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.prize ? (
                            <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded">
                              {r.prize}
                            </span>
                          ) : (
                            <span className="text-xs text-[#555]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.redemption_code ? (
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-[#1A1A1A] text-[#00E5FF] px-2 py-1 rounded font-mono">
                                {r.redemption_code}
                              </code>
                              {r.redemption_status === 'redeemed' ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Ticket className="w-3.5 h-3.5 text-yellow-400" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-[#555]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invitations Tab (superadmin only) */}
      {activeTab === 'invitations' && isSuperadmin && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#333]">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#00E5FF]" />
              Gym Invitations
            </h3>
          </div>

          {invitations.length === 0 ? (
            <div className="p-12 text-center">
              <MapPin className="w-12 h-12 text-[#333] mx-auto mb-3" />
              <p className="text-[#808080]">No invitations sent yet</p>
              <p className="text-xs text-[#555] mt-1">Use the Invite button from the arenas list</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1A1A1A]">
              {invitations.map((inv) => (
                <div key={inv.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{inv.gym_name}</p>
                    <p className="text-xs text-[#808080] mt-0.5">
                      Sent {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {inv.revenue_share_percent > 0 && ` • ${inv.revenue_share_percent}% revenue share`}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded font-medium flex items-center gap-1 ${
                    inv.status === 'accepted'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : inv.status === 'declined'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                  }`}>
                    {inv.status === 'accepted' ? <CheckCircle className="w-3 h-3" /> :
                     inv.status === 'declined' ? <XCircle className="w-3 h-3" /> : null}
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Participating Gyms */}
      {arena.gyms && arena.gyms.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#808080]" />
            Participating Gyms ({arena.gyms.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {arena.gyms.map((gym) => (
              <span
                key={gym.gym_id}
                className="text-xs bg-[#0A0A0A] border border-[#333] text-white px-3 py-1.5 rounded-lg"
              >
                {gym.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
