'use client';

// AGENT NOTE: [2026-04-20] - admin-panel
//   Superadmin-only modal for force-changing a user's email.
//   Calls forceChangeUserEmail which updates auth.users + profiles.email and
//   writes a row in user_email_change_history.
//   IMPORTANT: This bypasses the normal email confirmation flow — the new
//   email is auto-confirmed. Use only when you have verified out-of-band
//   that the new email belongs to the same person.

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Mail, X } from 'lucide-react';
import { forceChangeUserEmail } from '@/lib/actions/owner-admin-actions';

interface ForceEmailChangeModalProps {
  user: {
    id: string;
    email: string;
    username: string | null;
    full_name?: string | null;
  };
  onClose: () => void;
  onSuccess?: (newEmail: string) => void;
}

export function ForceEmailChangeModal({
  user,
  onClose,
  onSuccess,
}: ForceEmailChangeModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    acknowledged &&
    newEmail.trim().length > 0 &&
    newEmail.trim().toLowerCase() === confirmEmail.trim().toLowerCase() &&
    newEmail.trim().toLowerCase() !== user.email.toLowerCase();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await forceChangeUserEmail({
      userId: user.id,
      newEmail: newEmail.trim(),
      reason: reason.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      toast.success(`Email changed: ${res.oldEmail} → ${res.newEmail}`, {
        duration: 6000,
      });
      onSuccess?.(res.newEmail!);
      onClose();
    } else {
      toast.error(res.error || 'Failed to change email');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0A0A0A] border border-[#FF5252]/40 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-[#1A1A1A] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-[#FF5252]" />
              <h2 className="text-lg font-bold text-white">Force Change Email</h2>
            </div>
            <p className="text-xs text-[#808080]">
              Bypasses email confirmation. New email is auto-verified. Audit-logged.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#808080] hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 bg-[#1A1A1A] rounded-lg">
            <p className="text-xs text-[#808080] uppercase tracking-wider mb-1">
              Current user
            </p>
            <p className="text-white font-medium">
              {user.full_name || user.username || '(no name)'}
            </p>
            <p className="text-sm text-[#808080]">{user.email}</p>
          </div>

          <div>
            <label className="block text-xs text-[#808080] mb-2">
              New email address *
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new.email@example.com"
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-[#808080] mb-2">
              Confirm new email *
            </label>
            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="Re-type the new email"
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
            />
            {confirmEmail.length > 0 &&
              confirmEmail.trim().toLowerCase() !== newEmail.trim().toLowerCase() && (
                <p className="mt-1 text-xs text-[#FF5252]">Emails do not match.</p>
              )}
          </div>

          <div>
            <label className="block text-xs text-[#808080] mb-2">
              Reason (optional but recommended)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Owner switched to business email (verified via call)"
              className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-3 p-3 bg-[#FF5252]/10 border border-[#FF5252]/30 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-[#FF5252]">
              I have verified out-of-band (call, video, ID) that the new email belongs
              to the same person. I understand this action is audit-logged and cannot
              be silently undone.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-4 py-2 bg-[#FF5252] text-white rounded-lg font-bold hover:bg-[#D32F2F] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Change Email
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
