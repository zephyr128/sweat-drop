// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { RetentionDashboard } from '@/components/modules/RetentionDashboard';

export default async function RetentionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  // Only gym_owner, gym_admin, superadmin can view retention
  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Retention Dashboard</h1>
        <p className="text-[#808080] mt-1">
          Track member engagement, identify at-risk members, and monitor churn.
        </p>
      </div>

      <RetentionDashboard gymId={gymId} />
    </div>
  );
}
