'use client';

// AGENT NOTE: [2026-04-20] - admin-panel
//   Superadmin-only "Danger Zone" section for managing gym ownership.
//   Actions:
//     - Invite new owner by email (sends invitation; current owner stays
//       until the invitation is accepted)
//     - Assign an existing gym_owner directly (immediate reassignment)
//     - Unassign (set owner_id = null)
//   Also displays ownership change history (from gym_ownership_history).

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Crown,
  Mail,
  Send,
  UserMinus,
  UserPlus,
  History,
  Loader2,
  X,
} from 'lucide-react';
import {
  assignGymOwner,
  unassignGymOwner,
  inviteNewOwnerForGym,
  getGymOwnershipHistory,
} from '@/lib/actions/owner-admin-actions';
import { getOwnersWithGyms } from '@/lib/actions/owner-actions';

interface OwnerManagementModuleProps {
  gymId: string;
  gymName: string;
  currentOwner: {
    id: string;
    email: string;
    username: string | null;
    full_name: string | null;
  } | null;
}

interface HistoryEntry {
  id: string;
  change_method: 'invite' | 'assign_existing' | 'unassign' | 'invitation_accepted';
  reason: string | null;
  changed_at: string;
  old_owner: { email: string; username: string | null } | null;
  new_owner: { email: string; username: string | null } | null;
  actor: { email: string; username: string | null } | null;
}

interface PotentialOwner {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  gyms: Array<{ id: string; name: string }>;
}

type Action = null | 'invite' | 'assign' | 'unassign';

