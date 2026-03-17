// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { LeaderboardRewardsModule } from '@/components/modules/LeaderboardRewardsModule';
import { CheckinSettingsModule } from '@/components/modules/CheckinSettingsModule';

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  owner_id: string | null;
  [key: string]: unknown;
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
      .select('*')
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

  // 5. Parse configs with safe defaults (columns may not exist until migrations are applied)
  const rawConfig = gym.leaderboard_config;
  const config: LeaderboardConfig = (rawConfig && typeof rawConfig === 'object')
    ? (rawConfig as LeaderboardConfig)
    : {};

  const checkinDrops = typeof gym.checkin_drops === 'number' ? gym.checkin_drops : 20;
  const gymLat = typeof gym.lat === 'number' ? gym.lat : null;
  const gymLng = typeof gym.lng === 'number' ? gym.lng : null;
  const gpsRadiusM = typeof gym.gps_radius_m === 'number' ? gym.gps_radius_m : 200;
  const gymAddress = typeof gym.address === 'string' ? gym.address : null;
  const gymCity = typeof gym.city === 'string' ? gym.city : null;

  return (
    <div className="space-y-12">
      <div>
        <div className="mb-8 pt-16 md:pt-0">
          <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
          <p className="text-[#808080]">Manage gym check-in and leaderboard settings</p>
        </div>

        <CheckinSettingsModule
          gymId={id}
          initialData={{
            checkin_drops: checkinDrops,
            lat: gymLat,
            lng: gymLng,
            gps_radius_m: gpsRadiusM,
            address: gymAddress,
            city: gymCity,
          }}
        />
      </div>

      <div className="border-t border-[#222] pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">Leaderboard Rewards</h2>
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
    </div>
  );
}
