// LIVE: Receptionist desk with real-time queue
export const dynamic = 'force-dynamic';

import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DeskTabs } from '@/components/modules/DeskTabs';

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

  const isReceptionist = profile.role === 'receptionist';

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Desk</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Verify redemptions, manage the queue, and monitor live activity.
        </p>
      </div>

      {isReceptionist && (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] shrink-0" />
          <p className="text-[11px] text-zinc-400">
            Reception mode — verification and queue operations.
          </p>
        </div>
      )}

      <DeskTabs gymId={gymId} />
    </div>
  );
}