export function OwnerManagementModule({
  gymId,
  gymName,
  currentOwner,
}: OwnerManagementModuleProps) {
  const [action, setAction] = useState<Action>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [owners, setOwners] = useState<PotentialOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [reason, setReason] = useState('');

  const loadHistory = async () => {
    setHistoryLoading(true);
    const res = await getGymOwnershipHistory(gymId);
    if (res.success) {
      setHistory(res.data as HistoryEntry[]);
    } else {
      toast.error(res.error || 'Failed to load ownership history');
    }
    setHistoryLoading(false);
  };

  const loadOwners = async () => {
    setOwnersLoading(true);
    const res = await getOwnersWithGyms();
    if (res.success) {
      setOwners(res.data as PotentialOwner[]);
    } else {
      toast.error(res.error || 'Failed to load potential owners');
    }
    setOwnersLoading(false);
  };

  useEffect(() => {
    if (historyOpen && history.length === 0) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen]);

  useEffect(() => {
    if (action === 'assign' && owners.length === 0) {
      loadOwners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const resetForm = () => {
    setAction(null);
    setInviteEmail('');
    setSelectedOwnerId('');
    setReason('');
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setSubmitting(true);
    const res = await inviteNewOwnerForGym({
      gymId,
      email: inviteEmail.trim(),
      reason: reason.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      toast.success('Invitation sent to ' + inviteEmail);
      if (res.invitationUrl) {
        console.log('[Owner invitation link]', res.invitationUrl);
      }
      resetForm();
      await loadHistory();
    } else {
      toast.error(res.error || 'Failed to send invitation');
    }
  };

  const handleAssign = async () => {
    if (!selectedOwnerId) {
      toast.error('Select an owner');
      return;
    }
    setSubmitting(true);
    const res = await assignGymOwner({
      gymId,
      newOwnerId: selectedOwnerId,
      reason: reason.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      toast.success('Owner reassigned. Page will refresh.');
      resetForm();
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.error(res.error || 'Failed to reassign owner');
    }
  };

  const handleUnassign = async () => {
    setSubmitting(true);
    const res = await unassignGymOwner({
      gymId,
      reason: reason.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      toast.success('Owner removed from this gym. Page will refresh.');
      resetForm();
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.error(res.error || 'Failed to unassign owner');
    }
  };

  const formatMethod = (m: HistoryEntry['change_method']) => {
    switch (m) {
      case 'invite':
        return 'Invitation sent';
      case 'invitation_accepted':
        return 'Invitation accepted';
      case 'assign_existing':
        return 'Reassigned';
      case 'unassign':
        return 'Unassigned';
    }
  };

  return (
    <div className="bg-[#0A0A0A] border border-[#FF5252]/40 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-[#1A1A1A]">
        <div className="flex items-center gap-3 mb-2">
          <AlertTriangle className="w-5 h-5 text-[#FF5252]" />
          <h2 className="text-lg font-bold text-white">Danger Zone — Gym Ownership</h2>
        </div>
        <p className="text-xs text-[#808080]">
          Superadmin-only tooling. Every change is recorded in an audit log. Use
          invitation flow when the new owner is not yet a SweatDrop user.
        </p>
      </div>

      {/* Current owner card */}
      <div className="p-6 border-b border-[#1A1A1A]">
        <p className="text-xs text-[#808080] uppercase tracking-wider mb-2">
          Current Owner
        </p>
        {currentOwner ? (
          <div className="flex items-center gap-3 p-4 bg-[#1A1A1A] rounded-lg">
            <div className="w-10 h-10 rounded-full bg-[#00E5FF]/10 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-[#00E5FF]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-medium truncate">
                {currentOwner.full_name || currentOwner.username || 'Unnamed'}
              </p>
              <p className="text-xs text-[#808080] truncate">{currentOwner.email}</p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-[#1A1A1A] rounded-lg border border-dashed border-[#2A2A2A]">
            <p className="text-sm text-[#808080]">No owner assigned to this gym.</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {action === null && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => setAction('invite')}
            className="flex items-center gap-3 p-4 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#2A2A2A] rounded-lg text-left transition-colors"
          >
            <Mail className="w-5 h-5 text-[#00E5FF] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Invite by Email</p>
              <p className="text-xs text-[#808080]">
                New owner receives a link; transfer happens when they accept.
              </p>
            </div>
          </button>

          <button
            onClick={() => setAction('assign')}
            className="flex items-center gap-3 p-4 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#2A2A2A] rounded-lg text-left transition-colors"
          >
            <UserPlus className="w-5 h-5 text-[#FFA726] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Assign Existing Owner</p>
              <p className="text-xs text-[#808080]">
                Immediate reassignment to a user who is already a gym_owner.
              </p>
            </div>
          </button>

          <button
            onClick={() => setAction('unassign')}
            disabled={!currentOwner}
            className="flex items-center gap-3 p-4 bg-[#1A1A1A] hover:bg-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed border border-[#FF5252]/30 rounded-lg text-left transition-colors"
          >
            <UserMinus className="w-5 h-5 text-[#FF5252] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Remove Owner</p>
              <p className="text-xs text-[#808080]">
                Set gym to unowned. Staff and data stay intact.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Invite form */}
      {action === 'invite' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Invite new owner to <span className="text-[#00E5FF]">{gymName}</span>
            </h3>
            <button
              onClick={resetForm}
              className="text-[#808080] hover:text-white"
              aria-label="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div>
            <label className="block text-xs text-[#808080] mb-2">
              New owner email *
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="owner@vortex-gym.com"
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#808080] mb-2">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ownership transfer agreed 2026-04-20"
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          {currentOwner && (
            <div className="p-3 bg-[#FFA726]/10 border border-[#FFA726]/30 rounded-lg">
              <p className="text-xs text-[#FFA726]">
                Current owner <strong>{currentOwner.email}</strong> keeps access until
                the new owner accepts the invitation. Any pending invitations for this
                gym will be cancelled.
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleInvite}
              disabled={submitting || !inviteEmail.trim()}
              className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Invitation
            </button>
            <button
              onClick={resetForm}
              disabled={submitting}
              className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Assign existing */}
      {action === 'assign' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Assign existing gym_owner to {gymName}
            </h3>
            <button
              onClick={resetForm}
              className="text-[#808080] hover:text-white"
              aria-label="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {ownersLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#808080]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading owners...
            </div>
          ) : (
            <div>
              <label className="block text-xs text-[#808080] mb-2">
                Select owner *
              </label>
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
              >
                <option value="">— Choose an existing gym_owner —</option>
                {owners
                  .filter((o) => o.id !== currentOwner?.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name || o.username} ({o.email}) — owns{' '}
                      {o.gyms?.length || 0} gym(s)
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-[#808080] mb-2">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div className="p-3 bg-[#FF5252]/10 border border-[#FF5252]/30 rounded-lg">
            <p className="text-xs text-[#FF5252]">
              <strong>Immediate reassignment.</strong> Previous owner loses access to
              this gym right away. Staff, members, machines and data stay intact.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAssign}
              disabled={submitting || !selectedOwnerId}
              className="px-4 py-2 bg-[#FFA726] text-black rounded-lg font-bold hover:bg-[#FF9100] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Reassign Owner
            </button>
            <button
              onClick={resetForm}
              disabled={submitting}
              className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unassign */}
      {action === 'unassign' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Remove owner from {gymName}</h3>
            <button
              onClick={resetForm}
              className="text-[#808080] hover:text-white"
              aria-label="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-3 bg-[#FF5252]/10 border border-[#FF5252]/30 rounded-lg">
            <p className="text-xs text-[#FF5252]">
              This gym will have no owner until you assign one. Staff (gym_admin,
              receptionists) keep their access to the gym.
            </p>
          </div>
          <div>
            <label className="block text-xs text-[#808080] mb-2">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ownership terminated; contract cancelled"
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleUnassign}
              disabled={submitting}
              className="px-4 py-2 bg-[#FF5252] text-white rounded-lg font-bold hover:bg-[#D32F2F] disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserMinus className="w-4 h-4" />
              )}
              Confirm Remove
            </button>
            <button
              onClick={resetForm}
              disabled={submitting}
              className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* History toggle */}
      <div className="border-t border-[#1A1A1A]">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1A1A1A] transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#808080]" />
            <span className="text-sm text-[#808080]">
              Ownership History {history.length > 0 && `(${history.length})`}
            </span>
          </div>
          <span className="text-xs text-[#808080]">
            {historyOpen ? 'Hide' : 'Show'}
          </span>
        </button>

        {historyOpen && (
          <div className="p-4 border-t border-[#1A1A1A] space-y-2">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#808080]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-[#808080]">No ownership changes recorded yet.</p>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 bg-[#1A1A1A] rounded-lg text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">
                      {formatMethod(entry.change_method)}
                    </span>
                    <span className="text-[#808080]">
                      {new Date(entry.changed_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[#808080]">
                    {entry.old_owner?.email || '(none)'}
                    {' → '}
                    {entry.new_owner?.email || '(none)'}
                  </p>
                  {entry.actor && (
                    <p className="text-[#808080]">
                      by {entry.actor.username || entry.actor.email}
                    </p>
                  )}
                  {entry.reason && (
                    <p className="text-[#808080] italic">&quot;{entry.reason}&quot;</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
