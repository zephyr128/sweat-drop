'use client';

import { DashboardKPIGrid } from '@/components/dashboards/DashboardKPIGrid';
import { MachineOpsPanel } from '@/components/dashboards/MachineOpsPanel';
import { DeskActivityPanel } from '@/components/dashboards/DeskActivityPanel';
import { ChallengeSnapshotCard } from '@/components/dashboards/ChallengeSnapshotCard';
import { TopPerformersWidget } from '@/components/analytics/TopPerformersWidget';
import type { DashboardOverview } from '@/lib/actions/dashboard-actions';

interface DashboardShellProps {
  overview: DashboardOverview;
  basePath: string;
  gymId: string;
}

export function DashboardShell({ overview, basePath, gymId }: DashboardShellProps) {
  return (
    <div className="space-y-5">
      {/* ── Top: KPI Row ── */}
      <DashboardKPIGrid kpis={overview.kpis} basePath={basePath} />

      {/* ── Middle: Machine Ops + Activity Feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MachineOpsPanel machineOps={overview.machineOps} gymId={gymId} />
        </div>
        <div className="lg:col-span-1">
          <DeskActivityPanel
            deskFeed={overview.deskFeed}
            pendingPickups={overview.kpis.storeDesk.pendingPickups}
            basePath={basePath}
          />
        </div>
      </div>

      {/* ── Bottom: Challenges + Top Performers ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChallengeSnapshotCard snapshot={overview.challengeSnapshot} basePath={basePath} />
        <TopPerformersWidget gymId={gymId} performers={overview.topPerformers} />
      </div>
    </div>
  );
}
