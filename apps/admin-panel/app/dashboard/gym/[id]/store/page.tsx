// LIVE: Includes real-time redemption verification
export const dynamic = 'force-dynamic';

import { requireGymAccess } from '@/lib/auth-guard';
import { StorePageTabs } from '@/components/modules/StorePageTabs';

interface StorePageProps {
  params: Promise<{ id: string }>;
}

export default async function StorePage({ params }: StorePageProps) {
  const { id } = await params;
  const profile = await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);
  const isReceptionist = profile.role === 'receptionist';

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Store</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {isReceptionist
            ? 'Process redemptions and verify pickup codes.'
            : 'Manage rewards, process redemptions, and verify pickup codes.'}
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

      <StorePageTabs gymId={id} readOnly={isReceptionist} />
    </div>
  );
}
