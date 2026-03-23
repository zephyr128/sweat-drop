export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { LeaderboardHistory } from '@/components/modules/LeaderboardHistory';

export default async function LeaderboardHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  await requireGymAccess(gymId);

  const supabase = await createClient();
  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('id', gymId)
    .single();

  if (!gym) notFound();

  return (
    <div className="min-h-screen md:p-6">
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
