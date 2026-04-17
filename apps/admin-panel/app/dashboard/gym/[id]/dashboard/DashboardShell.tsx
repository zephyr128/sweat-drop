'use client';

import { DashboardKPIGrid } from '@/components/dashboards/DashboardKPIGrid';
import { MachineOpsPanel } from '@/components/dashboards/MachineOpsPanel';
import { DeskActivityPanel } from '@/components/dashboards/DeskActivityPanel';
import { ChallengeSnapshotCard } from '@/components/dashboards/ChallengeSnapshotCard';
import { ReferralPilotCard } from '@/components/dashboards/ReferralPilotCard';
import { TopPerformersWidget } from '@/components/analytics/TopPerformersWidget';
import { HappyHourTeaser } from '@/components/economy/HappyHourTeaser';
import type { DashboardOverview } from '@/lib/actions/dashboard-types';
import type { ReferralData } from '@/lib/actions/referral-pilot-actions';

interface DashboardShellProps {
  overview: DashboardOverview;
  basePath: string;
  gymId: string;
  referralData?: ReferralData | null;
}

export function DashboardShell({ overview, basePath, gymId, referralData }: DashboardShellProps) {
  return (
    <div className="space-y-5">
      {/* ── Top: KPI Row ── */}
      <DashboardKPIGrid kpis={overview.kpis} basePath={basePath} />

      {/* ── Happy Hour teaser — links to Economy page ── */}
      <HappyHourTeaser gymId={gymId} />

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

      {/* ── Referral funnel KPIs + list ── */}
      {referralData && <ReferralPilotCard data={referralData} />}

      {/* ── Bottom: Challenges + Top Performers ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChallengeSnapshotCard snapshot={overview.challengeSnapshot} basePath={basePath} />
        <TopPerformersWidget gymId={gymId} performers={overview.topPerformers} />
      </div>
    </div>
  );
}
