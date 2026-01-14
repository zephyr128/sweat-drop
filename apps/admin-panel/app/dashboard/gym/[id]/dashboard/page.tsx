import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { StatsCard } from '@/components/StatsCard';
import { AnalyticsSection } from '@/components/analytics/AnalyticsSection';
import { NetworkOverviewToggle } from '@/components/dashboards/NetworkOverviewToggle';
import { notFound } from 'next/navigation';

export default async function GymDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Await params in Next.js 14
  const { id } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile) {
    notFound();
  }

  const supabase = createClient();

  // Fetch gym details
  const { data: gym, error: gymError } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', id)
    .single();

  if (gymError || !gym) {
    notFound();
  }

  // Fetch gym-specific stats
  const [
    { count: members },
    { count: challenges },
    { count: storeItems },
    { data: recentSessions },
    { data: pendingRedemptions },
  ] = await Promise.all([
    supabase
      .from('gym_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', id),
    supabase
      .from('challenges')
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
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100),
    supabase
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', id)
      .eq('status', 'pending'),
  ]);

  const weeklyDropsEarned = recentSessions?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;

  // Get owner_id for network overview (if user is gym owner)
  const ownerId = gym.owner_id || profile.id;

  return (
    <div>
      <div className="mb-6 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">{gym.name}</h1>
        <p className="text-[#808080]">
          {gym.city && `${gym.city}, `}
          {gym.country}
        </p>
      </div>

      {/* Network Overview Toggle (only for gym owners with multiple gyms) */}
      {profile.role === 'gym_owner' && gym.owner_id && (
        <NetworkOverviewToggle ownerId={ownerId} currentGymId={id} />
      )}

      {/* Header Row: Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Members"
          value={members || 0}
          icon="👥"
          gradient="cyan"
        />
        <StatsCard
          title="Active Challenges"
          value={challenges || 0}
          icon="🏆"
          gradient="cyan"
        />
        <StatsCard
          title="Store Items"
          value={storeItems || 0}
          icon="🛒"
          gradient="cyan"
        />
        <StatsCard
          title="Drops Earned (7d)"
          value={weeklyDropsEarned}
          icon="💧"
          gradient="cyan"
        />
      </div>

      {/* Analytics Section with Time Filter */}
      <AnalyticsSection gymId={id} pendingRedemptions={pendingRedemptions?.length || 0} />
    </div>
  );
}
