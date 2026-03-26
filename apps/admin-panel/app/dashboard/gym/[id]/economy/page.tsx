export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { requireGymAccess } from '@/lib/auth-guard';
import { EconomySettingsPanel } from '@/components/economy/EconomySettingsPanel';
import { getEconomyConfig } from '@/lib/actions/economy-actions';

interface EconomyPageProps {
  params: Promise<{ id: string }>;
}

export default async function GymEconomyPage({ params }: EconomyPageProps) {
  const { id } = await params;
  await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin']);

  const result = await getEconomyConfig(id);

  return (
    <div className="min-h-screen md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Economy Settings</h1>
        <p className="text-[#808080] mt-1">
          Configure issuance caps, pricing guardrails, and monitor economy health.
        </p>
      </div>

      {!result.success || !result.data ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm">
          {result.error || 'Unable to load economy settings.'}
        </div>
      ) : (
        <EconomySettingsPanel
          gymId={id}
          config={result.data.config}
          summary={result.data.summary}
          defaults={result.data.defaults}
          draftExists={result.data.draftExists}
          guardrails={result.data.guardrails}
        />
      )}
    </div>
  );
}
