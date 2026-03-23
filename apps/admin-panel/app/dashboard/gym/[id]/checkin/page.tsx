export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { requireGymAccess } from '@/lib/auth-guard';
import { CheckinSettingsModule } from '@/components/modules/CheckinSettingsModule';
import { CheckinStatsModule } from '@/components/modules/CheckinStatsModule';

interface CheckinPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  owner_id: string | null;
  [key: string]: unknown;
}

export default async function CheckinPage({ params }: CheckinPageProps) {
  const { id } = await params;

  await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);

  const supabase = await createClient();

  const { data: gymData, error: gymError } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', id)
    .single();

  if (gymError || !gymData) {
    notFound();
  }

  const gym = gymData as GymData;

  const checkinDrops = typeof gym.checkin_drops === 'number' ? gym.checkin_drops : 20;
  const gymLat = typeof gym.lat === 'number' ? gym.lat : null;
  const gymLng = typeof gym.lng === 'number' ? gym.lng : null;
  const gpsRadiusM = typeof gym.gps_radius_m === 'number' ? gym.gps_radius_m : 200;
  const gymAddress = typeof gym.address === 'string' ? gym.address : null;
  const gymCity = typeof gym.city === 'string' ? gym.city : null;

  return (
    <div className="min-h-screen md:p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Check-in</h1>
        <p className="text-[#808080] mt-1">
          Manage QR check-in, GPS settings, and view check-in activity.
        </p>
      </div>

      <div className="space-y-8">
        <CheckinSettingsModule
          gymId={id}
          initialData={{
            checkin_drops: checkinDrops,
            lat: gymLat,
            lng: gymLng,
            gps_radius_m: gpsRadiusM,
            address: gymAddress,
            city: gymCity,
          }}
        />

        <CheckinStatsModule gymId={id} />
      </div>
    </div>
  );
}
