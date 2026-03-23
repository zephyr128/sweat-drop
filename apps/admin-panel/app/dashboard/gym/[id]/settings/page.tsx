export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { requireGymAccess } from '@/lib/auth-guard';
import { GymInfoForm } from '@/components/forms/GymInfoForm';

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { id } = await params;

  await requireGymAccess(id);

  const supabase = await createClient();

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name, address, city, country')
    .eq('id', id)
    .single();

  if (!gym) {
    notFound();
  }

  const typedGym = gym as { id: string; name: string; address: string | null; city: string | null; country: string | null };

  return (
    <div className="min-h-screen md:p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-[#808080] mt-1">
          General settings for {typedGym.name}.
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Gym Information</h2>
          <GymInfoForm
            gymId={id}
            initialData={{
              name: typedGym.name,
              address: typedGym.address,
              city: typedGym.city,
              country: typedGym.country,
            }}
          />
        </div>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <p className="text-xs text-zinc-600">
            Check-in settings have moved to the <span className="text-[#00E5FF]">Check-in</span> page.
            Leaderboard prizes are now in <span className="text-[#00E5FF]">Leaderboard</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
