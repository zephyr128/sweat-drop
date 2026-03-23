export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireGymAccess } from '@/lib/auth-guard';
import { MembersPageTabs } from '@/components/modules/MembersPageTabs';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  await requireGymAccess(gymId);

  return (
    <div className="min-h-screen md:p-6">
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
