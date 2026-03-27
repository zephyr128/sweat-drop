'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Droplet, Flame, Clock, AlertTriangle, TrendingDown } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listMembers, type MemberRow } from '@/lib/actions/list-actions';
import { MemberAvatar } from '@/components/MemberAvatar';
import { RetentionStats } from './RetentionStats';
import type { PaginatedResult } from '@/lib/actions/list-helpers';

interface MembersPageTabsProps {
  gymId: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMemberStatus(lastVisit: string | null): 'active' | 'at_risk' | 'churned' {
  if (!lastVisit) return 'churned';
  const days = Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24));
  if (days >= 30) return 'churned';
  if (days >= 7) return 'at_risk';
  return 'active';
}

function StatusBadge({ status }: { status: 'active' | 'at_risk' | 'churned' }) {
  if (status === 'at_risk') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <AlertTriangle className="w-3 h-3" />
        At Risk
      </span>
    );
  }
  if (status === 'churned') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <TrendingDown className="w-3 h-3" />
        Churned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
      Active
    </span>
  );
}

const MEMBER_COLUMNS: ColumnDef<MemberRow>[] = [
  {
    key: 'username',
    label: 'Member',
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-3">
        <MemberAvatar username={row.username} avatarUrl={row.avatar_url} size="sm" />
        <div>
          <p className="text-white font-medium">{row.username || 'Unknown'}</p>
          <p className="text-zinc-500 text-xs">{row.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <StatusBadge status={getMemberStatus(row.last_visit_date)} />,
  },
  {
    key: 'total_drops',
    label: 'Drops',
    sortable: true,
    className: 'text-right',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="flex items-center justify-end gap-1 text-[#00E5FF]">
        <Droplet className="w-3.5 h-3.5" />
        {row.total_drops?.toLocaleString() ?? 0}
      </span>
    ),
  },
  {
    key: 'streak_days',
    label: 'Streak',
    sortable: true,
    className: 'text-right',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="flex items-center justify-end gap-1 text-amber-400">
        <Flame className="w-3.5 h-3.5" />
        {row.streak_days ?? 0}d
      </span>
    ),
  },
  {
    key: 'last_visit_date',
    label: 'Last Visit',
    sortable: true,
    render: (row) => (
      <span className="flex items-center gap-1.5 text-zinc-400">
        <Clock className="w-3.5 h-3.5" />
        {formatDate(row.last_visit_date)}
      </span>
    ),
  },
  {
    key: 'created_at',
    label: 'Joined',
    sortable: true,
    render: (row) => <span className="text-zinc-500">{formatDate(row.joined_at)}</span>,
  },
];

const MEMBER_FILTERS: FilterDef[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All members' },
      { value: 'active', label: 'Active (7d)' },
      { value: 'at_risk', label: 'At Risk (7-30d)' },
      { value: 'churned', label: 'Churned (30d+)' },
    ],
  },
];

export function MembersPageTabs({ gymId }: MembersPageTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [fullData, setFullData] = useState<PaginatedResult<MemberRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    q: searchParams.get('q') || '',
    page: Number(searchParams.get('page')) || 1,
    limit: Number(searchParams.get('limit')) || 25,
    sortBy: searchParams.get('sortBy') || 'created_at',
    sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
    filters: {
      status: searchParams.get('status') || 'all',
    },
  });

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const result = await listMembers(gymId, {
        q: q.q,
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortDir: q.sortDir,
      });
      if (result.success) {
        const statusFilter = q.filters?.status;
        if (statusFilter && statusFilter !== 'all') {
          const filtered = result.data.items.filter((m) => getMemberStatus(m.last_visit_date) === statusFilter);
          setFullData({
            ...result.data,
            items: filtered,
            total: filtered.length,
            totalPages: 1,
          });
        } else {
          setFullData(result.data);
        }
      }
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

  const handleRowClick = useCallback((row: MemberRow) => {
    router.push(`/dashboard/gym/${gymId}/members/${row.id}`);
  }, [router, gymId]);

  return (
    <div>
      <RetentionStats gymId={gymId} />

      <DataTable<MemberRow>
        data={fullData.items}
        columns={MEMBER_COLUMNS}
        total={fullData.total}
        page={fullData.page}
        limit={fullData.limit}
        totalPages={fullData.totalPages}
        loading={loading}
        searchPlaceholder="Search members by name or email…"
        filters={MEMBER_FILTERS}
        filterValues={query.filters}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        emptyIcon={<Users className="w-10 h-10" />}
        emptyTitle="No members found"
        emptyDescription="Members appear here once they join your gym."
        onQueryChange={handleQueryChange}
        onRowClick={handleRowClick}
        rowKey={(r) => r.id}
      />
    </div>
  );
}
