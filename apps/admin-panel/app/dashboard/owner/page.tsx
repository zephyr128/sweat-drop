import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { GymSwitcher } from '@/components/GymSwitcher';
import { GymAdminDashboard } from '@/components/dashboards/GymAdminDashboard';

export default async function OwnerDashboardPage() {
  const profile = await getCurrentProfile();
  
  if (!profile || profile.role !== 'gym_owner') {
    redirect('/dashboard');
  }

  const supabase = await createClient();

  // Get first active owned gym
  const { data: ownedGyms } = await supabase
    .from('gyms')
    .select('id, name, city, country, status, is_suspended')
    .eq('owner_id', profile.id)
    .eq('status', 'active')
    .eq('is_suspended', false)
    .order('name')
    .limit(1);

  // If no active gyms, show message
  if (!ownedGyms || ownedGyms.length === 0) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">No Active Gyms</h1>
          <p className="text-[#808080]">
            All your gyms are currently suspended. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  // Redirect to first active gym's dashboard
  redirect(`/dashboard/gym/${ownedGyms[0].id}/dashboard`);
}
