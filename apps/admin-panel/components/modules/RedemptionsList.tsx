'use client';

import { useState, useCallback, useEffect, useTransition, useRef } from 'react';
import {
  Ticket, Clock, CheckCircle2, XCircle, Droplet, User,
  Gift, Loader2, X, Trophy, Swords, ShoppingBag, Package, PackageCheck, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listRedemptions } from '@/lib/actions/list-actions';
import type { RedemptionRow } from '@/lib/actions/list-helpers';
import { confirmRedemption, cancelRedemption } from '@/lib/actions/redemption-actions';
import { markRedemptionFulfilled } from '@/lib/actions/redemption-fulfillment-actions';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { LiveIndicator } from '@/components/ui/LiveIndicator';
import type { PaginatedResult } from '@/lib/actions/list-helpers';

// Fulfillment sub-filter applied client-side (no extra round-trip)
type FulfillmentFilter = 'all' | 'awaiting_shipment' | 'ready_to_collect';

interface RedemptionsListProps {
  gymId: string;
  onActionComplete?: () => void;
  /** Optional controlled fulfillment filter. When provided, makes the chips controlled. */
  fulfillmentFilter?: FulfillmentFilter;
  onFulfillmentFilterChange?: (next: FulfillmentFilter) => void;
}

// ── Helpers ───────────────────────────────────────────────────────

type PhysicalSourceType = 'arena_prize' | 'leaderboard_prize';
const PHYSICAL_SOURCES: PhysicalSourceType[] = ['arena_prize', 'leaderboard_prize'];

function isPhysical(row: RedemptionRow): boolean {
  return PHYSICAL_SOURCES.includes(row.source_type as PhysicalSourceType);
}

/**
 * Derives the display state for a redemption used by both StatusBadge and the modal action logic.
 *
 * - pending_verification → must verify identity first
 * - awaiting_shipment    → physical reward, not yet received at gym
 * - ready_to_collect     → fulfilled or store reward — member can come pick up
 * - confirmed            → handed over
 * - cancelled            → cancelled
 */
type DisplayState =
  | 'pending_verification'
  | 'awaiting_shipment'
  | 'ready_to_collect'
  | 'confirmed'
  | 'cancelled';

function getDisplayState(row: RedemptionRow): DisplayState {
  if (row.status === 'confirmed') return 'confirmed';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'pending_verification') return 'pending_verification';
  // status === 'pending'
  if (isPhysical(row) && !row.fulfilled_at) return 'awaiting_shipment';
  return 'ready_to_collect';
}

// ── StatusBadge ───────────────────────────────────────────────────

function StatusBadge({ row }: { row: RedemptionRow }) {
  const state = getDisplayState(row);
  switch (state) {
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 text-zinc-500 text-xs font-medium">
          <XCircle className="w-3.5 h-3.5" /> Cancelled
        </span>
      );
    case 'pending_verification':
      return (
        <span className="inline-flex items-center gap-1 text-orange-400 text-xs font-medium">
          <ShieldAlert className="w-3.5 h-3.5" /> Pending verification
        </span>
      );
    case 'awaiting_shipment':
      return (
        <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-medium">
          <Package className="w-3.5 h-3.5" /> Awaiting shipment
        </span>
      );
    case 'ready_to_collect':
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
          <PackageCheck className="w-3.5 h-3.5" /> Ready to collect
        </span>
      );
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

type SourceType = 'reward_store' | 'leaderboard_prize' | 'arena_prize';

