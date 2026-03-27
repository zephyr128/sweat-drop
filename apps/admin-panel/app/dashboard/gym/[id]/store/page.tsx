// LIVE: Includes real-time redemption verification
export const dynamic = 'force-dynamic';

import { requireGymAccess } from '@/lib/auth-guard';
import { StorePageTabs } from '@/components/modules/StorePageTabs';

interface StorePageProps {
  params: Promise<{ id: string }>;
}

export default async function StorePage({ params }: StorePageProps) {
  const { id } = await params;
  await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Store</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Manage rewards, process redemptions, and verify pickup codes.
        </p>
      </div>

      <StorePageTabs gymId={id} />
    </div>
  );
}
