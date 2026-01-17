import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { WorkoutPlansManager } from '@/components/modules/WorkoutPlansManager';

export default async function WorkoutPlansPage({
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
  
  // Verify access: superadmin can access all, gym_admin/gym_owner need to own or be assigned
  if (profile.role !== 'superadmin') {
    if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
      const { data: gym } = await supabase
        .from('gyms')
        .select('id, name, owner_id')
        .eq('id', id)
        .single();
      
      if (!gym) {
        notFound();
      }
      
      // Check if user owns this gym OR it's their assigned gym
      const ownsGym = gym.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === id;
      
      if (!ownsGym && !isAssignedGym) {
        notFound();
      }
    } else {
      // Other roles don't have access
      notFound();
    }
  }

  // Fetch workout plans for this gym
  const { data: plans, error } = await supabase
    .from('workout_plans')
    .select(`
      *,
      items:workout_plan_items(*)
    `)
    .eq('gym_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching workout plans:', error);
  }

  // Fetch machines for plan items (for display)
  const { data: machines } = await supabase
    .from('machines')
    .select('id, name, type')
    .eq('gym_id', id)
    .eq('is_active', true);

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Workout Plans Manager</h1>
        <p className="text-[#808080]">Create and manage workout plans for your gym members</p>
      </div>

      <WorkoutPlansManager 
        gymId={id} 
        initialPlans={plans || []} 
        machines={machines || []}
      />
    </div>
  );
}
