'use client';

import { useState, useCallback, useEffect, useTransition, useMemo } from 'react';
import { Droplet, ShoppingBag, CheckCircle2, XCircle, Power } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listStoreItems } from '@/lib/actions/list-actions';
import type { StoreItemRow } from '@/lib/actions/list-helpers';
import { toggleStoreItemActive } from '@/lib/actions/store-actions';
import type { PaginatedResult } from '@/lib/actions/list-helpers';
import { StoreManager, type StoreItem } from './StoreManager';

interface StoreRewardsListProps {
  gymId: string;
}

const REWARD_TYPE_LABELS: Record<string, string> = {
  coffee: 'Coffee / Drink',
  protein_snack: 'Protein Snack',
  day_pass: 'Day Pass',
  pt_intro: 'PT Intro',
  merch_small: 'Merch Small',
  merch_premium: 'Merch Premium',
  membership: 'Membership',
  physical: 'Other',
};

const STORE_FILTERS: FilterDef[] = [
  {
    key: 'active',
    label: 'Status',
    options: [
      { value: 'all', label: 'All status' },
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Inactive' },
    ],
  },
];

function storeItemRowToStoreItem(row: StoreItemRow): StoreItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price_drops: row.price_drops,
    stock: row.stock,
    image_url: row.image_url,
    is_active: row.is_active,
    reward_type: row.reward_type,
    redemption_limit: row.redemption_limit,
    sponsor_name: row.sponsor_name,
    available_from: row.available_from,
    available_until: row.available_until,
    price_calc_mode: row.price_calc_mode,
    base_price_rsd: row.base_price_rsd,
    discount_percent: row.discount_percent,
  };
}

function ActiveToggle({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`p-1.5 rounded-lg transition-colors ${
        isActive
          ? 'text-[#00E5FF] hover:bg-[#00E5FF]/10'
          : 'text-zinc-600 hover:bg-zinc-800'
      }`}
      title={isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
    >
      <Power className="w-4 h-4" />
    </button>
  );
}

export function StoreRewardsList({ gymId }: StoreRewardsListProps) {
  const [data, setData] = useState<PaginatedResult<StoreItemRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc',
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<StoreItem | null>(null);
  const [modalKey, setModalKey] = useState(0);

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const activeFilter = q.filters?.active;
      const result = await listStoreItems(gymId, {
        q: q.q,
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortDir: q.sortDir,
        filters: {
          active: activeFilter === 'true' ? true : activeFilter === 'false' ? false : 'all',
        },
      });
      if (result.success) setData(result.data);
    });
  }, [gymId]);

  useEffect(() => { fetchData(query); }, [query, fetchData]);

  const handleToggleActive = useCallback(async (row: StoreItemRow) => {
    const newState = !row.is_active;
    setData((prev) => ({
      ...prev,
      items: prev.items.map((r) =>
        r.id === row.id ? { ...r, is_active: newState } : r
      ),
    }));

    const res = await toggleStoreItemActive(row.id, gymId, newState);
    if (res.success) {
      toast.success(newState ? 'Reward activated' : 'Reward deactivated');
    } else {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((r) =>
          r.id === row.id ? { ...r, is_active: !newState } : r
        ),
      }));
      toast.error(res.error || 'Failed to update');
    }
  }, [gymId]);

  const columns: ColumnDef<StoreItemRow>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Reward',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-4">
          {row.image_url ? (
            <img src={row.image_url} alt="" className="w-14 h-14 rounded-xl object-cover bg-zinc-800 shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6 text-zinc-600" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{row.name}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{REWARD_TYPE_LABELS[row.reward_type] || row.reward_type}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'price_drops',
      label: 'Price',
      sortable: true,
      render: (row) => (
        <div>
          <span className="inline-flex items-center gap-1 text-[#00E5FF] font-semibold">
            <Droplet className="w-3.5 h-3.5" />
            {row.price_drops?.toLocaleString()}
          </span>
          {row.discount_percent && row.discount_percent > 0 ? (
            <p className="text-[10px] text-violet-400 mt-0.5">-{row.discount_percent}% off</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'stock',
      label: 'Stock',
      render: (row) => (
        <span className="text-zinc-400 font-medium">
          {row.stock === null || row.stock === undefined ? '∞' : row.stock}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (row) => (
        <ActiveToggle
          isActive={row.is_active}
          onToggle={() => handleToggleActive(row)}
        />
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => (
        <span className="text-zinc-500 text-xs">
          {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
  ], [handleToggleActive]);

  const handleQueryChange = useCallback((update: DataTableQuery) => {
    setQuery((prev) => {
      const next = { ...prev, ...update };
      if (update.filters) next.filters = { ...prev.filters, ...update.filters };
      return next;
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditItem(null);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: StoreItemRow) => {
    setEditItem(storeItemRowToStoreItem(row));
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setEditItem(null);
  }, []);

  const handleSaved = useCallback(() => {
    fetchData(query);
  }, [fetchData, query]);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium hover:bg-[#00E5FF]/90 transition-colors"
        >
          + Add Reward
        </button>
      </div>

      <DataTable<StoreItemRow>
        data={data.items}
        columns={columns}
        total={data.total}
        page={data.page}
        limit={data.limit}
        totalPages={data.totalPages}
        loading={loading}
        searchPlaceholder="Search rewards by name…"
        filters={STORE_FILTERS}
        filterValues={query.filters}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        emptyIcon={<ShoppingBag className="w-10 h-10" />}
        emptyTitle="No rewards yet"
        emptyDescription="Create your first reward so members can redeem drops."
        emptyCTA={
          <button
            onClick={openCreate}
            className="mt-2 px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium"
          >
            + Add Reward
          </button>
        }
        onQueryChange={handleQueryChange}
        onRowClick={openEdit}
        rowKey={(r) => r.id}
      />

      <StoreManager
        key={modalKey}
        gymId={gymId}
        initialItems={[]}
        modalOnly
        externalOpen={modalOpen}
        externalEditItem={editItem}
        onModalClose={handleModalClose}
        onSaved={handleSaved}
      />
    </div>
  );
}
