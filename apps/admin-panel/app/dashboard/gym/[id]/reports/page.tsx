export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export function generateStaticParams() {
  return [];
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { GymReportDashboard } from '@/components/reports/GymReportDashboard';

interface ReportsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  let user;
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) redirect('/login');
    user = authUser;
  } catch {
    redirect('/login');
  }

  let profile;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, username, role, assigned_gym_id, owner_id, home_gym_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) notFound();
    profile = profileData;
  } catch {
    notFound();
  }

  const role = (profile.role as string) || 'user';
  if (!['superadmin', 'gym_owner', 'gym_admin'].includes(role)) {
    redirect('/dashboard');
  }

  if (role === 'gym_owner' || role === 'gym_admin') {
    const { data: gymData } = await supabase
      .from('gyms')
      .select('id, owner_id')
      .eq('id', id)
      .single();

    if (!gymData) notFound();

    const ownsGym = (gymData as any).owner_id === profile.id;
    const isAssigned = profile.assigned_gym_id === id;
    if (!ownsGym && !isAssigned) {
      redirect('/dashboard');
    }
  }

  const { data: gym } = await supabase
    .from('gyms')
    .select('name')
    .eq('id', id)
    .single();

  const gymName = (gym as any)?.name || 'Gym';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="text-zinc-400 text-sm mt-1">Usage analytics and revenue insights for {gymName}</p>
      </div>
      <GymReportDashboard gymId={id} gymName={gymName} />
    </div>
  );
}
