export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireProfile } from '@/lib/auth-guard';
import { PlatformReportDashboard } from '@/components/reports/PlatformReportDashboard';

export default async function SuperReportsPage() {
  await requireProfile(['superadmin']);

  return (
    <div className="md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Reports</h1>
        <p className="text-zinc-400 text-sm mt-1">SweatDrop network overview</p>
      </div>
      <PlatformReportDashboard />
    </div>
  );
}
