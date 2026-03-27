// Route is auto-dynamic (reads cookies via requireGymAccess)

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
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Leaderboard & History</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Current standings and past snapshots for {(gym as { name: string }).name}.
        </p>
      </div>
      <LeaderboardHistory gymId={gymId} gymName={(gym as { name: string }).name} />
    </div>
  );
}
