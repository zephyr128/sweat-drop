// Route is auto-dynamic (reads cookies via requireGymAccess)

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
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Members</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Activity overview, retention insights, and full member directory.
        </p>
      </div>

      <MembersPageTabs gymId={gymId} />
    </div>
  );
}
