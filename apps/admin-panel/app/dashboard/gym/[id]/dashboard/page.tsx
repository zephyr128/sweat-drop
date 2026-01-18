// Force dynamic rendering for Next.js build
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { StatsCard } from '@/components/StatsCard';
import { AnalyticsSection } from '@/components/analytics/AnalyticsSection';
import { NetworkOverviewToggle } from '@/components/dashboards/NetworkOverviewToggle';
import { notFound } from 'next/navigation';

interface DashboardPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  owner_id: string | null;
}

interface SessionData {
  drops_earned: number | null;
}

export default async function GymDashboardPage({ params }: DashboardPageProps) {
  const { id } = await params;
  
  // Initialize Supabase client
  const supabase = await createClient();
  
  // 1. Check authentication first
  let user;
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      redirect('/login');
    }
    
    user = authUser;
  } catch (error) {
    console.error('[GymDashboardPage] Auth check failed:', error);
    redirect('/login');
  }

  // 2. Fetch user profile
  let profile;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, username, role, assigned_gym_id, owner_id, home_gym_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      console.error('[GymDashboardPage] Profile fetch failed:', profileError);
      notFound();
    }

    profile = {
      id: profileData.id,
      email: profileData.email || user.email || '',
      username: profileData.username,
      role: (profileData.role as 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user') || 'user',
      assigned_gym_id: profileData.assigned_gym_id,
      owner_id: profileData.owner_id,
      home_gym_id: profileData.home_gym_id,
    };
  } catch (error) {
    console.error('[GymDashboardPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Fetch gym details
  let gym: GymData;
  try {
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .select('*')
      .eq('id', id)
      .single();

    if (gymError || !gymData) {
      console.error('[GymDashboardPage] Gym fetch failed:', gymError);
      notFound();
    }

    gym = gymData as GymData;
  } catch (error) {
    console.error('[GymDashboardPage] Unexpected error fetching gym:', error);
    notFound();
  }

  // 4. Fetch gym-specific stats with error handling
  let members = 0;
  let challenges = 0;
  let storeItems = 0;
  let weeklyDropsEarned = 0;
  let pendingRedemptionsCount = 0;

  try {
    const [
      membersResult,
      challengesResult,
      storeItemsResult,
      recentSessionsResult,
      pendingRedemptionsResult,
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

    members = membersResult.count || 0;
    challenges = challengesResult.count || 0;
    storeItems = storeItemsResult.count || 0;
    pendingRedemptionsCount = pendingRedemptionsResult.count || 0;

    // Calculate weekly drops
    if (recentSessionsResult.data && Array.isArray(recentSessionsResult.data)) {
      weeklyDropsEarned = recentSessionsResult.data.reduce((sum, s: SessionData) => {
        return sum + (s.drops_earned || 0);
      }, 0);
    }
  } catch (error) {
    console.error('[GymDashboardPage] Error fetching stats:', error);
    // Continue with default values
  }

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
          value={members}
          icon="👥"
          gradient="cyan"
        />
        <StatsCard
          title="Active Challenges"
          value={challenges}
          icon="🏆"
          gradient="cyan"
        />
        <StatsCard
          title="Store Items"
          value={storeItems}
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
      <AnalyticsSection gymId={id} pendingRedemptions={pendingRedemptionsCount} />
    </div>
  );
}
