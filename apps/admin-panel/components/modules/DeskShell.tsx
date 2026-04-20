'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  Wifi,
  WifiOff,
  Ticket,
  Package,
  PackageCheck,
} from 'lucide-react';
import { getGymCheckinStats, getGymCheckinsPaginated } from '@/lib/actions/gym-actions';
import { supabase } from '@/lib/supabase-client';
import { MemberAvatar } from '@/components/MemberAvatar';
import { MemberIdentityVerifyDrawer } from '@/components/modules/MemberIdentityVerifyDrawer';
import { RedemptionVerifier } from '@/components/modules/RedemptionVerifier';
import { RedemptionsList } from '@/components/modules/RedemptionsList';
import { UnverifiedCheckinsModal } from '@/components/modules/UnverifiedCheckinsModal';
import { LiveIndicator } from '@/components/ui/LiveIndicator';
import { getRedemptionKpiCounts } from '@/lib/actions/redemption-actions';
import type { RedemptionKpiCounts } from '@/lib/actions/redemption-actions';

interface DeskShellProps {
  gymId: string;
}

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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(dateStr: string): string {
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

type FulfillmentFilter = 'all' | 'awaiting_shipment' | 'ready_to_collect';

export function DeskShell({ gymId }: DeskShellProps) {
  const router = useRouter();
  const [stats, setStats] = useState<{ today: number; week: number; total: number } | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [redemptionKpi, setRedemptionKpi] = useState<RedemptionKpiCounts>({
    pending: 0, awaitingShipment: 0, readyToCollect: 0,
  });

  // Lifted from RedemptionsList so KPI cards can drive it
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('all');

  // Unverified quick-verify modal
  const [unverifiedModalOpen, setUnverifiedModalOpen] = useState(false);

  const [verifyTarget, setVerifyTarget] = useState<{
    userId: string;
    username: string;
    avatarUrl: string | null;
  } | null>(null);

  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const dataRef = useRef<Checkin[]>([]);

  // Ref for smooth scroll-to-queue on Awaiting/Ready KPI click
  const queueRef = useRef<HTMLDivElement | null>(null);

  const scrollIntoView = (el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // KPI click handlers — each is a single, obvious action
  const handleClickAwaiting = useCallback(() => {
    setFulfillmentFilter('awaiting_shipment');
    scrollIntoView(queueRef.current);
  }, []);
  const handleClickReady = useCallback(() => {
    setFulfillmentFilter('ready_to_collect');
    scrollIntoView(queueRef.current);
  }, []);
  const handleClickUnverified = useCallback(() => {
    setUnverifiedModalOpen(true);
  }, []);
  const handleClickToday = useCallback(() => {
    router.push(`/dashboard/gym/${gymId}/checkin`);
  }, [router, gymId]);

  const fetchCheckins = useCallback(async () => {
    const res = await getGymCheckinsPaginated(gymId, { page: 1, limit: 10, gpsFilter: 'all' });
    if (res.success && res.data) {
      setCheckins(res.data.items);
      dataRef.current = res.data.items;
    }
    setLoading(false);
  }, [gymId]);

  const fetchStats = useCallback(async () => {
    const res = await getGymCheckinStats(gymId);
    if (res.success && res.data) setStats(res.data);
  }, [gymId]);

  const fetchPendingRedemptions = useCallback(async () => {
    const counts = await getRedemptionKpiCounts(gymId);
    setRedemptionKpi(counts);
  }, [gymId]);

  // After any action in the queue (Mark as received / Confirm / Cancel) the
  // row's state often no longer matches the active fulfillment filter, which
  // makes it look like rows "disappear". Reset filter + refetch counts so the
  // receptionist always sees a fresh, complete queue.
  const handleRedemptionActionComplete = useCallback(() => {
    setFulfillmentFilter('all');
    fetchPendingRedemptions();
  }, [fetchPendingRedemptions]);

  useEffect(() => {
    fetchCheckins();
    fetchStats();
    fetchPendingRedemptions();
  }, [fetchCheckins, fetchStats, fetchPendingRedemptions]);

  // Realtime check-in alerts with unverified-member detection
  useEffect(() => {
    const channel = supabase
      .channel(`desk-checkins:${gymId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gym_checkins',
          filter: `gym_id=eq.${gymId}`,
        },
        () => {
          fetchCheckins().then(() => {
            const latest = dataRef.current[0];
            if (!latest) return;

            if (!latest.identity_verified) {
              toast.warning(
                `Unverified member: ${latest.username}`,
                {
                  description: 'New check-in — identity verification required.',
                  icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
                  duration: 10000,
                  action: {
                    label: 'Verify now',
                    onClick: () =>
                      setVerifyTarget({
                        userId: latest.user_id,
                        username: latest.username,
                        avatarUrl: latest.avatar_url,
                      }),
                  },
                },
              );
            } else {
              toast(`Check-in: ${latest.username}`, {
                icon: <MapPin className="w-4 h-4 text-[#00E5FF]" />,
                duration: 4000,
              });
            }
          });
          fetchStats();
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  // Polling fallback
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (realtimeConnected) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      fetchCheckins();
      fetchStats();
      fetchPendingRedemptions();
    }, 30_000);
    return () => clearInterval(pollRef.current);
  }, [realtimeConnected, fetchCheckins, fetchStats, fetchPendingRedemptions]);

  const handleVerified = useCallback((userId: string) => {
    setCheckins((prev) =>
      prev.map((c) => (c.user_id === userId ? { ...c, identity_verified: true } : c)),
    );
  }, []);

  const unverifiedCount = checkins.filter((c) => !c.identity_verified).length;

  return (
    <div className="space-y-5">
      {/* ── Top: KPI Row — every card is a one-click shortcut to its job ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPICard
          icon={Calendar}
          label="Today"
          value={stats?.today ?? 0}
          accent="text-[#00E5FF]"
          loading={loading}
          onClick={handleClickToday}
          hint="Open full check-in log"
        />
        <KPICard
          icon={TrendingUp}
          label="This Week"
          value={stats?.week ?? 0}
          accent="text-emerald-400"
          loading={loading}
          onClick={handleClickToday}
          hint="Open full check-in log"
        />
        <KPICard
          icon={Package}
          label="Awaiting shipment"
          value={redemptionKpi.awaitingShipment}
          accent={redemptionKpi.awaitingShipment > 0 ? 'text-blue-400' : 'text-zinc-400'}
          loading={loading}
          onClick={handleClickAwaiting}
          hint="Prizes that have arrived at the gym — click to mark received"
          active={fulfillmentFilter === 'awaiting_shipment'}
          disabled={redemptionKpi.awaitingShipment === 0}
        />
        <KPICard
          icon={PackageCheck}
          label="Ready to collect"
          value={redemptionKpi.readyToCollect}
          accent={redemptionKpi.readyToCollect > 0 ? 'text-emerald-400' : 'text-zinc-400'}
          loading={loading}
          onClick={handleClickReady}
          hint="Members who can collect their reward now"
          active={fulfillmentFilter === 'ready_to_collect'}
          disabled={redemptionKpi.readyToCollect === 0}
        />
        <KPICard
          icon={ShieldAlert}
          label="Unverified"
          value={unverifiedCount}
          accent={unverifiedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}
          loading={loading}
          onClick={handleClickUnverified}
          hint="Open list of unverified members and verify each one quickly"
          active={unverifiedModalOpen}
          disabled={unverifiedCount === 0}
        />
      </div>

      {/* ── Middle: Verifier + Recent Check-ins ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Redemption verifier */}
        <div className="lg:col-span-1">
          <RedemptionVerifier gymId={gymId} onRedemptionConfirmed={fetchPendingRedemptions} />
        </div>

        {/* Recent check-ins card */}
        <div className="lg:col-span-2">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden h-full flex flex-col">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#00E5FF]" />
                  Recent Check-ins
                </h3>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  Latest arrivals — click to verify identity
                </p>
              </div>
              <div className="flex items-center gap-2">
                {realtimeConnected ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
                    <Wifi className="w-3 h-3" />
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <WifiOff className="w-3 h-3" />
                    Polling
                  </span>
                )}
                <LiveIndicator label="" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-zinc-800/30 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : checkins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Users className="w-6 h-6 text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-600">No check-ins yet today</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {checkins.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                      onClick={() =>
                        router.push(`/dashboard/gym/${gymId}/members/${c.user_id}`)
                      }
                    >
                      <MemberAvatar avatarUrl={c.avatar_url} username={c.username} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">
                          {c.username}
                        </p>
                        <span className="text-[10px] text-zinc-600">
                          {relativeTime(c.checked_in_at)}
                          {c.drops_earned > 0 && (
                            <span className="text-[#00E5FF] ml-2">+{c.drops_earned} drops</span>
                          )}
                        </span>
                      </div>

                      {c.identity_verified ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          Verified
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setVerifyTarget({
                              userId: c.user_id,
                              username: c.username,
                              avatarUrl: c.avatar_url,
                            });
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          Verify
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#1A1A1A] px-5 py-2.5 shrink-0">
              <button
                onClick={() => router.push(`/dashboard/gym/${gymId}/checkin`)}
                className="text-[10px] text-zinc-500 hover:text-[#00E5FF] transition-colors"
              >
                View all check-ins →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Redemptions Queue ── */}
      <div ref={queueRef} className="scroll-mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="w-4 h-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-white">Redemption Queue</h3>
          {redemptionKpi.pending > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400 min-w-[18px] text-center">
              {redemptionKpi.pending}
            </span>
          )}
        </div>

        {/* Active filter banner — makes it obvious the queue is narrowed */}
        {fulfillmentFilter !== 'all' && (
          <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#00E5FF]/5 border border-[#00E5FF]/20">
            <div className="flex items-center gap-2 min-w-0">
              {fulfillmentFilter === 'awaiting_shipment' ? (
                <Package className="w-4 h-4 text-blue-400 shrink-0" />
              ) : (
                <PackageCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <p className="text-xs text-zinc-300 truncate">
                Showing only{' '}
                <span className={
                  fulfillmentFilter === 'awaiting_shipment'
                    ? 'text-blue-400 font-semibold'
                    : 'text-emerald-400 font-semibold'
                }>
                  {fulfillmentFilter === 'awaiting_shipment' ? 'Awaiting shipment' : 'Ready to collect'}
                </span>
                {' '}— other redemptions are hidden
              </p>
            </div>
            <button
              onClick={() => setFulfillmentFilter('all')}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold text-[#00E5FF] bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 transition-colors"
            >
              Show all
            </button>
          </div>
        )}

        <RedemptionsList
          gymId={gymId}
          onActionComplete={handleRedemptionActionComplete}
          fulfillmentFilter={fulfillmentFilter}
          onFulfillmentFilterChange={setFulfillmentFilter}
        />
      </div>

      {/* Unverified quick-verify modal (z-40) — opens from Unverified KPI card */}
      {unverifiedModalOpen && (
        <UnverifiedCheckinsModal
          checkins={checkins
            .filter((c) => !c.identity_verified)
            .map((c) => ({
              id: c.id,
              user_id: c.user_id,
              username: c.username,
              avatar_url: c.avatar_url,
              checked_in_at: c.checked_in_at,
            }))}
          onClose={() => setUnverifiedModalOpen(false)}
          onVerifyClick={(c) =>
            setVerifyTarget({
              userId: c.user_id,
              username: c.username,
              avatarUrl: c.avatar_url,
            })
          }
        />
      )}

      {/* Verify drawer (z-50) — layers on top of the unverified modal when open */}
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

function KPICard({
  icon: Icon,
  label,
  value,
  accent,
  loading,
  onClick,
  hint,
  active = false,
  disabled = false,
}: {
  icon: typeof Calendar;
  label: string;
  value: number;
  accent: string;
  loading: boolean;
  onClick?: () => void;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const isInteractive = Boolean(onClick) && !disabled;

  const baseClasses =
    'bg-[#0A0A0A] border rounded-xl px-4 py-3 flex items-center gap-3 text-left w-full transition-all';
  const borderClasses = active
    ? 'border-[#00E5FF]/60 ring-1 ring-[#00E5FF]/30'
    : 'border-[#1A1A1A]';
  const interactiveClasses = isInteractive
    ? 'hover:border-[#2A2A2A] hover:bg-[#0F0F0F] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00E5FF]/40'
    : disabled
    ? 'opacity-70 cursor-not-allowed'
    : '';

  const content = (
    <>
      <div className="w-8 h-8 rounded-lg bg-[#111] flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-6 w-8 bg-zinc-800/50 rounded animate-pulse" />
        ) : (
          <div className={`text-lg font-bold ${accent}`}>{value.toLocaleString()}</div>
        )}
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider truncate">{label}</div>
      </div>
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        aria-label={hint ? `${label} — ${hint}` : label}
        className={`${baseClasses} ${borderClasses} ${interactiveClasses}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      title={hint}
      className={`${baseClasses} ${borderClasses} ${interactiveClasses}`}
    >
      {content}
    </div>
  );
}
