// Route is auto-dynamic (reads cookies via requireGymAccess/createClient)

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { requireGymAccess } from '@/lib/auth-guard';
import { getEconomyConfig } from '@/lib/actions/economy-actions';
import { GymSetupTabs } from './GymSetupTabs';

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

interface GymRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  owner_id: string | null;
  checkin_drops: number | null;
  lat: number | null;
  lng: number | null;
  gps_radius_m: number | null;
  [key: string]: unknown;
}

export default async function GymSettingsPage({ params }: SettingsPageProps) {
  const { id } = await params;

  const profile = await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin']);

  const supabase = await createClient();

  const { data: gymData, error: gymError } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', id)
    .single();

  if (gymError || !gymData) notFound();

  const gym = gymData as GymRow;

  const economyResult = await getEconomyConfig(id);
  const checkinDropsFromEconomy =
    economyResult.success && economyResult.data
      ? Number(economyResult.data.config.maxCheckinDropsPerDay)
      : null;
  const checkinDrops = Number.isFinite(checkinDropsFromEconomy)
    ? Number(checkinDropsFromEconomy)
    : typeof gym.checkin_drops === 'number'
      ? gym.checkin_drops
      : 20;

  // Fetch branding for gym owners
  let brandingData: { primary_color: string | null; logo_url: string | null; background_url: string | null } | null = null;
  if (profile.role === 'gym_owner' && gym.owner_id) {
    const { data: ownerBranding } = await supabase
      .from('owner_branding')
      .select('primary_color, logo_url, background_url')
      .eq('owner_id', gym.owner_id)
      .single();
    brandingData = ownerBranding || { primary_color: null, logo_url: null, background_url: null };
  }

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Gym Setup</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Configure your gym identity and daily operations in one place.
        </p>
      </div>

      <GymSetupTabs
        gymId={id}
        ownerId={gym.owner_id || profile.id}
        role={profile.role}
        gymData={{
          name: gym.name,
          address: gym.address,
          city: gym.city,
          country: gym.country,
        }}
        checkinData={{
          checkin_drops: checkinDrops,
          lat: typeof gym.lat === 'number' ? gym.lat : null,
          lng: typeof gym.lng === 'number' ? gym.lng : null,
          gps_radius_m: typeof gym.gps_radius_m === 'number' ? gym.gps_radius_m : 200,
          address: gym.address,
          city: gym.city,
        }}
        brandingData={brandingData}
      />
    </div>
  );
}
