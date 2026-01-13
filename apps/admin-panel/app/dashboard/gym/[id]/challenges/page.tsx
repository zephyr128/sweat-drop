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

  // Verify access
  if (profile.role === 'gym_admin' && profile.admin_gym_id !== id) {
    notFound();
  }

  const supabase = createClient();
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
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Challenges Manager</h1>
        <p className="text-[#808080]">Create and manage daily, weekly, and custom challenges</p>
      </div>

      <ChallengesManager gymId={id} initialChallenges={challenges || []} />
    </div>
  );
}
