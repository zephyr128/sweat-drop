// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { LeaderboardHistory } from '@/components/modules/LeaderboardHistory';

export default async function LeaderboardHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  // Only gym_owner, gym_admin, superadmin can view leaderboard history
  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  // Fetch gym name
  const supabase = await createClient();
  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('id', gymId)
    .single();

  if (!gym) {
    notFound();
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Leaderboard & History</h1>
        <p className="text-[#808080] mt-1">
          View current standings and past leaderboard snapshots for {(gym as { name: string }).name}.
        </p>
      </div>

      <LeaderboardHistory gymId={gymId} gymName={(gym as { name: string }).name} />
    </div>
  );
}
