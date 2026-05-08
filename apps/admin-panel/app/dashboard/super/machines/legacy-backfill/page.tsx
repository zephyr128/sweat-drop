// Route is auto-dynamic (reads cookies via getCurrentProfile)

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { BleIdentityBackfillManager } from '@/components/modules/BleIdentityBackfillManager';

export const metadata = { title: 'BLE Identity Backfill' };

export default async function BleIdentityBackfillPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }
  if (profile.role !== 'superadmin') {
    notFound();
  }

  const supabase = await createClient();

  const { data: machinesRaw } = await (supabase as any)
    .from('machines')
    .select(`
      id,
      name,
      gym_id,
      sensor_id,
      sensor_paired_at,
      ble_device_name,
      ble_serial_number,
      ble_pairing_verified,
      gyms:gym_id (
        id,
        name
      )
    `)
    .order('gym_id', { ascending: true })
    .order('name', { ascending: true });

  const machines = (machinesRaw ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    gym_id: m.gym_id,
    gym_name: m.gyms?.name ?? 'Unknown Gym',
    sensor_id: m.sensor_id ?? null,
    sensor_paired_at: m.sensor_paired_at ?? null,
    ble_device_name: m.ble_device_name ?? null,
    ble_serial_number: m.ble_serial_number ?? null,
    ble_pairing_verified: m.ble_pairing_verified ?? false,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">BLE Identity Backfill</h1>
        <p className="text-[#808080] mt-2 text-sm">
          Machines paired before the BLE Local Name architecture upgrade need their{' '}
          <code className="text-[#00E5FF] text-xs">ble_device_name</code> populated.
          Legacy machines will auto-heal on first workout (via{' '}
          <code className="text-[#00E5FF] text-xs">cache_machine_ble_identity</code>).
          You can also enter names manually or re-pair here.
        </p>
      </div>
      <BleIdentityBackfillManager machines={machines} />
    </div>
  );
}
