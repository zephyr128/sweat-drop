// Route is auto-dynamic (reads cookies via getCurrentProfile/createClient)

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { ArenasPageTabs } from '@/components/modules/ArenasPageTabs';

export default async function GymArenasPage({
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
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Arenas</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Arena competitions and invitations for {(gym as { name: string }).name}.
        </p>
      </div>

      <ArenasPageTabs
        gymId={gymId}
        isSuperadmin={profile.role === 'superadmin'}
      />
    </div>
  );
}
