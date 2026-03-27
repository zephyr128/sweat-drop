// Route is auto-dynamic (reads cookies via auth check)

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { MachineDetailView, type MachineForDetail } from '@/components/modules/MachineDetailView';

interface SuperAdminMachineDetailPageProps {
  params: Promise<{ machineId: string }>;
}

export default async function SuperAdminMachineDetailPage({ params }: SuperAdminMachineDetailPageProps) {
  const { machineId } = await params;

  const supabase = await createClient();

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  if (authError || !authUser) redirect('/login');

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, username, role')
    .eq('id', authUser.id)
    .single();

  if (profileError || !profileData || profileData.role !== 'superadmin') notFound();

  const { data: machineData, error: machineError } = await supabase
    .from('machines')
    .select('*, gyms:gym_id (id, name, city, country)')
    .eq('id', machineId)
    .single();

  if (machineError || !machineData) notFound();

  const raw = machineData;
  const machine: MachineForDetail = {
    id: raw.id,
    gym_id: raw.gym_id,
    name: raw.name,
    type: raw.type || 'treadmill',
    unique_qr_code: raw.unique_qr_code || raw.qr_uuid || '',
    qr_uuid: raw.qr_uuid || undefined,
    is_active: raw.is_active,
    is_under_maintenance: raw.is_under_maintenance ?? false,
    maintenance_notes: raw.maintenance_notes || undefined,
    sensor_id: raw.sensor_id || null,
    sensor_paired_at: raw.sensor_paired_at || null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    gyms: raw.gyms as MachineForDetail['gyms'],
  };

  const gymName = (raw.gyms as Record<string, unknown>)?.name as string || '';

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">{machine.name}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Machine settings, QR code & printable sticker</p>
      </div>

      <MachineDetailView machine={machine} userRole="superadmin" gymName={gymName} />
    </div>
  );
}
