import { createClient } from '@/lib/supabase-server';
import { StatsCard } from '../StatsCard';
import { Palette, Trophy, ShoppingBag } from 'lucide-react';

interface GymAdminDashboardProps {
  gymId: string;
}

export async function GymAdminDashboard({ gymId }: GymAdminDashboardProps) {
  const supabase = await createClient();
  
  // Fetch gym-specific stats
  const [
    { data: gym },
    { count: gymUsers },
    { data: sessions },
    { data: redemptions },
    { data: activeChallenges },
  ] = await Promise.all([
    supabase.from('gyms').select('*').eq('id', gymId).single(),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('home_gym_id', gymId),
    supabase
      .from('sessions')
      .select('drops_earned')
      .eq('gym_id', gymId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('redemptions')
      .select('drops_spent')
      .eq('gym_id', gymId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('challenges')
      .select('*')
      .eq('gym_id', gymId)
      .eq('is_active', true),
  ]);

  const totalDropsEarned = sessions?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;
  const totalDropsSpent = redemptions?.reduce((sum, r) => sum + (r.drops_spent || 0), 0) || 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">{gym?.name || 'Gym Dashboard'}</h1>
        <p className="text-[#808080]">{gym?.city && `${gym.city}, ${gym.country}`}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Gym Members"
          value={gymUsers || 0}
          icon="Users"
          accent="cyan"
          priority="primary"
        />
        <StatsCard
          title="Active Challenges"
          value={activeChallenges?.length || 0}
          icon="Trophy"
          accent="amber"
          priority="secondary"
        />
        <StatsCard
          title="Drops Earned (30d)"
          value={totalDropsEarned}
          icon="Droplet"
          accent="cyan"
          priority="secondary"
        />
        <StatsCard
          title="Drops Spent (30d)"
          value={totalDropsSpent}
          icon="ShoppingBag"
          accent="rose"
          priority="secondary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <a
              href={`/dashboard/gym/${gymId}/branding`}
              className="flex items-center gap-2 p-4 bg-[#1A1A1A] rounded-lg hover:bg-[#00E5FF]/10 border border-[#1A1A1A] hover:border-[#00E5FF]/30 transition-all"
            >
              <Palette className="w-4 h-4 text-[#00E5FF]" strokeWidth={1.5} />
              <span className="text-[#00E5FF] font-medium">Update Branding</span>
            </a>
            <a
              href={`/dashboard/gym/${gymId}/challenges`}
              className="flex items-center gap-2 p-4 bg-[#1A1A1A] rounded-lg hover:bg-[#00E5FF]/10 border border-[#1A1A1A] hover:border-[#00E5FF]/30 transition-all"
            >
              <Trophy className="w-4 h-4 text-[#00E5FF]" strokeWidth={1.5} />
              <span className="text-[#00E5FF] font-medium">Manage Challenges</span>
            </a>
            <a
              href={`/dashboard/gym/${gymId}/store`}
              className="flex items-center gap-2 p-4 bg-[#1A1A1A] rounded-lg hover:bg-[#00E5FF]/10 border border-[#1A1A1A] hover:border-[#00E5FF]/30 transition-all"
            >
              <ShoppingBag className="w-4 h-4 text-[#00E5FF]" strokeWidth={1.5} />
              <span className="text-[#00E5FF] font-medium">Manage Store</span>
            </a>
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
          <p className="text-[#808080]">Activity feed coming soon...</p>
        </div>
      </div>
    </div>
  );
}
