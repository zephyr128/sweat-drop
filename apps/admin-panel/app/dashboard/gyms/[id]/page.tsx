import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function GymDetailPage({ params }: { params: { id: string } }) {
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !gym) {
    notFound();
  }

  // Get gym admin
  const { data: admin } = await supabase
    .from('profiles')
    .select('username, email')
    .eq('admin_gym_id', gym.id)
    .eq('role', 'gym_admin')
    .single();

  // Get stats
  const [
    { count: members },
    { count: challenges },
    { count: storeItems },
  ] = await Promise.all([
    supabase
      .from('gym_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gym.id),
    supabase
      .from('challenges')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gym.id),
    supabase
      .from('rewards')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gym.id),
  ]);

  return (
    <div>
      <div className="mb-8">
        <Link 
          href="/dashboard/gyms"
          className="text-[#00E5FF] hover:text-[#00B8CC] mb-2 inline-block"
        >
          ← Back to Gyms
        </Link>
        <h1 className="text-4xl font-bold text-white mb-2">{gym.name}</h1>
        <p className="text-[#808080]">
          {gym.city && `${gym.city}, `}
          {gym.country}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Members</h3>
          <p className="text-3xl font-bold text-white">{members || 0}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Active Challenges</h3>
          <p className="text-3xl font-bold text-white">{challenges || 0}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Store Items</h3>
          <p className="text-3xl font-bold text-white">{storeItems || 0}</p>
        </div>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Gym Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[#808080]">Gym Admin</label>
            <p className="text-white">
              {admin ? `${admin.username || admin.email}` : 'No admin assigned'}
            </p>
          </div>
          {gym.address && (
            <div>
              <label className="text-sm text-[#808080]">Address</label>
              <p className="text-white">{gym.address}</p>
            </div>
          )}
          {gym.primary_color && (
            <div>
              <label className="text-sm text-[#808080]">Primary Color</label>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="w-8 h-8 rounded border border-[#1A1A1A]"
                  style={{ backgroundColor: gym.primary_color }}
                />
                <span className="text-white">{gym.primary_color}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
