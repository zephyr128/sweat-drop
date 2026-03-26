export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { StatsCard } from '@/components/StatsCard';
import { AnalyticsSection } from '@/components/analytics/AnalyticsSection';
import { NetworkOverviewToggle } from '@/components/dashboards/NetworkOverviewToggle';
import { SmartCoachToggle } from '@/components/SmartCoachToggle';
import { EconomyHealthWidget } from '@/components/economy/EconomyHealthWidget';

interface DashboardPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  owner_id: string | null;
  smartcoach_enabled: boolean;
}

interface SessionData {
  drops_earned: number | null;
}

interface EconomySnapshotRow {
  burn_mint_ratio: number;
  top1_share_pct: number;
  minted_drops: number;
  burned_drops: number;
}

export default async function GymDashboardPage({ params }: DashboardPageProps) {
  const { id } = await params;

  const profile = await requireGymAccess(id);

  const supabase = await createClient();

  let members = 0;
  let challenges = 0;
  let storeItems = 0;
  let weeklyDropsEarned = 0;
  let pendingRedemptionsCount = 0;
  let checkinToday = 0;
  let checkinWeek = 0;
  let unresolvedRiskEvents = 0;
  let economySummary: {
    burnMintRatio: number;
    top1SharePct: number;
    minted30d: number;
    burned30d: number;
    health: 'green' | 'yellow' | 'red';
    healthLabel: string;
  } | null = null;

  const supabaseAdmin = getAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    membersResult,
    challengesResult,
    storeItemsResult,
    recentSessionsResult,
    pendingRedemptionsResult,
    checkinTodayResult,
    checkinWeekResult,
    gymResult,
    economyLatestResult,
    unresolvedRiskResult,
  ] = await Promise.all([
    supabase
      .from('gym_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', id),
    supabase
      .from('gym_challenges')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', id)
      .eq('is_active', true),
    supabase
      .from('rewards')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', id)
      .eq('is_active', true),
    supabase
      .from('sessions')
      .select('drops_earned')
      .eq('gym_id', id)
      .gte('created_at', weekAgo.toISOString())
      .limit(500),
    supabase
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', id)
      .eq('status', 'pending'),
    supabaseAdmin
      ? supabaseAdmin
          .from('gym_checkins')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', id)
          .gte('checked_in_at', todayStart.toISOString())
      : Promise.resolve({ count: 0 }),
    supabaseAdmin
      ? supabaseAdmin
          .from('gym_checkins')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', id)
          .gte('checked_in_at', weekAgo.toISOString())
      : Promise.resolve({ count: 0 }),
    supabase.from('gyms').select('*').eq('id', id).single(),
    supabaseAdmin
      ? supabaseAdmin
          .from('economy_snapshots_daily')
          .select('burn_mint_ratio, top1_share_pct, minted_drops, burned_drops')
          .eq('gym_id', id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      ? supabaseAdmin
          .from('fraud_events')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', id)
          .is('resolved_at', null)
      : Promise.resolve({ count: 0 }),
  ]);

  const gymData = (gymResult as any).data;
  if (!gymData) notFound();
  const gym = gymData as GymData;
  if (typeof gym.smartcoach_enabled !== 'boolean') gym.smartcoach_enabled = false;

  try {
    members = membersResult.count || 0;
    challenges = challengesResult.count || 0;
    storeItems = storeItemsResult.count || 0;
    pendingRedemptionsCount = pendingRedemptionsResult.count || 0;
    checkinToday = (checkinTodayResult as { count: number | null }).count || 0;
    checkinWeek = (checkinWeekResult as { count: number | null }).count || 0;
    unresolvedRiskEvents = (unresolvedRiskResult as { count: number | null }).count || 0;

    if (recentSessionsResult.data && Array.isArray(recentSessionsResult.data)) {
      weeklyDropsEarned = recentSessionsResult.data.reduce((sum, s: SessionData) => {
        return sum + (s.drops_earned || 0);
      }, 0);
    }

    const snap = (economyLatestResult as { data?: EconomySnapshotRow | null })?.data;
    if (snap) {
      const ratio = Number(snap.burn_mint_ratio || 0);
      const top1 = Number(snap.top1_share_pct || 0);
      const ratioPct = ratio * 100;
      const ratioBad = ratioPct < 10 || ratioPct > 60;
      const ratioWarn = (ratioPct >= 10 && ratioPct < 20) || (ratioPct > 45 && ratioPct <= 60);
      const health = ratioBad || top1 > 35 ? 'red' : ratioWarn || top1 > 20 ? 'yellow' : 'green';
      const healthLabel = health === 'green' ? 'Healthy zone' : health === 'yellow' ? 'Watch closely' : 'Immediate action';
      economySummary = {
        burnMintRatio: ratio,
        top1SharePct: top1,
        minted30d: Number(snap.minted_drops || 0),
        burned30d: Number(snap.burned_drops || 0),
        health,
        healthLabel,
      };
    }
  } catch (error) {
    console.error('[GymDashboardPage] Error fetching stats:', error);
  }

  const ownerId = gym.owner_id || profile.id;
  const base = `/dashboard/gym/${id}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white mb-2">{gym.name}</h1>
        <p className="text-[#808080]">
          {gym.city && `${gym.city}, `}
          {gym.country}
        </p>
      </div>

      {profile.role === 'gym_owner' && gym.owner_id && (
        <NetworkOverviewToggle ownerId={ownerId} currentGymId={id} />
      )}

      {profile.role === 'superadmin' && (
        <div className="mb-6 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <SmartCoachToggle 
            gymId={gym.id} 
            initialEnabled={gym.smartcoach_enabled} 
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatsCard
          title="Members"
          value={members}
          icon="Users"
          accent="cyan"
          priority="primary"
          subtitle="Total registered members"
          href={`${base}/members`}
        />
        <StatsCard
          title="Drops Earned"
          value={weeklyDropsEarned.toLocaleString()}
          icon="Droplet"
          accent="cyan"
          subtitle="Last 7 days"
          href={`${base}/leaderboard-history`}
        />
        <StatsCard
          title="Check-ins Today"
          value={checkinToday}
          icon="QrCode"
          accent="emerald"
          subtitle={`${checkinWeek.toLocaleString()} this week`}
          href={`${base}/checkin`}
        />
        <StatsCard
          title="Active Challenges"
          value={challenges}
          icon="Target"
          accent="amber"
          subtitle="Running campaigns"
          href={`${base}/challenges`}
        />
        <StatsCard
          title="Store Rewards"
          value={storeItems}
          icon="ShoppingBag"
          accent="purple"
          subtitle={pendingRedemptionsCount > 0 ? `${pendingRedemptionsCount} pending pickup${pendingRedemptionsCount !== 1 ? 's' : ''}` : 'All pickups fulfilled'}
          href={`${base}/store`}
        />
        <StatsCard
          title="Pending Pickups"
          value={pendingRedemptionsCount}
          icon="Ticket"
          accent={pendingRedemptionsCount > 0 ? 'rose' : 'emerald'}
          subtitle={pendingRedemptionsCount > 0 ? 'Awaiting member collection' : 'No pending pickups'}
          href={`${base}/store`}
        />
        <StatsCard
          title="Risk Alerts"
          value={unresolvedRiskEvents}
          icon="Target"
          accent={unresolvedRiskEvents > 0 ? 'rose' : 'emerald'}
          subtitle={unresolvedRiskEvents > 0 ? 'Requires moderation review' : 'No unresolved events'}
          href={`${base}/risk`}
        />
      </div>

      <div className="mb-6">
        <EconomyHealthWidget gymId={id} summary={economySummary} />
      </div>

      <AnalyticsSection gymId={id} pendingRedemptions={pendingRedemptionsCount} />
    </div>
  );
}
