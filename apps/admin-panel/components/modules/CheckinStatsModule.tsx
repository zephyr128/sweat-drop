'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  MapPin,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  Wifi,
  WifiOff,
  Info,
} from 'lucide-react';
import { getGymCheckinStats, getGymCheckinsPaginated } from '@/lib/actions/gym-actions';
import { supabase } from '@/lib/supabase-client';
import { MemberAvatar } from '@/components/MemberAvatar';
import { MemberIdentityVerifyDrawer } from '@/components/modules/MemberIdentityVerifyDrawer';
import { LiveIndicator } from '@/components/ui/LiveIndicator';
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
  identity_verified: boolean;
}

interface CheckinStatsModuleProps {
  gymId: string;
  checkinVerificationMode?: 'lenient' | 'strict';
  configuredCheckinDrops?: number;
  readOnly?: boolean;
}

function GPSBadge({ verified, distance }: { verified: boolean; distance: number | null }) {
  if (verified) {
    return (
      <span className="inline-flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">
          <Shield className="w-3 h-3" />
          GPS OK
        </span>
        {distance !== null ? (
          <span className="text-[11px] text-emerald-400/80 tabular-nums">{distance} m</span>
        ) : (
          <span className="text-[10px] text-zinc-600">inside radius</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
        <ShieldAlert className="w-3 h-3" />
        Not verified
      </span>
      {distance !== null ? (
        <span className="text-[11px] text-zinc-500 tabular-nums" title="Reported distance to gym pin">
          {distance} m
        </span>
      ) : (
        <span className="text-[10px] text-zinc-600">no fix / not shared</span>
      )}
    </span>
  );
}

function IdentityBadge({
  verified,
  onClick,
  disabled = false,
}: {
  verified: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
        <ShieldCheck className="w-2.5 h-2.5" />
        Verified
      </span>
    );
  }
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 bg-zinc-500/10 px-2 py-0.5 rounded-full border border-zinc-500/20">
        <Clock className="w-2.5 h-2.5" />
        Needs verification
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
    >
      <Clock className="w-2.5 h-2.5" />
      Verify
    </button>
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

export function CheckinStatsModule({
  gymId,
  checkinVerificationMode = 'lenient',
  configuredCheckinDrops,
  readOnly = false,
}: CheckinStatsModuleProps) {
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

  // Verify drawer state
  const [verifyTarget, setVerifyTarget] = useState<{ userId: string; username: string; avatarUrl: string | null } | null>(null);

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

  // Realtime subscription for instant check-in alerts
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const realtimeRef = useRef(false);

  useEffect(() => {
    const channel = supabase
      .channel(`checkins:${gymId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gym_checkins',
          filter: `gym_id=eq.${gymId}`,
        },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          const userId = row.user_id as string;

          // Fetch full data to get username + identity status
          await fetchCheckins();
          getGymCheckinStats(gymId).then((res) => {
            if (res.success && res.data) setStats(res.data);
          });

          // Find the newly checked-in member from refreshed data
          const member = data.items.find((i) => i.user_id === userId);
          const name = member?.username || 'A member';

          if (member && !member.identity_verified) {
            toast.warning(`Unverified member: ${name}`, {
              description: 'Identity verification required.',
              icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
              duration: 10000,
              action: readOnly
                ? undefined
                : {
                    label: 'Verify now',
                    onClick: () =>
                      setVerifyTarget({
                        userId: member.user_id,
                        username: member.username,
                        avatarUrl: member.avatar_url,
                      }),
                  },
            });
          } else {
            toast(`Check-in: ${name}`, {
              icon: <MapPin className="w-4 h-4 text-[#00E5FF]" />,
              duration: 4000,
            });
          }
        },
      )
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        setRealtimeConnected(connected);
        realtimeRef.current = connected;
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  // Fallback polling every 30s when realtime is disconnected
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (realtimeConnected) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      fetchCheckins();
      getGymCheckinStats(gymId).then((res) => {
        if (res.success && res.data) setStats(res.data);
      });
    }, 30_000);
    return () => clearInterval(pollRef.current);
  }, [fetchCheckins, gymId, realtimeConnected]);

  const handleQueryChange = useCallback((q: DataTableQuery) => {
    setQuery((prev) => ({
      page: q.page ?? prev.page,
      limit: q.limit ?? prev.limit,
      gpsFilter: (q.filters?.gps as 'all' | 'verified' | 'unverified') ?? prev.gpsFilter,
    }));
  }, []);

  const handleVerified = useCallback((userId: string) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.user_id === userId ? { ...item, identity_verified: true } : item,
      ),
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
      label: 'Awarded',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          {row.drops_earned > 0 ? (
            <span className="text-sm text-[#00E5FF] font-semibold tabular-nums">+{row.drops_earned}</span>
          ) : (
            <span className="text-sm text-zinc-600 tabular-nums">0</span>
          )}
          <span className="text-[9px] text-zinc-600 leading-tight">drops minted</span>
        </div>
      ),
    },
    {
      key: 'gps',
      label: 'Location',
      render: (row) => <GPSBadge verified={row.gps_verified} distance={row.gps_distance_m} />,
    },
    {
      key: 'identity',
      label: 'Identity',
      render: (row) => (
        <IdentityBadge
          verified={row.identity_verified}
          disabled={readOnly}
          onClick={(e) => {
            if (readOnly) return;
            e.stopPropagation();
            setVerifyTarget({ userId: row.user_id, username: row.username, avatarUrl: row.avatar_url });
          }}
        />
      ),
    },
  ], [readOnly]);

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
      <div className="flex gap-3 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] px-4 py-3">
        <Info className="w-4 h-4 text-[#00E5FF] shrink-0 mt-0.5" />
        <div className="text-[11px] text-zinc-500 leading-relaxed space-y-2">
          <p>
            <span className="text-zinc-400">Awarded</span> is drops credited for that check-in.{' '}
            <span className="text-zinc-400">Location</span> shows whether the member was inside your GPS radius when
            they scanned; lenient mode can still award full drops when this reads “Not verified”.
          </p>
          {readOnly && (
            <p className="text-zinc-600">
              Reception mode: identity status is visible here, but verification edits are disabled.
            </p>
          )}
          {typeof configuredCheckinDrops === 'number' && configuredCheckinDrops >= 0 && (
            <p className="text-zinc-600">
              Configured check-in amount:{' '}
              <span className="text-zinc-400 tabular-nums">{configuredCheckinDrops}</span> drops (see Check-in Settings).
            </p>
          )}
          {checkinVerificationMode === 'strict' && (
            <p className="text-amber-400/85">
              Strict GPS is on: failed attempts (no location, outside radius, or verification errors) do not create a row
              here — only successful check-ins appear.
            </p>
          )}
        </div>
      </div>

      {/* Live indicator with connection status */}
      <div className="flex items-center justify-end gap-2">
        {realtimeConnected ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
            <Wifi className="w-3 h-3" />
            Realtime
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
            <WifiOff className="w-3 h-3" />
            Polling
          </span>
        )}
        <LiveIndicator label="Live" />
      </div>

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

      {/* Verify drawer/modal */}
      {verifyTarget && (
        <MemberIdentityVerifyDrawer
          gymId={gymId}
          userId={verifyTarget.userId}
          username={verifyTarget.username}
          avatarUrl={verifyTarget.avatarUrl}
          onClose={() => setVerifyTarget(null)}
          onVerified={handleVerified}
        />
      )}
    </div>
  );
}
