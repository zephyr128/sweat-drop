'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, CheckCircle2, XCircle, Wrench, Bluetooth, Activity } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listMachines } from '@/lib/actions/list-actions';
import type { MachineRow } from '@/lib/actions/list-helpers';
import type { PaginatedResult } from '@/lib/actions/list-helpers';

interface MachinesListProps {
  gymId: string;
  userRole: string;
  onManage?: () => void;
}

function MachineStatus({ row }: { row: MachineRow }) {
  if (row.is_under_maintenance) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
        <Wrench className="w-3.5 h-3.5" /> Maintenance
      </span>
    );
  }
  if (!row.is_active) {
    return (
      <span className="inline-flex items-center gap-1 text-zinc-500 text-xs font-medium">
        <XCircle className="w-3.5 h-3.5" /> Inactive
      </span>
    );
  }
  if (row.is_busy) {
    return (
      <span className="inline-flex items-center gap-1 text-[#00E5FF] text-xs font-medium">
        <Activity className="w-3.5 h-3.5" /> In use
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
    </span>
  );
}

const COLUMNS: ColumnDef<MachineRow>[] = [
  {
    key: 'name',
    label: 'Machine',
    sortable: true,
    render: (row) => (
      <div>
        <p className="text-white font-medium">{row.name}</p>
        <p className="text-zinc-500 text-xs capitalize">{row.type}{row.zone ? ` · ${row.zone}` : ''}</p>
      </div>
    ),
  },
  {
    key: 'type',
    label: 'Type',
    sortable: true,
    render: (row) => <span className="text-zinc-400 capitalize text-sm">{row.type}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <MachineStatus row={row} />,
  },
  {
    key: 'sensor',
    label: 'Sensor',
    render: (row) =>
      row.sensor_id ? (
        <span className="inline-flex items-center gap-1 text-[#00E5FF] text-xs">
          <Bluetooth className="w-3.5 h-3.5" />
          {row.protocol_verified ? 'Verified' : 'Paired'}
        </span>
      ) : (
        <span className="text-zinc-600 text-xs">—</span>
      ),
  },
  {
    key: 'created_at',
    label: 'Added',
    sortable: true,
    render: (row) => (
      <span className="text-zinc-500 text-xs">
        {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    ),
  },
];

const FILTERS: FilterDef[] = [
  {
    key: 'type',
    label: 'Type',
    options: [
      { value: 'all', label: 'All types' },
      { value: 'treadmill', label: 'Treadmill' },
      { value: 'bike', label: 'Bike' },
    ],
  },
];

export function MachinesList({ gymId, userRole, onManage }: MachinesListProps) {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResult<MachineRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'name', sortDir: 'asc',
  });

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const result = await listMachines(gymId, {
        q: q.q,
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortDir: q.sortDir,
        filters: {
          type: q.filters?.type !== 'all' ? q.filters?.type : undefined,
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

  const handleRowClick = useCallback((row: MachineRow) => {
    router.push(`/dashboard/gym/${gymId}/machines/${row.id}`);
  }, [router, gymId]);

  return (
    <div>
      {onManage && (
        <div className="flex justify-end mb-4">
          <button
            onClick={onManage}
            className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium hover:bg-[#00E5FF]/90 transition-colors"
          >
            + Add Machine
          </button>
        </div>
      )}
      <DataTable<MachineRow>
        data={data.items}
        columns={COLUMNS}
        total={data.total}
        page={data.page}
        limit={data.limit}
        totalPages={data.totalPages}
        loading={loading}
        searchPlaceholder="Search machines by name, zone, or QR…"
        filters={FILTERS}
        filterValues={query.filters}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        emptyIcon={<Cpu className="w-10 h-10" />}
        emptyTitle="No machines yet"
        emptyDescription="Register your first machine to start tracking workouts."
        onQueryChange={handleQueryChange}
        onRowClick={handleRowClick}
        rowKey={(r) => r.id}
      />
    </div>
  );
}
