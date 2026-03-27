// Route is auto-dynamic (reads cookies via requireGymAccess)

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
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Economy Settings</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
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
