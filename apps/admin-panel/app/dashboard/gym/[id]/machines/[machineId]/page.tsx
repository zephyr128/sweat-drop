// Prevent static generation for deeply nested dynamic segments
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export function generateStaticParams() { return []; }

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { MachineDetailView, type MachineForDetail } from '@/components/modules/MachineDetailView';

interface MachineDetailPageProps {
  params: Promise<{ id: string; machineId: string }>;
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const { id: gymId, machineId } = await params;

  const profile = await requireGymAccess(gymId);
  const supabase = await createClient();

  const [machineResult, gymResult] = await Promise.all([
    supabase
      .from('machines')
      .select('*, gyms (id, name, city, country)')
      .eq('id', machineId)
      .eq('gym_id', gymId)
      .single(),
    supabase.from('gyms').select('name').eq('id', gymId).single(),
  ]);

  if (machineResult.error || !machineResult.data) notFound();
  if (machineResult.data.gym_id !== gymId) notFound();

  const raw = machineResult.data;
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
    ble_device_name: raw.ble_device_name || null,
    ble_serial_number: raw.ble_serial_number || null,
    ble_pairing_verified: raw.ble_pairing_verified ?? false,
    ble_protocol: raw.ble_protocol || null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    gyms: raw.gyms as MachineForDetail['gyms'],
  };

  const gymName = gymResult.data?.name || '';

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">{machine.name}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Machine settings, QR code & printable sticker</p>
      </div>

      <MachineDetailView machine={machine} userRole={profile.role} gymName={gymName} />
    </div>
  );
}
