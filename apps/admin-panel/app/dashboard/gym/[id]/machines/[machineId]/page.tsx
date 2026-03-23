// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// CRITICAL: Prevent static generation by returning empty array
export function generateStaticParams() {
  return [];
}

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { MachineDetailView } from '@/components/modules/MachineDetailView';

interface MachineDetailPageProps {
  params: Promise<{ id: string; machineId: string }>;
}

interface MachineData {
  id: string;
  name: string;
  type: 'treadmill' | 'bike';
  gym_id: string;
  qr_uuid?: string | null;
  unique_qr_code: string;
  sensor_id?: string | null;
  is_active: boolean;
  is_busy?: boolean;
  is_under_maintenance?: boolean;
  maintenance_notes?: string;
  sensor_paired_at?: string | null;
  created_at: string;
  updated_at: string;
  gyms?: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  };
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const { id: gymId, machineId } = await params;

  const profile = await requireGymAccess(gymId);

  // Initialize Supabase client
  const supabase = await createClient();

  // Fetch machine details with error handling
  let machine: MachineData;
  try {
    const { data: machineData, error: machineError } = await supabase
      .from('machines')
      .select(`
        *,
        gyms (
          id,
          name,
          city,
          country
        )
      `)
      .eq('id', machineId)
      .eq('gym_id', gymId)
      .single();

    if (machineError || !machineData) {
      console.error('[MachineDetailPage] Machine fetch failed:', machineError);
      notFound();
    }

    // Map data to match Machine interface (ensure qr_uuid is string or undefined, not null)
    machine = {
      ...machineData,
      type: (machineData.type === 'treadmill' || machineData.type === 'bike') 
        ? machineData.type 
        : 'treadmill' as 'treadmill' | 'bike',
      qr_uuid: machineData.qr_uuid ? machineData.qr_uuid : undefined,
      unique_qr_code: machineData.unique_qr_code || machineData.qr_uuid || '',
    } as any;
  } catch (error) {
    console.error('[MachineDetailPage] Unexpected error fetching machine:', error);
    notFound();
  }

  // Verify machine belongs to the gym
  if (machine.gym_id !== gymId) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Details</h1>
        <p className="text-[#808080]">View and print machine sticker</p>
      </div>

      <MachineDetailView machine={machine as any} userRole={profile.role} />
    </div>
  );
}
