import { createClient } from '@/lib/supabase-server';
import { StatsCard } from '../StatsCard';

export async function SuperadminDashboard() {
  const supabase = createClient();
  
  // Fetch global stats
  const [
    { count: totalUsers },
    { count: totalGyms },
    { data: sessions },
    { data: redemptions },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('gyms').select('*', { count: 'exact', head: true }),
    supabase
      .from('sessions')
      .select('drops_earned')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('redemptions')
      .select('drops_spent')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const totalDropsEarned = sessions?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;
  const totalDropsSpent = redemptions?.reduce((sum, r) => sum + (r.drops_spent || 0), 0) || 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Global Dashboard</h1>
        <p className="text-[#808080]">Overview of all gyms and users</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Users"
          value={totalUsers || 0}
          icon="👥"
          gradient="cyan"
        />
        <StatsCard
          title="Total Gyms"
          value={totalGyms || 0}
          icon="🏋️"
          gradient="cyan"
        />
        <StatsCard
          title="Drops Earned (30d)"
          value={totalDropsEarned}
          icon="💧"
          gradient="cyan"
        />
        <StatsCard
          title="Drops Spent (30d)"
          value={totalDropsSpent}
          icon="🛒"
          gradient="orange"
        />
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
        <p className="text-[#808080]">Activity feed coming soon...</p>
      </div>
    </div>
  );
}
