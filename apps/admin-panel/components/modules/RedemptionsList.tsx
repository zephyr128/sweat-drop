'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import {
  Ticket, Clock, CheckCircle2, XCircle, Droplet, User,
  Gift, Loader2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listRedemptions, type RedemptionRow } from '@/lib/actions/list-actions';
import { confirmRedemption, cancelRedemption } from '@/lib/actions/redemption-actions';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import type { PaginatedResult } from '@/lib/actions/list-helpers';

interface RedemptionsListProps {
  gymId: string;
  onActionComplete?: () => void;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 text-zinc-500 text-xs font-medium">
        <XCircle className="w-3.5 h-3.5" /> Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
      <Clock className="w-3.5 h-3.5" /> Pending
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const COLUMNS: ColumnDef<RedemptionRow>[] = [
  {
    key: 'redemption_code',
    label: 'Code',
    render: (row) => (
      <span className="font-mono text-[#00E5FF] text-sm tracking-wider">{row.redemption_code}</span>
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
      <span className="text-zinc-300">{row.reward_name || '—'}</span>
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
    render: (row) => <StatusBadge status={row.status} />,
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
    } catch (err: any) {
      toast.error(err.message);
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
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const statusColor =
    row.status === 'pending'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : row.status === 'confirmed'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : 'bg-zinc-800 text-zinc-500 border-zinc-700';

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
              <h3 className="text-base font-bold text-white">{row.reward_name || 'Redemption'}</h3>
              <p className="text-xs font-mono text-[#00E5FF] tracking-wider">{row.redemption_code}</p>
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
              {row.status}
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
              <p className="text-sm text-zinc-300">{row.reward_name || '—'}</p>
            </div>
          </div>

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
        {row.status === 'pending' && (
          <div className="flex gap-2 p-5 pt-0">
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
  );
}

export function RedemptionsList({ gymId, onActionComplete }: RedemptionsListProps) {
  const [data, setData] = useState<PaginatedResult<RedemptionRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc',
    filters: { status: 'all' },
  });
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
          status: (q.filters?.status as any) || 'all',
        },
      });
      if (result.success) setData(result.data);
    });
  }, [gymId]);

  useEffect(() => { fetchData(query); }, [query, fetchData]);

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

  return (
    <>
      <DataTable<RedemptionRow>
        data={data.items}
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
