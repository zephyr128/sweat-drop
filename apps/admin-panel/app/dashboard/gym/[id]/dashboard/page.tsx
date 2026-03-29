// LIVE: Operational command center — must always show fresh data
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import { getGymDashboardOverview } from '@/lib/actions/dashboard-actions';
import { getReferralData } from '@/lib/actions/referral-pilot-actions';
import { NetworkOverviewToggle } from '@/components/dashboards/NetworkOverviewToggle';
import { SmartCoachToggle } from '@/components/SmartCoachToggle';
import { SetupChecklist, type SetupStatus } from '@/components/dashboards/SetupChecklist';
import { DashboardShell } from './DashboardShell';

interface DashboardPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  owner_id: string | null;
  smartcoach_enabled: boolean;
}

export default async function GymDashboardPage({ params }: DashboardPageProps) {
  const { id } = await params;

  const profile = await requireGymAccess(id);

  const supabase = await createClient();
  const { data: gymData, error: gymError } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', id)
    .single();

  if (gymError || !gymData) notFound();

  const gym = gymData as GymData;
  if (typeof gym.smartcoach_enabled !== 'boolean') gym.smartcoach_enabled = false;

  const [overviewResult, referralResult] = await Promise.all([
    getGymDashboardOverview(id),
    getReferralData(id),
  ]);
  const overview = overviewResult.data ?? null;
  const referralData = referralResult.data ?? null;

  // Setup checklist for owners/admins
  let setupStatus: SetupStatus | null = null;
  if ((profile.role === 'gym_owner' || profile.role === 'gym_admin') && overview && !overview.setupComplete) {
    const hasName = Boolean(gym.name && gym.name.trim());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasAddress = Boolean((gym as any).address && String((gym as any).address).trim());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gymLat = (gymData as any).lat;
    const hasCheckinCoords = typeof gymLat === 'number' && gymLat !== 0;

    const [rewardCount, machineCount, staffCount] = await Promise.all([
      supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('gym_id', id).eq('is_active', true),
      supabase.from('machines').select('id', { count: 'exact', head: true }).eq('gym_id', id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('assigned_gym_id', id).in('role', ['gym_admin', 'receptionist']),
    ]);

    setupStatus = {
      gymInfo: hasName && hasAddress,
      checkinLocation: hasCheckinCoords,
      firstReward: (rewardCount.count ?? 0) > 0,
      firstMachine: (machineCount.count ?? 0) > 0,
      invitedStaff: (staffCount.count ?? 0) > 0,
    };

    const allDone = Object.values(setupStatus).every(Boolean);
    if (allDone) setupStatus = null;
  }

  const ownerId = gym.owner_id || profile.id;
  const basePath = `/dashboard/gym/${id}`;

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{gym.name}</h1>
          <p className="text-xs text-zinc-500">
            {gym.city && `${gym.city}, `}{gym.country}
          </p>
        </div>
        {profile.role === 'superadmin' && (
          <SmartCoachToggle gymId={gym.id} initialEnabled={gym.smartcoach_enabled} />
        )}
      </div>

      {/* Setup checklist (only if incomplete) — above network toggle */}
      {setupStatus && <SetupChecklist gymId={id} status={setupStatus} />}

      {/* Network toggle (multi-gym owners) */}
      {profile.role === 'gym_owner' && gym.owner_id && (
        <NetworkOverviewToggle ownerId={ownerId} currentGymId={id} />
      )}

      {/* Dashboard shell (client) renders KPIs, panels, cards */}
      {overview ? (
        <DashboardShell overview={overview} basePath={basePath} gymId={id} referralData={referralData} />
      ) : (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-500">Dashboard data unavailable. Please try refreshing.</p>
        </div>
      )}
    </div>
  );
}
