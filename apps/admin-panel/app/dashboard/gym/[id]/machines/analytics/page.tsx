// Route is auto-dynamic (reads cookies via requireGymAccess)

import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MachineAnalyticsDashboard } from '@/components/analytics/MachineAnalyticsDashboard';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MachineAnalyticsPage({ params }: PageProps) {
  const { id } = await params;
  await requireGymAccess(id);

  const supabase = await createClient();
  const { data: gym } = await supabase
    .from('gyms')
    .select('name')
    .eq('id', id)
    .single();

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <Link
          href={`/dashboard/gym/${id}/machines`}
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white text-xs mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Machines
        </Link>
        <h1 className="text-xl font-bold text-white">Machine Analytics</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Usage analytics and heatmaps{gym?.name ? ` for ${gym.name}` : ''}
        </p>
      </div>

      <MachineAnalyticsDashboard gymId={id} />
    </div>
  );
}
