'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Swords,
  Calendar,
  Trophy,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import {
  getPendingInvitations,
  getAcceptedInvitations,
  respondToInvitation,
  withdrawFromArena,
  type ArenaInvitation,
} from '@/lib/actions/arena-invitation-actions';

interface ArenaInvitationsManagerProps {
  gymId: string;
}

const SCORING_LABELS: Record<string, string> = {
  total_drops: '💧 Total Drops',
  days_visited: '📅 Days Visited',
  variety_score: '🎯 Machine Variety',
  streak_days: '🔥 Streak Days',
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isFutureDate(dateStr?: string): boolean {
  if (!dateStr) return false;
  const arenaStart = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return arenaStart > today;
}

export function ArenaInvitationsManager({ gymId }: ArenaInvitationsManagerProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted'>('pending');
  const [pendingInvitations, setPendingInvitations] = useState<ArenaInvitation[]>([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState<ArenaInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Withdraw confirm modal state
  const [withdrawModal, setWithdrawModal] = useState<{
    arenaId: string;
    arenaName: string;
    invitationId: string;
  } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const loadPending = useCallback(async () => {
    const result = await getPendingInvitations(gymId);
    if (result.success && result.data) {
      setPendingInvitations(result.data);
    }
  }, [gymId]);

  const loadAccepted = useCallback(async () => {
    const result = await getAcceptedInvitations(gymId);
    if (result.success && result.data) {
      setAcceptedInvitations(result.data);
    }
  }, [gymId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadPending(), loadAccepted()]);
    setLoading(false);
  }, [loadPending, loadAccepted]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRespond = async (invitationId: string, response: 'accepted' | 'declined') => {
    setRespondingId(invitationId);
    const result = await respondToInvitation(invitationId, response);
    setRespondingId(null);

    if (result.success) {
      toast.success(`Invitation ${response}!`);
      // Remove from pending
      setPendingInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      // If accepted, reload accepted list
      if (response === 'accepted') {
        loadAccepted();
      }
    } else {
      toast.error(result.error || `Failed to ${response === 'accepted' ? 'accept' : 'decline'}`);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawModal) return;
    setWithdrawing(true);

    const result = await withdrawFromArena(withdrawModal.arenaId, gymId);
    setWithdrawing(false);

    if (result.success) {
      const parts: string[] = ['Successfully withdrawn from arena.'];
      if (result.participantsRemoved && result.participantsRemoved > 0) {
        parts.push(`${result.participantsRemoved} participant${result.participantsRemoved > 1 ? 's' : ''} removed.`);
      }
      if (result.dropsRefunded && result.dropsRefunded > 0) {
        parts.push(`${result.dropsRefunded} drops refunded.`);
      }
      toast.success(parts.join(' '));
      // Remove from accepted list
      setAcceptedInvitations((prev) => prev.filter((inv) => inv.id !== withdrawModal.invitationId));
      setWithdrawModal(null);
    } else {
      toast.error(result.error || 'Failed to withdraw from arena');
    }
  };

  // Tab counts
  const pendingCount = pendingInvitations.length;
  const acceptedCount = acceptedInvitations.length;

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
          <Swords className="w-5 h-5 text-[#00E5FF]" />
          Arena Invitations
        </h2>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-[#1A1A1A] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Swords className="w-5 h-5 text-[#00E5FF]" />
          Arena Invitations
        </h2>
        <p className="text-sm text-[#808080] mt-1">
          Review invitations and manage your accepted arenas.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'bg-[#1A1A1A] text-white'
              : 'text-[#808080] hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full font-medium">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('accepted')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'accepted'
              ? 'bg-[#1A1A1A] text-white'
              : 'text-[#808080] hover:text-white'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Accepted Arenas
          {acceptedCount > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full font-medium">
              {acceptedCount}
            </span>
          )}
        </button>
      </div>

      {/* === Pending Tab === */}
      {activeTab === 'pending' && (
        <>
          {pendingInvitations.length === 0 ? (
            <div className="text-center py-16 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
              <Clock className="w-16 h-16 text-[#333] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Pending Invitations</h3>
              <p className="text-[#808080] text-sm">
                You&apos;ll see invitations here when SWEATDROP invites your gym to compete.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingInvitations.map((inv) => (
                <InvitationCard
                  key={inv.id}
                  invitation={inv}
                  type="pending"
                  isLoading={respondingId === inv.id}
                  onAccept={() => handleRespond(inv.id, 'accepted')}
                  onDecline={() => handleRespond(inv.id, 'declined')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* === Accepted Tab === */}
      {activeTab === 'accepted' && (
        <>
          {acceptedInvitations.length === 0 ? (
            <div className="text-center py-16 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
              <Swords className="w-16 h-16 text-[#333] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Accepted Arenas</h3>
              <p className="text-[#808080] text-sm">
                Arenas you accept will appear here. Check the Pending tab for new invitations.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {acceptedInvitations.map((inv) => (
                <InvitationCard
                  key={inv.id}
                  invitation={inv}
                  type="accepted"
                  isLoading={false}
                  onWithdraw={() =>
                    setWithdrawModal({
                      arenaId: inv.arena_id,
                      arenaName: inv.arena_name || 'Arena',
                      invitationId: inv.id,
                    })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* === Withdraw Confirm Modal === */}
      {withdrawModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#1A1A1A] rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Withdraw from Arena</h3>
            </div>

            <p className="text-[#808080] text-sm mb-2">
              Are you sure you want to withdraw from <span className="text-white font-medium">{withdrawModal.arenaName}</span>?
            </p>
            <p className="text-[#808080] text-sm mb-6">
              All participants from your gym will be removed and any entry drops will be refunded.
              This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setWithdrawModal(null)}
                disabled={withdrawing}
                className="flex-1 px-4 py-2.5 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#2A2A2A] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {withdrawing ? (
                  'Withdrawing...'
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    Withdraw
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared Invitation Card ─── */
function InvitationCard({
  invitation: inv,
  type,
  isLoading,
  onAccept,
  onDecline,
  onWithdraw,
}: {
  invitation: ArenaInvitation;
  type: 'pending' | 'accepted';
  isLoading: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onWithdraw?: () => void;
}) {
  const canWithdraw = type === 'accepted' && isFutureDate(inv.arena_start_date);
  const isFinalized = inv.arena_is_finalized;
  const isActive = inv.arena_is_active;

  // Arena status badge
  let statusBadge: { label: string; color: string } | null = null;
  if (type === 'accepted') {
    if (isFinalized) {
      statusBadge = { label: 'Finalized', color: 'bg-[#808080]/10 text-[#808080] border-[#808080]/20' };
    } else if (!isFutureDate(inv.arena_start_date) && isActive) {
      statusBadge = { label: 'In Progress', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    } else if (isFutureDate(inv.arena_start_date)) {
      statusBadge = { label: 'Upcoming', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    }
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden hover:border-[#333] transition-colors">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Arena Name */}
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-white truncate">
                {inv.arena_name || 'Arena Competition'}
              </h3>
              {type === 'pending' && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Pending
                </span>
              )}
              {statusBadge && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusBadge.color}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#808080] mb-3">
              {inv.arena_start_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(inv.arena_start_date)} — {formatDate(inv.arena_end_date)}
                </span>
              )}
              {inv.arena_scoring_model && (
                <span>{SCORING_LABELS[inv.arena_scoring_model] || inv.arena_scoring_model}</span>
              )}
              {inv.revenue_share_percent > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <DollarSign className="w-3 h-3" />
                  {inv.revenue_share_percent}% revenue share
                </span>
              )}
            </div>

            {/* Revenue share note */}
            {inv.revenue_share_note && (
              <p className="text-xs text-[#808080] bg-[#1A1A1A] rounded px-3 py-2 mb-3">
                {inv.revenue_share_note}
              </p>
            )}

            {/* Prizes Preview */}
            {inv.arena_prizes && inv.arena_prizes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {inv.arena_prizes.slice(0, 3).map((p, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-[#1A1A1A] border border-[#333] text-white px-2 py-1 rounded"
                  >
                    <Trophy className="w-3 h-3 inline mr-1 text-amber-400" />
                    #{p.rank}: {p.prize}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {type === 'pending' && (
              <>
                <button
                  onClick={onAccept}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Accept
                </button>
                <button
                  onClick={onDecline}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Decline
                </button>
              </>
            )}
            {type === 'accepted' && canWithdraw && (
              <button
                onClick={onWithdraw}
                className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
