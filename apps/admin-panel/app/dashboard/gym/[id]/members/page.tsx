export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { MembersPageTabs } from '@/components/modules/MembersPageTabs';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Members</h1>
        <p className="text-[#808080] mt-1">
          View and manage all gym members, track activity, and identify engagement patterns.
        </p>
      </div>

      <MembersPageTabs gymId={gymId} />
    </div>
  );
}
