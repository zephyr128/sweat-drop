export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { GymReportDashboard } from '@/components/reports/GymReportDashboard';

interface ReportsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { id } = await params;
  await requireGymAccess(id);

  const supabase = await createClient();
  const { data: gym } = await supabase
    .from('gyms')
    .select('name')
    .eq('id', id)
    .single();

  const gymName = (gym as any)?.name || 'Gym';

  return (
    <div className="md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="text-zinc-400 text-sm mt-1">Usage analytics and revenue insights for {gymName}</p>
      </div>
      <GymReportDashboard gymId={id} gymName={gymName} />
    </div>
  );
}
