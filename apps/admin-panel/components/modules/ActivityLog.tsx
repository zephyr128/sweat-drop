'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, QrCode, Gift, ScrollText, ChevronLeft, ChevronRight,
  Dumbbell, TimerOff, Play, XCircle,
} from 'lucide-react';
import {
  getGymActivityLog,
  type ActivityLogItem,
  type ActivityFilterKind,
  type ActivityKind,
} from '@/lib/actions/activity-log-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

interface ActivityLogProps {
  gymId: string;
}

const TABS: { key: ActivityFilterKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'checkin', label: 'Check-ins' },
  { key: 'redemption', label: 'Redemptions' },
  { key: 'workout', label: 'Workouts' },
];

const PER_PAGE = 20;

// ── Helpers ───────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  if (!dateStr) return '—';
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

function formatAbsoluteTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Badges ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    active: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    autofinished: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  const style = styles[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700/50';
  const label = status === 'autofinished' ? 'auto-finished' : status;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${style}`}>
      {label}
    </span>
  );
}

const KIND_CONFIG: Record<ActivityKind, { label: string; icon: React.ReactNode; colors: string }> = {
  checkin: {
    label: 'Check-in',
    icon: <QrCode className="w-2.5 h-2.5" />,
    colors: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  redemption: {
    label: 'Redemption',
    icon: <Gift className="w-2.5 h-2.5" />,
    colors: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  workout_started: {
    label: 'Workout started',
    icon: <Play className="w-2.5 h-2.5" />,
    colors: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
  workout_finished: {
    label: 'Workout done',
    icon: <Dumbbell className="w-2.5 h-2.5" />,
    colors: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  workout_auto_finished: {
    label: 'Auto-finished',
    icon: <TimerOff className="w-2.5 h-2.5" />,
    colors: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  workout_cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="w-2.5 h-2.5" />,
    colors: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

function KindBadge({ kind }: { kind: ActivityKind }) {
  const cfg = KIND_CONFIG[kind] || KIND_CONFIG.checkin;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.colors}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────

export function ActivityLog({ gymId }: ActivityLogProps) {
  const [tab, setTab] = useState<ActivityFilterKind>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getGymActivityLog(gymId, tab, debouncedSearch || null, page, PER_PAGE);
    if (result.success && result.data) {
      setItems(result.data.items);
      setTotal(result.data.total);
      setTotalPages(result.data.totalPages);
    } else {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    }
    setLoading(false);
  }, [gymId, tab, debouncedSearch, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleTabChange(newTab: ActivityFilterKind) {
    setTab(newTab);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-1 bg-zinc-900/50 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t.key
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            type="text"
            placeholder="Search by member name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900/50 border border-[#1A1A1A] rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00E5FF]/40 transition-colors"
          />
        </div>

        <p className="text-[10px] text-zinc-600 ml-auto">
          {total.toLocaleString()} item{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-zinc-900/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ScrollText className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500 font-medium">No activity found</p>
            <p className="text-xs text-zinc-600 mt-1">Adjust filters or check back later</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Time</th>
                <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Type</th>
                <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Member</th>
                <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-wider font-medium hidden md:table-cell">Details</th>
                <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-wider font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-300" title={formatAbsoluteTime(item.at)}>
                      {relativeTime(item.at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <KindBadge kind={item.kind} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MemberAvatar avatarUrl={item.memberAvatarUrl} username={item.memberName} size="sm" />
                      <span className="text-xs text-white font-medium truncate max-w-[120px]">{item.memberName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-zinc-500 truncate max-w-[200px] block">{item.details || item.title}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-zinc-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-[#1A1A1A] text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {generatePageNumbers(page, totalPages).map((pn, i) =>
              pn === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1.5 text-[10px] text-zinc-600">…</span>
              ) : (
                <button
                  key={pn}
                  onClick={() => setPage(pn as number)}
                  className={`w-7 h-7 text-xs rounded-lg border transition-colors ${
                    page === pn
                      ? 'bg-[#00E5FF]/10 border-[#00E5FF]/40 text-[#00E5FF] font-medium'
                      : 'border-[#1A1A1A] text-zinc-500 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {pn}
                </button>
              ),
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-[#1A1A1A] text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}
