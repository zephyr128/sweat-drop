// Route is auto-dynamic (reads cookies via getCurrentProfile)

import { getCurrentProfile } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getMemberDetail } from '@/lib/actions/member-detail-actions';
import { MemberDetailView } from '@/components/modules/MemberDetailView';

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>;
}) {
  const { id: gymId, memberId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  const result = await getMemberDetail(gymId, memberId);

  if (!result.success || !result.data) {
    notFound();
  }

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto">
      <MemberDetailView gymId={gymId} data={result.data} />
    </div>
  );
}
