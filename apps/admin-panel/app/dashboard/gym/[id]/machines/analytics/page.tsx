export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
    <div>
      <div className="mb-8">
        <Link
          href={`/dashboard/gym/${id}/machines`}
          className="inline-flex items-center gap-1.5 text-[#808080] hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Machines
        </Link>
        <h1 className="text-4xl font-bold text-white mb-2">Machine Analytics</h1>
        <p className="text-[#808080]">
          Usage analytics and heatmaps{gym?.name ? ` for ${gym.name}` : ''}
        </p>
      </div>

      <MachineAnalyticsDashboard gymId={id} />
    </div>
  );
}
