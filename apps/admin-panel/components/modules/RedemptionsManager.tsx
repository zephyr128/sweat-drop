'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { confirmRedemption, cancelRedemption } from '@/lib/actions/redemption-actions';
import { markRedemptionFulfilled } from '@/lib/actions/redemption-fulfillment-actions';
import {
  CheckCircle2,
  XCircle,
  Clock,
  CheckCircle,
  Droplet,
  Ticket,
  Coffee,
  GlassWater,
  Shirt,
  Gift,
  Trophy,
  Swords,
  Filter,
  ShoppingBag,
  ShieldAlert,
  ShieldCheck,
  Package,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { RedemptionVerifier } from '@/components/modules/RedemptionVerifier';
import { MemberIdentityVerifyDrawer } from '@/components/modules/MemberIdentityVerifyDrawer';
import { supabase } from '@/lib/supabase-client';
import { formatDateTime } from '@/lib/utils/date';

type SourceType = 'reward_store' | 'arena_prize' | 'leaderboard_prize';
type RedemptionStatus = 'pending' | 'pending_verification' | 'confirmed' | 'cancelled';

interface Redemption {
  id: string;
  redemption_code: string;
  drops_spent: number;
  status: RedemptionStatus;
  source_type?: SourceType;
  description?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  fulfilled_at?: string | null;
  profiles: {
    id: string;
    username: string;
    email: string;
  } | null;
  rewards: {
    id: string;
    name: string;
    reward_type: string;
    price_drops: number;
    image_url?: string;
  } | null;
  confirmed_by_profile?: {
    id: string;
    username: string;
  } | null;
}

const SOURCE_TYPE_LABELS: Record<SourceType, { label: string; icon: typeof ShoppingBag; color: string }> = {
  reward_store: { label: 'Store', icon: ShoppingBag, color: 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30' },
  leaderboard_prize: { label: 'Leaderboard', icon: Trophy, color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  arena_prize: { label: 'Arena', icon: Swords, color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};

const IS_PRIZE_SOURCE = (sourceType?: SourceType) =>
  sourceType === 'arena_prize' || sourceType === 'leaderboard_prize';

interface VerifyTarget {
  redemptionId: string;
  userId: string;
  gymId: string;
  username: string;
  avatarUrl: string | null;
}

interface RedemptionsManagerProps {
  gymId: string;
  initialPendingRedemptions: Redemption[];
  initialConfirmedRedemptions: Redemption[];
}

export function RedemptionsManager({
  gymId,
  initialPendingRedemptions,
  initialConfirmedRedemptions,
}: RedemptionsManagerProps) {
  const router = useRouter();
  const [pendingRedemptions, setPendingRedemptions] = useState<Redemption[]>(initialPendingRedemptions);
  const [confirmedRedemptions, setConfirmedRedemptions] = useState<Redemption[]>(initialConfirmedRedemptions);
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed'>('pending');
  const [sourceFilter, setSourceFilter] = useState<SourceType | 'all'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [_refreshing, setRefreshing] = useState(false);
  // Inline "needs verification" banner per row
  const [verifyBannerIds, setVerifyBannerIds] = useState<Set<string>>(new Set());
  // Verify drawer state
  const [verifyTarget, setVerifyTarget] = useState<VerifyTarget | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getRewardIcon = (type: string) => {
    switch (type) {
      case 'coffee': return Coffee;
      case 'protein': return GlassWater;
      case 'discount': return Ticket;
      case 'merch': return Shirt;
      default: return Gift;
    }
  };

  const filterBySource = (redemptions: Redemption[]) => {
    if (sourceFilter === 'all') return redemptions;
    return redemptions.filter((r) => (r.source_type || 'reward_store') === sourceFilter);
  };

  const getSourceBadge = (redemption: Redemption) => {
    const sourceType = (redemption.source_type || 'reward_store') as SourceType;
    const info = SOURCE_TYPE_LABELS[sourceType] || SOURCE_TYPE_LABELS.reward_store;
    const SourceIcon = info.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${info.color}`}>
        <SourceIcon className="w-2.5 h-2.5" />
        {info.label}
      </span>
    );
  };

  const getRewardName = (redemption: Redemption) => {
    if (redemption.rewards?.name) return redemption.rewards.name;
    if (redemption.description) {
      const dashIdx = redemption.description.indexOf(' — ');
      if (dashIdx !== -1) return redemption.description.slice(dashIdx + 3);
      return redemption.description;
    }
    return 'Unknown Reward';
  };

  /** Status badge shown alongside the source badge in the pending list */
  const getStatusBadge = (redemption: Redemption) => {
    if (redemption.status === 'pending_verification') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">
          <ShieldAlert className="w-2.5 h-2.5" />
          Needs verification
        </span>
      );
    }
    // Fulfilment badge for prize sources
    if (IS_PRIZE_SOURCE(redemption.source_type)) {
      if (redemption.fulfilled_at) {
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            <PackageCheck className="w-2.5 h-2.5" />
            Ready
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-blue-500/10 text-blue-400 border-blue-500/30">
          <Package className="w-2.5 h-2.5" />
          Awaiting shipment
        </span>
      );
    }
    return null;
  };

  // ── Data refresh ─────────────────────────────────────────────────────────────

  const refreshRedemptions = async () => {
    setRefreshing(true);
    try {
      const [pendingResult, confirmedResult] = await Promise.all([
        supabase
          .from('redemptions')
          .select(`
            *,
            profiles:user_id (id, username, email),
            rewards:reward_id (id, name, reward_type, price_drops, image_url)
          `)
          .eq('gym_id', gymId)
          .in('status', ['pending', 'pending_verification'])
          .order('created_at', { ascending: false }),
        supabase
          .from('redemptions')
          .select(`
            *,
            profiles:user_id (id, username, email),
            rewards:reward_id (id, name, reward_type, price_drops, image_url)
          `)
          .eq('gym_id', gymId)
          .eq('status', 'confirmed')
          .order('confirmed_at', { ascending: false })
          .limit(50),
      ]);

      if (pendingResult.data) setPendingRedemptions(pendingResult.data as Redemption[]);
      if (confirmedResult.data) setConfirmedRedemptions(confirmedResult.data as Redemption[]);
    } catch {
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Action handlers ──────────────────────────────────────────────────────────

  const openVerifyDrawer = (redemption: Redemption) => {
    setVerifyTarget({
      redemptionId: redemption.id,
      userId: redemption.profiles?.id ?? '',
      gymId,
      username: redemption.profiles?.username ?? 'Unknown',
      avatarUrl: null,
    });
  };

  const handleConfirm = async (redemption: Redemption) => {
    // Gate: pending_verification rows must be verified first
    if (redemption.status === 'pending_verification') {
      setVerifyBannerIds((prev) => new Set(prev).add(redemption.id));
      return;
    }

    setProcessingId(redemption.id);
    try {
      const result = await confirmRedemption(redemption.id, gymId);
      if (result.success) {
        await refreshRedemptions();
        toast.success('Redemption confirmed successfully');
      } else {
        // Handle live revocation gap — same error string as DB returns
        if (result.error === 'VERIFICATION_REQUIRED') {
          setVerifyBannerIds((prev) => new Set(prev).add(redemption.id));
          toast.warning('Member verification required before confirming.');
        } else {
          toast.error(`Failed to confirm: ${result.error}`);
        }
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (redemptionId: string) => {
    if (!(await confirmAction({
      title: 'Cancel Redemption',
      message: 'Cancel this redemption? Drops will be refunded to the user.',
      confirmLabel: 'Cancel Redemption',
      variant: 'danger',
    }))) return;

    setProcessingId(redemptionId);
    try {
      const result = await cancelRedemption(redemptionId, gymId);
      if (result.success) {
        await refreshRedemptions();
        toast.success('Redemption cancelled and drops refunded');
      } else {
        toast.error(`Failed to cancel: ${result.error}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkFulfilled = async (redemption: Redemption) => {
    const rewardName = getRewardName(redemption);
    const userLabel = redemption.profiles?.username
      ? `@${redemption.profiles.username}`
      : 'the recipient';
    if (!(await confirmAction({
      title: 'Mark prize as received?',
      message: `Confirm that "${rewardName}" has arrived at the gym and is ready for pickup. ${userLabel} will be notified via push notification.`,
      confirmLabel: 'Mark as received',
      variant: 'default',
    }))) return;

    setProcessingId(redemption.id);
    try {
      const result = await markRedemptionFulfilled(redemption.id);
      if (result.success) {
        await refreshRedemptions();
        toast.success('Prize marked as received. Recipient notified.');
      } else {
        toast.error(`Failed: ${result.error ?? 'Unknown error'}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerified = async () => {
    // After verify the DB trigger auto-promotes the row; refetch to reflect it.
    await refreshRedemptions();
    if (verifyTarget) {
      setVerifyBannerIds((prev) => {
        const next = new Set(prev);
        next.delete(verifyTarget.redemptionId);
        return next;
      });
    }
    setVerifyTarget(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Code Verification widget */}
      <div className="mb-8 max-w-lg mx-auto">
        <RedemptionVerifier gymId={gymId} onRedemptionConfirmed={refreshRedemptions} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#1A1A1A]">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'pending'
              ? 'text-[#00E5FF] border-[#00E5FF]'
              : 'text-[#808080] border-transparent hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending ({filterBySource(pendingRedemptions).length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('confirmed')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'confirmed'
              ? 'text-[#00E5FF] border-[#00E5FF]'
              : 'text-[#808080] border-transparent hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Confirmed ({filterBySource(confirmedRedemptions).length})
          </div>
        </button>
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-[#808080]" />
        <span className="text-xs text-[#808080] mr-1">Source:</span>
        {(['all', 'reward_store', 'leaderboard_prize', 'arena_prize'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setSourceFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceFilter === st
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#1A1A1A] text-[#808080] hover:text-white border border-[#333]'
            }`}
          >
            {st === 'all' ? 'All' : SOURCE_TYPE_LABELS[st]?.label || st}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        {activeTab === 'pending' && (
          <div className="p-6">
            {filterBySource(pendingRedemptions).length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#808080]">
                  {sourceFilter !== 'all'
                    ? `No pending ${SOURCE_TYPE_LABELS[sourceFilter]?.label || ''} redemptions`
                    : 'No pending redemptions'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filterBySource(pendingRedemptions).map((redemption) => {
                  const needsVerify =
                    redemption.status === 'pending_verification' ||
                    verifyBannerIds.has(redemption.id);
                  const IconComponent = getRewardIcon(redemption.rewards?.reward_type || 'unknown');

                  return (
                    <div
                      key={redemption.id}
                      className={`border rounded-lg p-6 transition-colors ${
                        needsVerify
                          ? 'bg-amber-950/20 border-amber-500/30'
                          : 'bg-[#1A1A1A] border-[#1A1A1A] hover:border-[#00E5FF]/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {/* Header row */}
                          <div className="flex items-center gap-3 mb-3">
                            <IconComponent className="w-8 h-8 text-[#00E5FF]" strokeWidth={1.5} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="text-lg font-bold text-white">
                                  {getRewardName(redemption)}
                                </h3>
                                {getSourceBadge(redemption)}
                                {getStatusBadge(redemption)}
                              </div>
                              <p className="text-sm text-[#808080]">
                                {redemption.profiles?.username || 'Unknown User'} • {redemption.rewards?.reward_type || 'Prize'}
                              </p>
                            </div>
                          </div>

                          {/* Verification required banner */}
                          {needsVerify && (
                            <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm text-amber-300 font-medium">
                                  Member not yet verified
                                </p>
                                <p className="text-xs text-amber-400/70 mt-0.5">
                                  Verify member identity to enable prize collection.
                                </p>
                              </div>
                              <button
                                onClick={() => openVerifyDrawer(redemption)}
                                className="shrink-0 px-3 py-1.5 bg-amber-500 text-black rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors flex items-center gap-1.5"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Verify now
                              </button>
                            </div>
                          )}

                          {/* Details */}
                          <div className="flex items-center gap-4 mt-2 flex-wrap">
                            <div>
                              <p className="text-xs text-[#808080] mb-1">Redemption Code</p>
                              <code className={`text-sm font-mono px-3 py-1 rounded ${
                                needsVerify
                                  ? 'text-zinc-500 bg-zinc-900 line-through'
                                  : 'text-[#00E5FF] bg-[#0A0A0A]'
                              }`}>
                                {redemption.redemption_code}
                              </code>
                            </div>
                            <div>
                              <p className="text-xs text-[#808080] mb-1">Drops Spent</p>
                              <p className="text-lg font-bold text-[#00E5FF] flex items-center gap-1">
                                {redemption.drops_spent} <Droplet className="w-4 h-4" strokeWidth={1.5} />
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-[#808080] mb-1">Requested</p>
                              <p className="text-sm text-white">{formatDateTime(redemption.created_at)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 shrink-0">
                          {IS_PRIZE_SOURCE(redemption.source_type) && !redemption.fulfilled_at ? (
                            <button
                              onClick={() => handleMarkFulfilled(redemption)}
                              disabled={processingId === redemption.id}
                              title="Mark that the prize has arrived at the gym and notify the recipient"
                              className="px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-400"
                            >
                              <PackageCheck className="w-5 h-5" />
                              {processingId === redemption.id ? 'Saving...' : 'Mark as received'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleConfirm(redemption)}
                              disabled={processingId === redemption.id}
                              className={`px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                                needsVerify
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-not-allowed'
                                  : 'bg-[#00E5FF] text-black hover:bg-[#00B8CC]'
                              }`}
                            >
                              <CheckCircle2 className="w-5 h-5" />
                              {processingId === redemption.id ? 'Confirming...' : 'Confirm'}
                            </button>
                          )}
                          <button
                            onClick={() => handleCancel(redemption.id)}
                            disabled={processingId === redemption.id}
                            className="px-6 py-3 bg-[#1A1A1A] border border-[#FF5252]/30 text-[#FF5252] rounded-lg font-medium hover:bg-[#FF5252]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <XCircle className="w-5 h-5" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'confirmed' && (
          <div className="p-6">
            {filterBySource(confirmedRedemptions).length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#808080]">
                  {sourceFilter !== 'all'
                    ? `No confirmed ${SOURCE_TYPE_LABELS[sourceFilter]?.label || ''} redemptions`
                    : 'No confirmed redemptions'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filterBySource(confirmedRedemptions).map((redemption) => {
                  const IconComponent = getRewardIcon(redemption.rewards?.reward_type || 'unknown');
                  return (
                    <div
                      key={redemption.id}
                      className="bg-[#1A1A1A] border border-[#00E5FF]/20 rounded-lg p-6"
                    >
                      <div className="flex items-start gap-4">
                        <IconComponent className="w-8 h-8 text-[#00E5FF]" strokeWidth={1.5} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-bold text-white">{getRewardName(redemption)}</h3>
                            {getSourceBadge(redemption)}
                            <span className="px-2 py-1 bg-[#00E5FF]/10 text-[#00E5FF] rounded text-xs font-medium">
                              Confirmed
                            </span>
                          </div>
                          <p className="text-sm text-[#808080] mb-4">
                            {redemption.profiles?.username || 'Unknown User'} • {redemption.drops_spent} drops
                          </p>
                          <div className="flex items-center gap-4 text-xs text-[#808080]">
                            <span>
                              Code: <code className="text-[#00E5FF]">{redemption.redemption_code}</code>
                            </span>
                            <span>•</span>
                            <span>
                              Confirmed: {redemption.confirmed_at ? formatDateTime(redemption.confirmed_at) : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verify identity drawer */}
      {verifyTarget && (
        <MemberIdentityVerifyDrawer
          gymId={verifyTarget.gymId}
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
