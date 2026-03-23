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
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MachineHubPage } from '@/components/analytics/MachineHubPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MachineAnalyticsPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, assigned_gym_id, owner_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    notFound();
  }

  if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
    const { data: gym } = await supabase
      .from('gyms')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!gym) notFound();

    const ownsGym = gym.owner_id === profile.id;
    const isAssigned = profile.assigned_gym_id === id;
    if (!ownsGym && !isAssigned) notFound();
  }

  const { data: gym } = await supabase
    .from('gyms')
    .select('name')
    .eq('id', id)
    .single();

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <Link
          href={`/dashboard/gym/${id}/machines`}
          className="inline-flex items-center gap-1.5 text-[#808080] hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Machines
        </Link>
        <h1 className="text-4xl font-bold text-white mb-2">Machine Hub</h1>
        <p className="text-[#808080]">
          Live monitor and usage analytics{gym?.name ? ` for ${gym.name}` : ''}
        </p>
      </div>

      <MachineHubPage gymId={id} />
    </div>
  );
}
