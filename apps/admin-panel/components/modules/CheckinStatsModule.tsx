'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ShieldAlert, MapPin, Users, Calendar, TrendingUp } from 'lucide-react';
import { getGymCheckinStats, getGymCheckinsPaginated } from '@/lib/actions/gym-actions';
import { MemberAvatar } from '@/components/MemberAvatar';
import { DataTable, type ColumnDef, type FilterDef, type DataTableQuery } from '@/components/ui/DataTable';

interface Checkin {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  checked_in_at: string;
  drops_earned: number;
  gps_verified: boolean;
  gps_distance_m: number | null;
}

interface CheckinStatsModuleProps {
  gymId: string;
}

function GPSBadge({ verified, distance }: { verified: boolean; distance: number | null }) {
  if (distance === null) {
    return <span className="text-zinc-600 text-xs">N/A</span>;
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
        <Shield className="w-3 h-3" />
        {distance}m
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
      <ShieldAlert className="w-3 h-3" />
      {distance}m
    </span>
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const GPS_FILTER: FilterDef[] = [
  {
    key: 'gps',
    label: 'GPS',
    options: [
      { value: 'all', label: 'All check-ins' },
      { value: 'verified', label: 'GPS verified' },
      { value: 'unverified', label: 'GPS unverified' },
    ],
  },
];

export function CheckinStatsModule({ gymId }: CheckinStatsModuleProps) {
  const router = useRouter();
  const [stats, setStats] = useState<{ today: number; week: number; total: number } | null>(null);
  const [data, setData] = useState<{ items: Checkin[]; total: number; page: number; limit: number; totalPages: number }>({
    items: [],
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [query, setQuery] = useState<{ page: number; limit: number; gpsFilter: 'all' | 'verified' | 'unverified' }>({
    page: 1,
    limit: 25,
    gpsFilter: 'all',
  });

  useEffect(() => {
    getGymCheckinStats(gymId).then((res) => {
      if (res.success && res.data) setStats(res.data);
    });
  }, [gymId]);

  const fetchCheckins = useCallback(async () => {
    setTableLoading(true);
    const res = await getGymCheckinsPaginated(gymId, {
      page: query.page,
      limit: query.limit,
      gpsFilter: query.gpsFilter,
    });
    if (res.success && res.data) {
      setData(res.data);
    }
    setTableLoading(false);
    setLoading(false);
  }, [gymId, query]);

  useEffect(() => {
    fetchCheckins();
  }, [fetchCheckins]);

  const handleQueryChange = useCallback((q: DataTableQuery) => {
    setQuery((prev) => ({
      page: q.page ?? prev.page,
      limit: q.limit ?? prev.limit,
      gpsFilter: (q.filters?.gps as 'all' | 'verified' | 'unverified') ?? prev.gpsFilter,
    }));
  }, []);

  const columns: ColumnDef<Checkin>[] = useMemo(() => [
    {
      key: 'user',
      label: 'Member',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <MemberAvatar avatarUrl={row.avatar_url} username={row.username} size="sm" />
          <span className="text-sm text-white font-medium truncate max-w-[140px]">
            {row.username}
          </span>
        </div>
      ),
    },
    {
      key: 'checked_in_at',
      label: 'Time',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-zinc-400">{formatTime(row.checked_in_at)}</span>
      ),
    },
    {
      key: 'drops_earned',
      label: 'Drops',
      sortable: true,
      render: (row) =>
        row.drops_earned > 0 ? (
          <span className="text-sm text-[#00E5FF] font-semibold">+{row.drops_earned}</span>
        ) : (
          <span className="text-sm text-zinc-600">0</span>
        ),
    },
    {
      key: 'gps',
      label: 'GPS',
      render: (row) => <GPSBadge verified={row.gps_verified} distance={row.gps_distance_m} />,
    },
  ], []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-4 animate-pulse">
              <div className="h-6 bg-zinc-800/50 rounded w-12 mb-1" />
              <div className="h-3 bg-zinc-800/50 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-4 animate-pulse h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact KPI strip */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Calendar, label: 'Today', value: stats.today, accent: 'text-[#00E5FF]' },
            { icon: TrendingUp, label: 'This week', value: stats.week, accent: 'text-emerald-400' },
            { icon: Users, label: 'All time', value: stats.total, accent: 'text-zinc-300' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#111] flex items-center justify-center shrink-0">
                <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
              </div>
              <div>
                <div className={`text-lg font-bold ${kpi.accent}`}>{kpi.value.toLocaleString()}</div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider">{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Check-in table */}
      <DataTable
        data={data.items}
        columns={columns}
        total={data.total}
        page={data.page}
        limit={data.limit}
        totalPages={data.totalPages}
        loading={tableLoading}
        searchPlaceholder="Search members…"
        filters={GPS_FILTER}
        filterValues={{ gps: query.gpsFilter }}
        emptyIcon={<MapPin className="w-8 h-8" />}
        emptyTitle="No check-ins yet"
        emptyDescription="Check-ins will appear here once members start scanning the QR code."
        onQueryChange={handleQueryChange}
        onRowClick={(row) => router.push(`/dashboard/gym/${gymId}/members/${row.user_id}`)}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
