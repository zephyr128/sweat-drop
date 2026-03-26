export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireGymAccess } from '@/lib/auth-guard';
import { RiskAbuseDashboard } from '@/components/risk/RiskAbuseDashboard';
import { getGymRiskDashboard } from '@/lib/actions/risk-economy-actions';

interface RiskPageProps {
  params: Promise<{ id: string }>;
}

export default async function GymRiskPage({ params }: RiskPageProps) {
  const { id } = await params;
  await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin']);

  const risk = await getGymRiskDashboard(id);

  return (
    <div className="min-h-screen md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk & Abuse</h1>
        <p className="text-[#808080] mt-1">
          Monitor suspicious activity and execute moderation operations.
        </p>
      </div>

      {!risk.success || !risk.data ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm">
          {risk.error || 'Unable to load risk dashboard.'}
        </div>
      ) : (
        <RiskAbuseDashboard
          gymId={id}
          summary={risk.data.summary}
          flaggedUsers={risk.data.flaggedUsers}
          events={risk.data.events}
          suspiciousSessions={risk.data.suspiciousSessions}
          suspiciousRedemptions={risk.data.suspiciousRedemptions}
          backendNotes={risk.data.backendNotes}
        />
      )}
    </div>
  );
}
