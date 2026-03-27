// LIVE: Real-time check-in activity
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireGymAccess } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase-server';
import { CheckinStatsModule } from '@/components/modules/CheckinStatsModule';
import { Settings } from 'lucide-react';

interface CheckinPageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckinPage({ params }: CheckinPageProps) {
  const { id } = await params;

  const profile = await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);
  const isReceptionist = profile.role === 'receptionist';

  const supabase = await createClient();
  const { data: gymRow } = await supabase
    .from('gyms')
    .select('checkin_verification_mode, checkin_drops')
    .eq('id', id)
    .single();

  const gym = gymRow as { checkin_verification_mode?: string | null; checkin_drops?: number | null } | null;
  const verificationMode = gym?.checkin_verification_mode === 'strict' ? 'strict' : 'lenient';
  const configuredCheckinDrops =
    typeof gym?.checkin_drops === 'number' && Number.isFinite(gym.checkin_drops) ? gym.checkin_drops : undefined;

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Check-in</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Successful QR check-ins only — drops awarded and GPS status per row.
          </p>
        </div>
        {!isReceptionist && (
          <Link
            href={`/dashboard/gym/${id}/settings?tab=location`}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-zinc-400 hover:text-white hover:border-zinc-700/60 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            Check-in Settings
          </Link>
        )}
      </div>

      <CheckinStatsModule
        gymId={id}
        checkinVerificationMode={verificationMode}
        configuredCheckinDrops={configuredCheckinDrops}
      />
    </div>
  );
}
