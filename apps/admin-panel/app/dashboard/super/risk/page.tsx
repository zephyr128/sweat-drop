// Route is auto-dynamic (reads cookies via getCurrentProfile)

import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { getSuperRiskDashboard } from '@/lib/actions/risk-economy-actions';
import { SuperRiskOverview } from '@/components/risk/SuperRiskOverview';

export default async function SuperRiskPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'superadmin') notFound();

  const result = await getSuperRiskDashboard();

  return (
    <div className="min-h-screen md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Network Risk Console</h1>
        <p className="text-[#808080] mt-1">
          Cross-gym abuse visibility for platform operations.
        </p>
      </div>

      {!result.success || !result.data ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm">
          {result.error || 'Unable to load risk console.'}
        </div>
      ) : (
        <SuperRiskOverview
          totalGyms={result.data.totalGyms}
          gymsAtRisk={result.data.gymsAtRisk}
          totalUnresolvedEvents={result.data.totalUnresolvedEvents}
          gyms={result.data.gyms}
        />
      )}
    </div>
  );
}
