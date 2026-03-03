// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { RedemptionVerifier } from '@/components/modules/RedemptionVerifier';

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  // Only gym_owner, gym_admin, receptionist, and superadmin can verify
  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Verify Redemption</h1>
          <p className="text-[#808080] mt-1">
            Enter the member&apos;s 4-character code to verify and confirm their reward pickup.
          </p>
        </div>

        {/* Verifier Component */}
        <RedemptionVerifier gymId={gymId} />
      </div>
    </div>
  );
}
