// LIVE: Receptionist desk with real-time queue
export const dynamic = 'force-dynamic';

import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DeskShell } from '@/components/modules/DeskShell';

export default async function DeskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Desk</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Verify redemptions, check-ins, and manage the queue.
        </p>
      </div>

      <DeskShell gymId={gymId} />
    </div>
  );
}
