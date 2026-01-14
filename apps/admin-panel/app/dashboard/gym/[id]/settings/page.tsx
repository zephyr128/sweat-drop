import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { LeaderboardRewardsModule } from '@/components/modules/LeaderboardRewardsModule';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile) {
    notFound();
  }

  const supabase = createClient();
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, leaderboard_config, owner_id')
    .eq('id', id)
    .single();
  
  if (error || !gym) {
    notFound();
  }
  
  // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  if (error || !gym) {
    notFound();
  }

  const config = (gym.leaderboard_config as any) || {};

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