const SOURCE_META: Record<SourceType, { label: string; icon: typeof ShoppingBag; color: string }> = {
  reward_store:      { label: 'Store',       icon: ShoppingBag, color: 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30' },
  leaderboard_prize: { label: 'Leaderboard', icon: Trophy,      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  arena_prize:       { label: 'Arena',        icon: Swords,      color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};

function SourceBadge({ sourceType }: { sourceType: string | null }) {
  const key = (sourceType || 'reward_store') as SourceType;
  const meta = SOURCE_META[key] ?? SOURCE_META.reward_store;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

function getDisplayName(row: RedemptionRow): string {
  if (row.reward_name) return row.reward_name;
  if (row.description) {
    const dashIdx = row.description.indexOf(' — ');
    if (dashIdx !== -1) return row.description.slice(dashIdx + 3);
    return row.description;
  }
  return 'Unknown';
}

const COLUMNS: ColumnDef<RedemptionRow>[] = [
  {
    key: 'redemption_code',
    label: 'Code',
    render: (row) => (
      <span className="font-mono text-[#00E5FF] text-sm tracking-wider">{row.redemption_code || '—'}</span>
    ),
  },
  {
    key: 'username',
    label: 'Member',
    render: (row) => (
      <span className="text-white">{row.username || '—'}</span>
    ),
  },
  {
    key: 'reward_name',
    label: 'Reward',
    render: (row) => (
      <div className="flex flex-col gap-1">
        <span className="text-zinc-300 text-sm">{getDisplayName(row)}</span>
        <SourceBadge sourceType={row.source_type} />
      </div>
    ),
  },
  {
    key: 'drops_spent',
    label: 'Drops',
    sortable: true,
    className: 'text-right',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="flex items-center justify-end gap-1 text-[#00E5FF]">
        <Droplet className="w-3.5 h-3.5" />
        {row.drops_spent?.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (row) => <StatusBadge row={row} />,
  },
  {
    key: 'created_at',
    label: 'Date',
    sortable: true,
    render: (row) => (
      <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>
    ),
  },
];

const FILTERS: FilterDef[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All status' },
      { value: 'pending', label: 'Pending' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
];

// ── RedemptionDetailModal ─────────────────────────────────────────

function RedemptionDetailModal({
  row,
  gymId,
  onClose,
  onDone,
}: {
  row: RedemptionRow;
  gymId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [processing, setProcessing] = useState(false);
  const state = getDisplayState(row);

  const handleMarkReceived = async () => {
    setProcessing(true);
    try {
      const res = await markRedemptionFulfilled(row.id);
      if (res.success) {
        toast.success('Prize marked as received — member notified!');
        onDone();
      } else {
        toast.error(res.error || 'Failed to mark as received');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const res = await confirmRedemption(row.id, gymId);
      if (res.success) {
        toast.success('Redemption confirmed!');
        onDone();
      } else {
        toast.error(res.error || 'Failed to confirm');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirmAction({
      title: 'Cancel Redemption',
      message: `Cancel redemption ${row.redemption_code}? Drops will be refunded to ${row.username || 'the member'}.`,
      confirmLabel: 'Cancel & Refund',
      variant: 'danger',
    });
    if (!ok) return;
    setProcessing(true);
    try {
      const res = await cancelRedemption(row.id, gymId, 'Cancelled by staff');
      if (res.success) {
        toast.success('Redemption cancelled. Drops refunded.');
        onDone();
      } else {
        toast.error(res.error || 'Failed to cancel');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setProcessing(false);
    }
  };

  const statusColor =
    state === 'confirmed'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : state === 'cancelled'
      ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
      : state === 'pending_verification'
      ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
      : state === 'awaiting_shipment'
      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'; // ready_to_collect

  const statusLabel: Record<typeof state, string> = {
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    pending_verification: 'Pending verification',
    awaiting_shipment: 'Awaiting shipment',
    ready_to_collect: 'Ready to collect',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-[#00E5FF]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base font-bold text-white">{getDisplayName(row)}</h3>
                <SourceBadge sourceType={row.source_type} />
              </div>
              <p className="text-xs font-mono text-[#00E5FF] tracking-wider">{row.redemption_code || '—'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-center">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${statusColor}`}>
              {statusLabel[state]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Member</span>
              </div>
              <p className="text-sm font-medium text-white">{row.username || 'Unknown'}</p>
            </div>
            <div className="bg-zinc-900/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Droplet className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Drops Spent</span>
              </div>
              <p className="text-sm font-bold text-[#00E5FF]">{row.drops_spent?.toLocaleString()}</p>
            </div>
            <div className="bg-zinc-900/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Requested</span>
              </div>
              <p className="text-sm text-zinc-300">{formatDate(row.created_at)}</p>
            </div>
            <div className="bg-zinc-900/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Reward</span>
              </div>
              <p className="text-sm text-zinc-300">{getDisplayName(row)}</p>
            </div>
          </div>

          {row.fulfilled_at && (
            <div className="bg-zinc-900/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <PackageCheck className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Received at gym</span>
              </div>
              <p className="text-sm text-blue-400">{formatDate(row.fulfilled_at)}</p>
            </div>
          )}

          {row.confirmed_at && (
            <div className="bg-zinc-900/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Confirmed at</span>
              </div>
              <p className="text-sm text-emerald-400">{formatDate(row.confirmed_at)}</p>
            </div>
          )}

          {row.description && (
            <p className="text-xs text-zinc-500 italic px-1">{row.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 pt-0 space-y-2">
          {state === 'pending_verification' && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <ShieldAlert className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-300">
                Member identity not yet verified. Use <strong>Verify</strong> in the Recent Check-ins panel before handing over any reward.
              </p>
            </div>
          )}

          {state === 'awaiting_shipment' && (
            <div className="flex gap-2">
              <button
                onClick={handleMarkReceived}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Mark as received
              </button>
              <button
                onClick={handleCancel}
                disabled={processing}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-[#FF5252]/30 text-[#FF5252] rounded-xl text-sm font-medium hover:bg-[#FF5252]/10 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          )}

          {state === 'ready_to_collect' && (
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#00E5FF] text-black rounded-xl text-sm font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm & Hand Over
              </button>
              <button
                onClick={handleCancel}
                disabled={processing}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-[#FF5252]/30 text-[#FF5252] rounded-xl text-sm font-medium hover:bg-[#FF5252]/10 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── RedemptionsList ───────────────────────────────────────────────

export function RedemptionsList({
  gymId,
  onActionComplete,
  fulfillmentFilter: fulfillmentFilterProp,
  onFulfillmentFilterChange,
}: RedemptionsListProps) {
  const [data, setData] = useState<PaginatedResult<RedemptionRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc',
    filters: { status: 'all' },
  });
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [fulfillmentFilterInner, setFulfillmentFilterInner] =
    useState<FulfillmentFilter>('all');

  // Controlled when prop is provided, uncontrolled otherwise
  const fulfillmentFilter = fulfillmentFilterProp ?? fulfillmentFilterInner;
  const setFulfillmentFilter = (next: FulfillmentFilter) => {
    if (onFulfillmentFilterChange) onFulfillmentFilterChange(next);
    if (fulfillmentFilterProp === undefined) setFulfillmentFilterInner(next);
  };

  const [selectedRow, setSelectedRow] = useState<RedemptionRow | null>(null);

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const result = await listRedemptions(gymId, {
        q: q.q,
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortDir: q.sortDir,
        filters: {
          status: (q.filters?.status as 'all' | 'pending' | 'pending_verification' | 'confirmed' | 'cancelled') || 'all',
        },
      });
      if (result.success) setData(result.data);
    });
  }, [gymId]);

  useEffect(() => { fetchData(query); }, [query, fetchData]);

  // Realtime polling: refresh data every 30 seconds
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    pollRef.current = setInterval(() => { fetchData(query); }, 30_000);
    return () => clearInterval(pollRef.current);
  }, [fetchData, query]);

  const handleQueryChange = useCallback((update: DataTableQuery) => {
    setQuery((prev) => {
      const next = { ...prev, ...update };
      if (update.filters) next.filters = { ...prev.filters, ...update.filters };
      return next;
    });
  }, []);

  const handleActionDone = useCallback(() => {
    setSelectedRow(null);
    fetchData(query);
    onActionComplete?.();
  }, [fetchData, query, onActionComplete]);

  // Apply source + fulfillment filters client-side
  let displayedItems = sourceFilter === 'all'
    ? data.items
    : data.items.filter((r) => (r.source_type || 'reward_store') === sourceFilter);

  if (fulfillmentFilter !== 'all') {
    displayedItems = displayedItems.filter((r) => getDisplayState(r) === fulfillmentFilter);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        {/* Source type chip filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'reward_store', 'leaderboard_prize', 'arena_prize'] as const).map((st) => {
            const isActive = sourceFilter === st;
            if (st === 'all') {
              return (
                <button
                  key="all"
                  onClick={() => setSourceFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive ? 'bg-[#00E5FF] text-black' : 'bg-[#1A1A1A] text-[#808080] hover:text-white border border-[#333]'
                  }`}
                >
                  All sources
                </button>
              );
            }
            const meta = SOURCE_META[st];
            const Icon = meta.icon;
            return (
              <button
                key={st}
                onClick={() => setSourceFilter(st)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                  isActive ? `${meta.color} opacity-100` : 'bg-[#1A1A1A] text-[#808080] hover:text-white border-[#333]'
                }`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </button>
            );
          })}

          {/* Fulfillment sub-filter chips */}
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          {([
            { value: 'all' as FulfillmentFilter, label: 'All states' },
            { value: 'awaiting_shipment' as FulfillmentFilter, label: 'Awaiting shipment', icon: Package, color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
            { value: 'ready_to_collect' as FulfillmentFilter, label: 'Ready to collect', icon: PackageCheck, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
          ]).map(({ value, label, icon: Icon, color }) => {
            const isActive = fulfillmentFilter === value;
            if (value === 'all') {
              return (
                <button
                  key="ff-all"
                  onClick={() => setFulfillmentFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive ? 'bg-zinc-700 text-white' : 'bg-[#1A1A1A] text-[#808080] hover:text-white border border-[#333]'
                  }`}
                >
                  {label}
                </button>
              );
            }
            return (
              <button
                key={value}
                onClick={() => setFulfillmentFilter(value)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                  isActive ? `${color} opacity-100` : 'bg-[#1A1A1A] text-[#808080] hover:text-white border-[#333]'
                }`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {label}
              </button>
            );
          })}
        </div>
        <LiveIndicator label="Live — auto-refreshing" />
      </div>
      <DataTable<RedemptionRow>
        data={displayedItems}
        columns={COLUMNS}
        total={data.total}
        page={data.page}
        limit={data.limit}
        totalPages={data.totalPages}
        loading={loading}
        searchPlaceholder="Search by code or member name…"
        filters={FILTERS}
        filterValues={query.filters}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        emptyIcon={<Ticket className="w-10 h-10" />}
        emptyTitle="No redemptions yet"
        emptyDescription="Redemptions will appear here when members redeem rewards."
        onQueryChange={handleQueryChange}
        onRowClick={setSelectedRow}
        rowKey={(r) => r.id}
      />

      {selectedRow && (
        <RedemptionDetailModal
          row={selectedRow}
          gymId={gymId}
          onClose={() => setSelectedRow(null)}
          onDone={handleActionDone}
        />
      )}
    </>
  );
}
