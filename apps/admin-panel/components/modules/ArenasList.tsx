'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import {
  Swords, Users, Calendar, Trophy, Globe, MapPin, Building2,
  CheckCircle2, XCircle, Flag, Droplet, Lock, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listArenas } from '@/lib/actions/list-actions';
import type { ArenaRow } from '@/lib/actions/list-helpers';
import { getArenaById, type Arena } from '@/lib/actions/arena-actions';
import type { PaginatedResult } from '@/lib/actions/list-helpers';
import { ArenaDetail } from './ArenaDetail';

interface ArenasListProps {
  gymId: string;
  isSuperadmin: boolean;
  onManage?: () => void;
}

const SCOPE_BADGE: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  local: { label: 'Local', icon: MapPin, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  regional: { label: 'Regional', icon: Building2, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  network: { label: 'Network', icon: Globe, color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

const SCORING_LABELS: Record<string, string> = {
  total_drops: 'Total Drops',
  days_visited: 'Days Visited',
  variety_score: 'Machine Variety',
  streak_days: 'Streak Days',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusInfo(row: ArenaRow) {
  if (row.is_finalized) {
    return { label: 'Finalized', color: 'bg-zinc-800 text-zinc-400 border-zinc-700/50', icon: Flag };
  }
  const now = new Date();
  const end = new Date(row.end_date + 'T23:59:59');
  const start = new Date(row.start_date + 'T00:00:00');
  if (now > end && !row.is_finalized) {
    return { label: 'Ended', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock };
  }
  if (row.is_active && now >= start) {
    return { label: 'Live', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 };
  }
  if (row.is_active && now < start) {
    return { label: 'Upcoming', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Calendar };
  }
  return { label: 'Inactive', color: 'bg-zinc-800 text-zinc-500 border-zinc-700/50', icon: XCircle };
}

function buildColumns(): ColumnDef<ArenaRow>[] {
  return [
    {
      key: 'name',
      label: 'Arena',
      sortable: true,
      render: (row) => {
        const scope = SCOPE_BADGE[row.arena_scope] || SCOPE_BADGE.local;
        const ScopeIcon = scope.icon;
        return (
          <div className="flex items-center gap-4 py-0.5">
            <div
              className="w-14 h-14 rounded-xl border border-zinc-700/50 flex items-center justify-center shrink-0"
              style={{
                background: row.card_color
                  ? `linear-gradient(135deg, ${row.card_color}, ${row.card_color}88)`
                  : 'rgba(39, 39, 42, 0.6)',
              }}
            >
              <Swords className="w-6 h-6" style={{ color: row.card_text_color || '#a1a1aa' }} />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{row.name}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${scope.color}`}>
                  <ScopeIcon className="w-2.5 h-2.5" />
                  {scope.label}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {SCORING_LABELS[row.scoring_model] || row.scoring_model}
                </span>
              </div>
              {row.sponsor_name && (
                <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                  <Building2 className="w-2.5 h-2.5" />
                  {row.sponsor_name}
                </p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'participant_count',
      label: 'Participants',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300">
          <Users className="w-3.5 h-3.5 text-zinc-500" />
          {row.participant_count ?? 0}
        </span>
      ),
    },
    {
      key: 'dates',
      label: 'Period',
      render: (row) => (
        <div className="text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-zinc-600" />
            {formatDate(row.start_date)} – {formatDate(row.end_date)}
          </span>
        </div>
      ),
    },
    {
      key: 'opt_in',
      label: 'Entry',
      render: (row) => {
        if (!row.opt_in_type || row.opt_in_type === 'free') {
          return <span className="text-xs text-emerald-400 font-medium">Free</span>;
        }
        return (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
            {row.opt_in_type === 'drops' ? (
              <><Droplet className="w-3 h-3" />{row.opt_in_value}</>
            ) : row.opt_in_type === 'streak' ? (
              <><Lock className="w-3 h-3" />{row.opt_in_value}d</>
            ) : (
              <><Lock className="w-3 h-3" />Lv.{row.opt_in_value}</>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const status = getStatusInfo(row);
        const StatusIcon = status.icon;
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}>
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
        );
      },
    },
  ];
}

const FILTERS: FilterDef[] = [
  {
    key: 'active',
    label: 'Status',
    options: [
      { value: 'all', label: 'All' },
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Ended' },
    ],
  },
];

export function ArenasList({ gymId, isSuperadmin, onManage }: ArenasListProps) {
  const [data, setData] = useState<PaginatedResult<ArenaRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc',
  });

  const [selectedArena, setSelectedArena] = useState<Arena | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const activeVal = q.filters?.active;
      const result = await listArenas(gymId, {
        q: q.q,
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortDir: q.sortDir,
        filters: {
          active: activeVal === 'true' ? true : activeVal === 'false' ? false : 'all',
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

  const handleRowClick = useCallback(async (row: ArenaRow) => {
    setDetailLoading(true);
    const result = await getArenaById(row.id);
    setDetailLoading(false);
    if (result.success && result.data) {
      setSelectedArena(result.data);
    } else {
      toast.error(result.error || 'Failed to load arena details');
    }
  }, []);

  const columns = buildColumns();

  if (selectedArena) {
    return (
      <ArenaDetail
        arena={selectedArena}
        isSuperadmin={isSuperadmin}
        viewingGymId={gymId}
        onBack={() => {
          setSelectedArena(null);
          fetchData(query);
        }}
      />
    );
  }

  return (
    <div>
      {onManage && (
        <div className="flex justify-end mb-4">
          <button
            onClick={onManage}
            className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium hover:bg-[#00E5FF]/90 transition-colors"
          >
            + Create Arena
          </button>
        </div>
      )}

      {detailLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-sm text-zinc-400">Loading arena details…</span>
        </div>
      )}

      {!detailLoading && (
        <DataTable<ArenaRow>
          data={data.items}
          columns={columns}
          total={data.total}
          page={data.page}
          limit={data.limit}
          totalPages={data.totalPages}
          loading={loading}
          searchPlaceholder="Search arenas…"
          filters={FILTERS}
          filterValues={query.filters}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          emptyIcon={<Swords className="w-10 h-10" />}
          emptyTitle="No arenas yet"
          emptyDescription="Create an arena competition or accept an invitation."
          emptyCTA={
            onManage ? (
              <button onClick={onManage} className="mt-2 px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium">
                + Create Arena
              </button>
            ) : undefined
          }
          onQueryChange={handleQueryChange}
          onRowClick={handleRowClick}
          rowKey={(r) => r.id}
          cardRows
        />
      )}
    </div>
  );
}
