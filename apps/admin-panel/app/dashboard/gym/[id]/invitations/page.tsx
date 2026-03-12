// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { ArenaInvitationsManager } from '@/components/modules/ArenaInvitationsManager';

export default async function GymInvitationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  // Only gym_owner, gym_admin, superadmin
  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/dashboard/gym/${gymId}/dashboard`);
  }

  // Verify gym exists
  const supabase = await createClient();
  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('id', gymId)
    .single();

  if (!gym) {
    notFound();
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Arena Invitations</h1>
        <p className="text-[#808080] mt-1">
          Review and respond to arena competition invitations for {(gym as { name: string }).name}.
        </p>
      </div>

      <ArenaInvitationsManager gymId={gymId} />
    </div>
  );
}
