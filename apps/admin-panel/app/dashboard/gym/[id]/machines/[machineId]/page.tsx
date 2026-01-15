import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { MachineDetailView } from '@/components/modules/MachineDetailView';

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string; machineId: string }>;
}) {
  const { id: gymId, machineId } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile) {
    notFound();
  }

  const supabase = createClient();
  
  // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_owner' || profile.role === 'gym_admin') {
    const { data: gym } = await supabase
      .from('gyms')
      .select('owner_id')
      .eq('id', gymId)
      .single();
    
    if (!gym) {
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === gymId;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // Fetch machine details
  const { data: machine, error: machineError } = await supabase
    .from('machines')
    .select(`
      *,
      gyms (
        id,
        name,
        city,
        country
      )
    `)
    .eq('id', machineId)
    .eq('gym_id', gymId)
    .single();

  if (machineError || !machine) {
    notFound();
  }

  // Verify machine belongs to the gym
  if (machine.gym_id !== gymId) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Details</h1>
        <p className="text-[#808080]">View and print machine sticker</p>
      </div>

      <MachineDetailView machine={machine} userRole={profile.role} />
    </div>
  );
}
