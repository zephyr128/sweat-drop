// Route is auto-dynamic (reads cookies via getCurrentProfile/createClient)

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function GlobalBrandingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  if (profile.role === 'gym_owner') {
    const supabase = await createClient();
    const { data: firstGym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', profile.id)
      .limit(1)
      .maybeSingle();

    if (firstGym?.id) {
      redirect(`/dashboard/gym/${firstGym.id}/settings?tab=branding`);
    }
  }

  redirect('/dashboard');
}
