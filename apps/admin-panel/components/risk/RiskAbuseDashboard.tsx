'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, ShieldAlert, Undo2, Ban, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  freezeUserDrops,
  quarantineRedemption,
  resolveFraudEvent,
  rollbackSessionDrops,
  type FraudEventItem,
  type RiskSummary,
  type RiskUser,
  type SuspiciousRedemption,
  type SuspiciousSession,
} from '@/lib/actions/risk-economy-actions';

interface RiskAbuseDashboardProps {
  gymId: string;
  summary: RiskSummary;
  flaggedUsers: RiskUser[];
  events: FraudEventItem[];
  suspiciousSessions: SuspiciousSession[];
  suspiciousRedemptions: SuspiciousRedemption[];
  backendNotes?: string | null;
}

function scoreBadge(score: number) {
  if (score >= 80) return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  if (score >= 60) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
}

function severityBadge(severity: string) {
  if (severity === 'critical') return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  if (severity === 'high') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  if (severity === 'medium') return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
  return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
}

export function RiskAbuseDashboard({
  gymId,
  summary,
  flaggedUsers,
  events,
  suspiciousSessions,
  suspiciousRedemptions,
  backendNotes,
}: RiskAbuseDashboardProps) {
  const [localEvents, setLocalEvents] = useState(events);
  const [isPending, startTransition] = useTransition();

  const handleFreeze = async (userId: string, username: string) => {
    const ok = await confirmAction({
      title: 'Freeze Drops Earning',
      message: `Freeze drops earning for ${username}?`,
      confirmLabel: 'Freeze',
      variant: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await freezeUserDrops(gymId, userId, 'Manual freeze from Risk & Abuse dashboard');
      if (!result.success) {
        toast.error(result.error || 'Freeze failed');
        return;
      }
      if ('warning' in result && result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success('Account frozen');
      }
    });
  };

  const handleRollback = async (sessionId: string) => {
    const ok = await confirmAction({
      title: 'Rollback Session Drops',
      message: 'This will remove awarded drops from this session and write a moderation ledger entry.',
      confirmLabel: 'Rollback',
      variant: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await rollbackSessionDrops(gymId, sessionId, 'Rollback from Risk & Abuse dashboard');
      if (!result.success) {
        toast.error(result.error || 'Rollback failed');
        return;
      }
      toast.success('Session drops rolled back');
    });
  };

  const handleQuarantine = async (redemptionId: string) => {
    const ok = await confirmAction({
      title: 'Quarantine Redemption',
      message: 'This will cancel redemption and refund drops to user.',
      confirmLabel: 'Quarantine',
      variant: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await quarantineRedemption(gymId, redemptionId, 'Quarantined from Risk & Abuse dashboard');
      if (!result.success) {
        toast.error(result.error || 'Quarantine failed');
        return;
      }
      toast.success('Redemption quarantined');
    });
  };

  const handleResolve = async (eventId: string) => {
    startTransition(async () => {
      const result = await resolveFraudEvent(gymId, eventId);
      if (!result.success) {
        toast.error(result.error || 'Resolve failed');
        return;
      }
      setLocalEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, resolved_at: new Date().toISOString() } : e)),
      );
      toast.success('Event resolved');
    });
  };

  return (
    <div className="space-y-6">
      {backendNotes ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-300 text-sm">
          {backendNotes}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Unresolved Events</p>
          <p className="text-3xl font-bold text-white mt-1">{summary.unresolvedEvents}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Flagged Users</p>
          <p className="text-3xl font-bold text-white mt-1">{summary.flaggedUsers}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Suspicious Sessions</p>
          <p className="text-3xl font-bold text-white mt-1">{summary.suspiciousSessions}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Suspicious Redemptions</p>
          <p className="text-3xl font-bold text-white mt-1">{summary.suspiciousRedemptions}</p>
        </div>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1A1A1A] flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h3 className="text-white font-semibold">Flagged Users</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111]">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Score</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Signals</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">7d Minted</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {flaggedUsers.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-zinc-500 text-sm" colSpan={5}>
                    No users above risk threshold.
                  </td>
                </tr>
              ) : (
                flaggedUsers.map((u) => (
                  <tr key={u.userId} className="hover:bg-[#111]">
                    <td className="px-4 py-3">
                      <div className="text-white text-sm font-medium">{u.username}</div>
                      <div className="text-zinc-500 text-xs">{u.email || 'No email'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded border text-xs font-semibold ${scoreBadge(u.riskScore)}`}>
                        {u.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs max-w-[380px]">
                      {u.reasons.join(' · ')}
                    </td>
                    <td className="px-4 py-3 text-cyan-300 text-sm">{u.minted7d.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button
                        disabled={isPending}
                        onClick={() => handleFreeze(u.userId, u.username)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Freeze
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1A1A1A] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-semibold">Suspicious Sessions</h3>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {suspiciousSessions.length === 0 ? (
              <div className="p-5 text-sm text-zinc-500">No suspicious sessions right now.</div>
            ) : (
              suspiciousSessions.slice(0, 12).map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white text-sm font-medium">{s.username}</p>
                    <p className="text-zinc-500 text-xs">
                      {new Date(s.started_at).toLocaleString()} · {s.duration_seconds}s · {s.drops_earned} drops
                    </p>
                  </div>
                  <button
                    disabled={isPending}
                    onClick={() => handleRollback(s.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Rollback
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1A1A1A] flex items-center gap-2">
            <Ban className="w-5 h-5 text-rose-400" />
            <h3 className="text-white font-semibold">Suspicious Redemptions</h3>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {suspiciousRedemptions.length === 0 ? (
              <div className="p-5 text-sm text-zinc-500">No suspicious redemptions.</div>
            ) : (
              suspiciousRedemptions.slice(0, 12).map((r) => (
                <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white text-sm font-medium">{r.username}</p>
                    <p className="text-zinc-500 text-xs">
                      {new Date(r.created_at).toLocaleString()} · {r.drops_spent} drops · code {r.redemption_code || 'N/A'}
                    </p>
                  </div>
                  <button
                    disabled={isPending}
                    onClick={() => handleQuarantine(r.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Quarantine
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1A1A1A]">
          <h3 className="text-white font-semibold">Fraud Event Stream</h3>
        </div>
        <div className="divide-y divide-[#1A1A1A]">
          {localEvents.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500">No events.</div>
          ) : (
            localEvents.slice(0, 24).map((e) => (
              <div key={e.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white text-sm">{e.event_type}</p>
                  <p className="text-zinc-500 text-xs">{new Date(e.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded border text-xs ${severityBadge(e.severity)}`}>
                    {e.severity}
                  </span>
                  {e.resolved_at ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolved
                    </span>
                  ) : (
                    <button
                      disabled={isPending}
                      onClick={() => handleResolve(e.id)}
                      className="px-2.5 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
