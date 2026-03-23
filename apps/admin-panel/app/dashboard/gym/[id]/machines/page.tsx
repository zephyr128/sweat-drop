export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireGymAccess } from '@/lib/auth-guard';
import { MachineFloor } from '@/components/analytics/MachineFloor';

interface MachinesPageProps {
  params: Promise<{ id: string }>;
}

export default async function MachinesPage({ params }: MachinesPageProps) {
  const { id } = await params;
  const profile = await requireGymAccess(id);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Machines</h1>
        <p className="text-[#808080]">Live gym floor and machine management</p>
      </div>

      <MachineFloor gymId={id} userRole={profile.role} />
    </div>
  );
}
