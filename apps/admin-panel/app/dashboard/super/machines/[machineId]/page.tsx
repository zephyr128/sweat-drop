// Force dynamic rendering for Next.js build
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { MachineDetailView } from '@/components/modules/MachineDetailView';

interface SuperAdminMachineDetailPageProps {
  params: Promise<{ machineId: string }>;
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
  } | null;
}

export default async function SuperAdminMachineDetailPage({ params }: SuperAdminMachineDetailPageProps) {
  const { machineId } = await params;
  
  // Initialize Supabase client
  const supabase = createClient();
  
  // 1. Check authentication first
  let user;
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      redirect('/login');
    }
    
    user = authUser;
  } catch (error) {
    console.error('[SuperAdminMachineDetailPage] Auth check failed:', error);
    redirect('/login');
  }

  // 2. Fetch user profile
  let profile;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, username, role, assigned_gym_id, owner_id, home_gym_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      console.error('[SuperAdminMachineDetailPage] Profile fetch failed:', profileError);
      notFound();
    }

    profile = {
      id: profileData.id,
      email: profileData.email || user.email || '',
      username: profileData.username,
      role: (profileData.role as 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user') || 'user',
      assigned_gym_id: profileData.assigned_gym_id,
      owner_id: profileData.owner_id,
      home_gym_id: profileData.home_gym_id,
    };

    // Verify superadmin access
    if (profile.role !== 'superadmin') {
      notFound();
    }
  } catch (error) {
    console.error('[SuperAdminMachineDetailPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Fetch machine details with error handling
  let machine: MachineData;
  try {
    const { data: machineData, error: machineError } = await supabase
      .from('machines')
      .select(`
        *,
        gyms:gym_id (
          id,
          name,
          city,
          country
        )
      `)
      .eq('id', machineId)
      .single();

    if (machineError || !machineData) {
      console.error('[SuperAdminMachineDetailPage] Machine fetch failed:', machineError);
      notFound();
    }

    // Transform data to match Machine interface
    machine = {
      ...machineData,
      type: (machineData.type === 'treadmill' || machineData.type === 'bike') 
        ? machineData.type 
        : 'treadmill' as 'treadmill' | 'bike',
      qr_uuid: machineData.qr_uuid ? machineData.qr_uuid : undefined,
      unique_qr_code: machineData.unique_qr_code || machineData.qr_uuid || '',
      gyms: machineData.gyms || null,
    } as MachineData;
  } catch (error) {
    console.error('[SuperAdminMachineDetailPage] Unexpected error fetching machine:', error);
    notFound();
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Details</h1>
        <p className="text-[#808080]">View and print machine sticker</p>
      </div>

      <MachineDetailView machine={machine as any} userRole={profile.role} />
    </div>
  );
}
