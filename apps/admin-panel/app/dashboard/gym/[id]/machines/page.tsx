// LIVE: Live floor status with real-time machine states
export const dynamic = 'force-dynamic';

import { requireGymAccess } from '@/lib/auth-guard';
import { MachineFloor } from '@/components/analytics/MachineFloor';

interface MachinesPageProps {
  params: Promise<{ id: string }>;
}

export default async function MachinesPage({ params }: MachinesPageProps) {
  const { id } = await params;
  const profile = await requireGymAccess(id);

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Machines</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Live floor status, machine management, and analytics.
        </p>
      </div>
      <MachineFloor gymId={id} userRole={profile.role} />
    </div>
  );
}
