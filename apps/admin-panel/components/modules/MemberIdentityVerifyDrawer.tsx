'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  X,
  ShieldCheck,
  User,
  CreditCard,
  FileText,
  Loader2,
  CheckCircle,
  Clock,
} from 'lucide-react';
import {
  getCheckinIdentityCandidate,
  verifyMemberIdentity,
  type IdentityCandidate,
} from '@/lib/actions/member-identity-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

interface MemberIdentityVerifyDrawerProps {
  gymId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  onClose: () => void;
  onVerified: (userId: string) => void;
}

export function MemberIdentityVerifyDrawer({
  gymId,
  userId,
  username,
  avatarUrl,
  onClose,
  onVerified,
}: MemberIdentityVerifyDrawerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [candidate, setCandidate] = useState<IdentityCandidate | null>(null);
  const [fullName, setFullName] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!gymId || !userId) {
      toast.error('Gym ID and user ID are required for verification');
      setLoading(false);
      return;
    }
    (async () => {
      const res = await getCheckinIdentityCandidate(gymId, userId);
      if (res.success && res.data) {
        setCandidate(res.data);
        setFullName(res.data.identity?.full_name_verified || res.data.full_name || '');
        setMembershipId(res.data.identity?.external_membership_id || '');
        setNotes(res.data.identity?.verification_notes || '');
      } else {
        toast.error(res.error || 'Failed to load member data');
      }
      setLoading(false);
    })();
  }, [gymId, userId]);

  const handleVerify = async () => {
    if (!gymId) {
      toast.error('Gym ID is required to complete verification');
      return;
    }
    setSaving(true);
    const res = await verifyMemberIdentity(
      gymId,
      userId,
      fullName.trim() || null,
      membershipId.trim() || null,
      notes.trim() || null,
    );
    if (res.success) {
      toast.success('Member identity verified');
      // Refresh server-component caches so redemption rows reflect the
      // auto-promoted status (DB trigger fires on is_verified = true).
      router.refresh();
      onVerified(userId);
      onClose();
    } else {
      toast.error(res.error || 'Verification failed');
    }
    setSaving(false);
  };

  const isAlreadyVerified = candidate?.identity?.is_verified === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />
            <h2 className="text-sm font-semibold text-white">Verify Member Identity</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Member info */}
            <div className="flex items-center gap-3 pb-3 border-b border-[#1A1A1A]">
              <MemberAvatar avatarUrl={avatarUrl} username={username} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{username}</p>
                {candidate?.email && (
                  <p className="text-xs text-zinc-500 truncate">{candidate.email}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {candidate?.total_checkins != null && (
                    <span className="text-[10px] text-zinc-600">
                      {candidate.total_checkins} check-in{candidate.total_checkins !== 1 ? 's' : ''}
                    </span>
                  )}
                  {isAlreadyVerified ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <CheckCircle className="w-2.5 h-2.5" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                      <Clock className="w-2.5 h-2.5" /> Needs verification
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                  <User className="w-3 h-3" />
                  Verified Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none transition-colors"
                  placeholder="e.g. John Smith"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                  <CreditCard className="w-3 h-3" />
                  Membership Card / ID
                </label>
                <input
                  type="text"
                  value={membershipId}
                  onChange={(e) => setMembershipId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none transition-colors"
                  placeholder="e.g. GYM-001234"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                  <FileText className="w-3 h-3" />
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none transition-colors resize-none"
                  placeholder="Any relevant notes…"
                />
              </div>
            </div>

            {/* Verified-by audit (if already verified) */}
            {isAlreadyVerified && candidate?.identity?.verified_at && (
              <div className="px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                <p className="text-[10px] text-emerald-400/70">
                  Verified on {new Date(candidate.identity.verified_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-[#1A1A1A]">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 bg-[#1A1A1A] border border-[#333] rounded-lg hover:bg-[#222] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleVerify}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-bold bg-[#00E5FF] text-black rounded-lg hover:bg-[#00B8CC] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {isAlreadyVerified ? 'Update Verification' : 'Verify Identity'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
