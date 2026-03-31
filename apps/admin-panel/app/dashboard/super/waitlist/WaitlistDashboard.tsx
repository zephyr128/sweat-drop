'use client';

import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  MapPin,
  Mail,
  User,
  StickyNote,
  ChevronDown,
} from 'lucide-react';
import {
  type WaitlistEntry,
  type WaitlistStatus,
  updateWaitlistStatus,
} from '@/lib/actions/waitlist-actions';

const STATUS_TABS: { key: WaitlistStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'dismissed', label: 'Dismissed' },
];

const STATUS_CONFIG: Record<
  WaitlistStatus,
  { label: string; color: string; bg: string; border: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Pending',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Clock,
  },
  contacted: {
    label: 'Contacted',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    icon: Phone,
  },
  onboarded: {
    label: 'Onboarded',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: CheckCircle2,
  },
  dismissed: {
    label: 'Dismissed',
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/20',
    icon: XCircle,
  },
};

interface Props {
  initialEntries: WaitlistEntry[];
  initialPendingCount: number;
}

export function WaitlistDashboard({ initialEntries, initialPendingCount }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [activeFilter, setActiveFilter] = useState<WaitlistStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return entries;
    return entries.filter((e) => e.status === activeFilter);
  }, [entries, activeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const s of ['pending', 'contacted', 'onboarded', 'dismissed'] as WaitlistStatus[]) {
      c[s] = entries.filter((e) => e.status === s).length;
    }
    return c;
  }, [entries]);

  const handleStatusChange = (entryId: string, newStatus: WaitlistStatus) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, status: newStatus } : e)),
    );

    startTransition(async () => {
      const res = await updateWaitlistStatus(entryId, newStatus);
      if (!res.success) {
        toast.error(res.error || 'Failed to update status');
        setEntries(initialEntries);
      } else {
        toast.success(`Status updated to ${STATUS_CONFIG[newStatus].label}`);
      }
    });
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['pending', 'contacted', 'onboarded', 'dismissed'] as WaitlistStatus[]).map(
          (s) => {
            const cfg = STATUS_CONFIG[s];
            const StatusIcon = cfg.icon;
            return (
              <button
                key={s}
                onClick={() => setActiveFilter(s === activeFilter ? 'all' : s)}
                className={`bg-[#0A0A0A] border rounded-xl p-4 text-left transition-all ${
                  activeFilter === s
                    ? `${cfg.border} ring-1 ring-${s === 'pending' ? 'amber' : s === 'contacted' ? 'blue' : s === 'onboarded' ? 'emerald' : 'zinc'}-500/30`
                    : 'border-[#1A1A1A] hover:border-[#333]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
                  <span className="text-xs text-zinc-500 font-medium">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold text-white">{counts[s] ?? 0}</p>
              </button>
            );
          },
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1">
        {STATUS_TABS.map((tab) => {
          const active = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 text-center ${
                active
                  ? 'bg-[#1A1A1A] text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {counts[tab.key] ? (
                <span className="ml-1.5 text-[10px] text-zinc-400">
                  ({counts[tab.key]})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-12 text-center">
          <MapPin className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No waitlist entries found</p>
        </div>
      ) : (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_140px] gap-4 px-5 py-3 border-b border-[#1A1A1A] text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
            <span>Gym Request</span>
            <span>User</span>
            <span>Status</span>
            <span>Submitted</span>
            <span>Actions</span>
          </div>

          {filtered.map((entry) => {
            const cfg = STATUS_CONFIG[entry.status];
            const StatusIcon = cfg.icon;
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="border-b border-[#1A1A1A] last:border-b-0"
              >
                {/* Row */}
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_140px] gap-2 md:gap-4 px-5 py-4 items-center">
                  {/* Gym + Location */}
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : entry.id)
                    }
                    className="flex items-center gap-3 text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#111] border border-[#222] flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-[#00E5FF]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {entry.gym_name}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {[entry.city, entry.country].filter(Boolean).join(', ') || '—'}
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-zinc-500 transition-transform ml-auto md:hidden ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* User */}
                  <div className="hidden md:block min-w-0">
                    {entry.user_email ? (
                      <div>
                        <p className="text-sm text-zinc-300 truncate">
                          {entry.user_username || '—'}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {entry.user_email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">Anonymous</span>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="hidden md:block">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color} border ${cfg.border}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="hidden md:block">
                    <p className="text-xs text-zinc-400">{fmtDate(entry.created_at)}</p>
                  </div>

                  {/* Status changer */}
                  <div className="hidden md:block">
                    <select
                      value={entry.status}
                      onChange={(e) =>
                        handleStatusChange(entry.id, e.target.value as WaitlistStatus)
                      }
                      disabled={isPending}
                      className="w-full bg-[#111] border border-[#222] rounded-lg px-2 py-1.5 text-xs text-white [color-scheme:dark] disabled:opacity-50"
                    >
                      <option value="pending">Pending</option>
                      <option value="contacted">Contacted</option>
                      <option value="onboarded">Onboarded</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </div>
                </div>

                {/* Expanded detail (mobile + desktop) */}
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-3 bg-[#060606] border-t border-[#111]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-zinc-500">User</p>
                          <p className="text-sm text-zinc-300">
                            {entry.user_username || 'Anonymous'}
                          </p>
                        </div>
                      </div>
                      {entry.user_email && (
                        <div className="flex items-start gap-2">
                          <Mail className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] text-zinc-500">Email</p>
                            <p className="text-sm text-zinc-300">{entry.user_email}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-zinc-500">Location</p>
                          <p className="text-sm text-zinc-300">
                            {[entry.city, entry.country].filter(Boolean).join(', ') || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-zinc-500">Submitted</p>
                          <p className="text-sm text-zinc-300">{fmtDate(entry.created_at)}</p>
                        </div>
                      </div>
                    </div>

                    {entry.notes && (
                      <div className="flex items-start gap-2">
                        <StickyNote className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-zinc-500">Notes</p>
                          <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                            {entry.notes}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Mobile status changer */}
                    <div className="md:hidden pt-2">
                      <select
                        value={entry.status}
                        onChange={(e) =>
                          handleStatusChange(entry.id, e.target.value as WaitlistStatus)
                        }
                        disabled={isPending}
                        className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white [color-scheme:dark] disabled:opacity-50"
                      >
                        <option value="pending">Pending</option>
                        <option value="contacted">Contacted</option>
                        <option value="onboarded">Onboarded</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
