export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
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

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, assigned_gym_id')
    .eq('id', user.id)
    .single();

  if (!profileData) {
    notFound();
  }

  const profile = {
    id: profileData.id,
    role: (profileData.role as string) || 'user',
    assigned_gym_id: profileData.assigned_gym_id,
  };

  if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
    redirect(`/dashboard/gym/${id}/dashboard`);
  }

  const { data: gymData, error: gymError } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', id)
    .single();

  if (gymError || !gymData) {
    notFound();
  }

  const gym = gymData as GymData;

  if (profile.role !== 'superadmin') {
    const ownsGym = gym.owner_id === profile.id;
    const isAssigned = profile.assigned_gym_id === id;
    if (!ownsGym && !isAssigned) {
      notFound();
    }
  }

  const checkinDrops = typeof gym.checkin_drops === 'number' ? gym.checkin_drops : 20;
  const gymLat = typeof gym.lat === 'number' ? gym.lat : null;
  const gymLng = typeof gym.lng === 'number' ? gym.lng : null;
  const gpsRadiusM = typeof gym.gps_radius_m === 'number' ? gym.gps_radius_m : 200;
  const gymAddress = typeof gym.address === 'string' ? gym.address : null;
  const gymCity = typeof gym.city === 'string' ? gym.city : null;

  return (
    <div className="min-h-screen p-6 md:p-10">
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
