'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  PackageCheck,
  Package,
  ShieldAlert,
  CheckCircle,
  Clock,
  ClipboardCopy,
  Loader2,
  Trophy,
  FileText,
  X,
} from 'lucide-react';
import {
  getArenaFulfillmentManifest,
  markRedemptionFulfilled,
  type FulfillmentRow,
} from '@/lib/actions/redemption-fulfillment-actions';
import { formatDateTime } from '@/lib/utils/date';

type FilterChip = 'all' | 'awaiting_shipment' | 'ready' | 'collected';

function getRowFilter(row: FulfillmentRow): FilterChip {
  if (row.confirmed_at) return 'collected';
  if (row.fulfilled_at) return 'ready';
  return 'awaiting_shipment';
}

function StatusBadge({ row }: { row: FulfillmentRow }) {
  if (row.confirmed_at) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20">
        <CheckCircle className="w-3 h-3" />
        Collected
      </span>
    );
  }
  if (row.status === 'pending_verification') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <ShieldAlert className="w-3 h-3" />
        Needs verification
      </span>
    );
  }
  if (row.fulfilled_at) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <PackageCheck className="w-3 h-3" />
        Ready to collect
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
      <Package className="w-3 h-3" />
      Awaiting shipment
    </span>
  );
}

interface MarkFulfilledDialogProps {
  row: FulfillmentRow;
  onClose: () => void;
  onSuccess: () => void;
}

function MarkFulfilledDialog({ row, onClose, onSuccess }: MarkFulfilledDialogProps) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const res = await markRedemptionFulfilled(row.redemption_id, notes.trim() || undefined);
    if (res.success) {
      toast.success('Prize marked as received — winner will be notified.');
      onSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Failed to mark as received');
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-[#00E5FF]" />
            <h2 className="text-sm font-semibold text-white">Mark Prize Received</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-[#111] border border-[#1A1A1A] rounded-lg p-3 space-y-1">
            <p className="text-xs text-zinc-500">Winner</p>
            <p className="text-sm font-medium text-white">{row.username}</p>
            <p className="text-xs text-zinc-400">{row.prize_description}</p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
              <FileText className="w-3 h-3" />
              Notes (optional, max 280 chars)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="e.g. Handed over by reception staff on Apr 17"
              className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none transition-colors resize-none"
            />
            <p className="text-[10px] text-zinc-600 mt-1 text-right">{notes.length}/280</p>
          </div>

          <p className="text-xs text-zinc-500">
            The winner will receive a push notification once you confirm.
          </p>
        </div>

        <div className="flex items-center gap-3 px-5 py-4 border-t border-[#1A1A1A]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 bg-[#1A1A1A] border border-[#333] rounded-lg hover:bg-[#222] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-bold bg-[#00E5FF] text-black rounded-lg hover:bg-[#00B8CC] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
            Confirm received
          </button>
        </div>
      </div>
    </div>
  );
}

interface ArenaFulfillmentTableProps {
  arenaId: string;
  arenaName: string;
  isSuperAdmin: boolean;
}

export function ArenaFulfillmentTable({
  arenaId,
  arenaName,
  isSuperAdmin,
}: ArenaFulfillmentTableProps) {
  const [rows, setRows] = useState<FulfillmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [markRow, setMarkRow] = useState<FulfillmentRow | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const res = await getArenaFulfillmentManifest(arenaId);
    if (res.success && res.data) {
      setRows(res.data);
    } else {
      toast.error(res.error || 'Failed to load fulfillment data');
    }
    setLoading(false);
  }, [arenaId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => getRowFilter(r) === filter);

  const counts: Record<FilterChip, number> = {
    all: rows.length,
    awaiting_shipment: rows.filter((r) => getRowFilter(r) === 'awaiting_shipment').length,
    ready: rows.filter((r) => getRowFilter(r) === 'ready').length,
    collected: rows.filter((r) => getRowFilter(r) === 'collected').length,
  };

  const CHIPS: { id: FilterChip; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'awaiting_shipment', label: 'Awaiting shipment' },
    { id: 'ready', label: 'Ready to collect' },
    { id: 'collected', label: 'Collected' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-12 text-center">
        <Trophy className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-white font-semibold">No redemptions yet</p>
        <p className="text-zinc-500 text-sm mt-1">
          Fulfillment rows will appear once {arenaName} is finalized.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => setFilter(chip.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === chip.id
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#1A1A1A] text-[#808080] hover:text-white border border-[#333]'
            }`}
          >
            {chip.label}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              filter === chip.id ? 'bg-black/20 text-black' : 'bg-[#0A0A0A] text-zinc-500'
            }`}>
              {counts[chip.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider w-10">#</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Winner</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Prize</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Target gym</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Code</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#111]">
              {filtered.map((row) => {
                const canMark =
                  !row.fulfilled_at &&
                  !row.confirmed_at &&
                  (row.status === 'pending' || row.status === 'pending_verification');

                return (
                  <tr key={row.redemption_id} className="hover:bg-[#111] transition-colors">
                    {/* Rank */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-bold text-zinc-400">{row.rank}</span>
                    </td>

                    {/* Winner */}
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{row.username}</p>
                      {isSuperAdmin && row.full_name && (
                        <p className="text-xs text-zinc-500">{row.full_name}</p>
                      )}
                    </td>

                    {/* Prize */}
                    <td className="px-4 py-3">
                      <p className="text-zinc-300 text-xs max-w-[200px] truncate">{row.prize_description}</p>
                    </td>

                    {/* Target gym */}
                    <td className="px-4 py-3">
                      <p className="text-zinc-300 text-xs">{row.gym_name}</p>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                      {row.fulfilled_at && !row.confirmed_at && (
                        <p className="text-[10px] text-zinc-600 mt-1">
                          Received {formatDateTime(row.fulfilled_at)}
                        </p>
                      )}
                    </td>

                    {/* Redemption code */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono text-[#00E5FF] bg-[#111] border border-[#1A1A1A] px-2 py-1 rounded select-all">
                          {row.redemption_code}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(row.redemption_code);
                            toast.success('Code copied');
                          }}
                          className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                          title="Copy code"
                        >
                          <ClipboardCopy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      {row.confirmed_at ? (
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-600">Collected</span>
                          <p className="text-[10px] text-zinc-700">{formatDateTime(row.confirmed_at)}</p>
                        </div>
                      ) : canMark ? (
                        <button
                          onClick={() => setMarkRow(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00E5FF]/10 border border-[#00E5FF]/20 text-[#00E5FF] rounded-lg text-xs font-medium hover:bg-[#00E5FF]/20 transition-colors"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Mark received
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-600 flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {row.fulfilled_at ? formatDateTime(row.fulfilled_at) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark fulfilled dialog */}
      {markRow && (
        <MarkFulfilledDialog
          row={markRow}
          onClose={() => setMarkRow(null)}
          onSuccess={fetchRows}
        />
      )}
    </>
  );
}
