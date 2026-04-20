'use client';

import { X, ShieldAlert, ShieldCheck, Clock } from 'lucide-react';
import { MemberAvatar } from '@/components/MemberAvatar';

export interface UnverifiedCheckin {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  checked_in_at: string;
}

interface UnverifiedCheckinsModalProps {
  checkins: UnverifiedCheckin[];
  onClose: () => void;
  onVerifyClick: (c: UnverifiedCheckin) => void;
}

function relativeTime(dateStr: string): string {
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Modal listing unverified check-ins so the receptionist can fire a
 * one-click Verify drawer for each member in quick succession.
 *
 * Rendered at z-40 so the existing MemberIdentityVerifyDrawer (z-50)
 * layers on top when opened.
 */
export function UnverifiedCheckinsModal({
  checkins,
  onClose,
  onVerifyClick,
}: UnverifiedCheckinsModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1A1A1A] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Unverified members
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {checkins.length === 0
                  ? 'All recent check-ins are verified'
                  : `${checkins.length} member${checkins.length === 1 ? '' : 's'} waiting for identity check`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable list */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {checkins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm text-zinc-400">All caught up</p>
              <p className="text-xs text-zinc-600 text-center max-w-xs">
                Every member checked in recently has been verified.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {checkins.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-900/40 transition-colors"
                >
                  <MemberAvatar
                    avatarUrl={c.avatar_url}
                    username={c.username}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {c.username}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
                      <Clock className="w-2.5 h-2.5" />
                      {relativeTime(c.checked_in_at)}
                    </span>
                  </div>
                  <button
                    onClick={() => onVerifyClick(c)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verify
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer tip */}
        <div className="border-t border-[#1A1A1A] px-5 py-3 shrink-0">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Tip: clicking <span className="text-amber-400 font-semibold">Verify</span> opens a short form — ID name, membership number, optional notes. Reward hand-over requires each member to be verified first.
          </p>
        </div>
      </div>
    </div>
  );
}
