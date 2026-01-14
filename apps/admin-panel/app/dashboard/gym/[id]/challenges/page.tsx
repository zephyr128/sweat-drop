import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { ChallengesManager } from '@/components/modules/ChallengesManager';

export default async function ChallengesPage({
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
  
  // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
    const { data: gym } = await supabase
      .from('gyms')
      .select('owner_id')
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
  }

  const { data: challenges, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('gym_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    // Error handled gracefully
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Challenges Manager</h1>
        <p className="text-[#808080]">Create and manage daily, weekly, and custom challenges</p>
      </div>

      <ChallengesManager gymId={id} initialChallenges={challenges || []} />
    </div>
  );
}
