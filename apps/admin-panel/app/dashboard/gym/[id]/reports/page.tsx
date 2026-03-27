// Route is auto-dynamic (reads cookies via requireGymAccess)

import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import GymReportDashboard from '@/components/reports/GymReportDashboard';

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
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Reports</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Usage analytics and revenue insights for {gymName}</p>
      </div>
      <GymReportDashboard gymId={id} gymName={gymName} />
    </div>
  );
}
