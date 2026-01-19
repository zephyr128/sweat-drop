// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { LeaderboardRewardsModule } from '@/components/modules/LeaderboardRewardsModule';

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  leaderboard_config: Record<string, any> | null;
  owner_id: string | null;
}

interface LeaderboardConfig {
  rank1?: string;
  rank2?: string;
  rank3?: string;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
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
    console.error('[SettingsPage] Auth check failed:', error);
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
      console.error('[SettingsPage] Profile fetch failed:', profileError);
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
    console.error('[SettingsPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Fetch gym data
  let gym: GymData;
  try {
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .select('id, leaderboard_config, owner_id')
      .eq('id', id)
      .single();
    
    if (gymError || !gymData) {
      console.error('[SettingsPage] Gym fetch failed:', gymError);
      notFound();
    }
    
    gym = gymData as GymData;
  } catch (error) {
    console.error('[SettingsPage] Unexpected error fetching gym:', error);
    notFound();
  }
  
  // 4. Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // 5. Parse leaderboard config with safe defaults
  const config: LeaderboardConfig = (gym.leaderboard_config && typeof gym.leaderboard_config === 'object') 
    ? (gym.leaderboard_config as LeaderboardConfig)
    : {};

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Leaderboard Rewards</h1>
        <p className="text-[#808080]">Define rewards for top ranked users</p>
      </div>

      <LeaderboardRewardsModule
        gymId={id}
        initialData={{
          rank1: config.rank1 || '',
          rank2: config.rank2 || '',
          rank3: config.rank3 || '',
        }}
      />
    </div>
  );
}
