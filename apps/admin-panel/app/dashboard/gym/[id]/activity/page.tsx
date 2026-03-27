// LIVE: Operational activity stream — must always show fresh data
export const dynamic = 'force-dynamic';

import { requireGymAccess } from '@/lib/auth-guard';
import { ActivityLog } from '@/components/modules/ActivityLog';
import { ScrollText } from 'lucide-react';

interface ActivityPageProps {
  params: Promise<{ id: string }>;
}

export default async function ActivityLogPage({ params }: ActivityPageProps) {
  const { id } = await params;
  await requireGymAccess(id);

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-[#00E5FF]" />
          Activity Log
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Check-ins, workouts & redemptions across your gym</p>
      </div>

      <ActivityLog gymId={id} />
    </div>
  );
}
