// Force dynamic rendering for Next.js build
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { MachinesManager } from '@/components/modules/MachinesManager';

interface MachinesPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  owner_id: string | null;
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
}

interface ReportData {
  machine_id: string;
  report_count: number;
}

export default async function MachinesPage({ params }: MachinesPageProps) {
  const { id } = await params;
  
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
    console.error('[MachinesPage] Auth check failed:', error);
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
      console.error('[MachinesPage] Profile fetch failed:', profileError);
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
  } catch (error) {
    console.error('[MachinesPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_owner' || profile.role === 'gym_admin') {
    let gym: GymData | null = null;
    try {
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('owner_id')
        .eq('id', id)
        .single();
      
      if (gymError || !gymData) {
        console.error('[MachinesPage] Gym fetch failed:', gymError);
        notFound();
      }
      
      gym = gymData as GymData;
    } catch (error) {
      console.error('[MachinesPage] Unexpected error fetching gym:', error);
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // 4. Fetch machines with error handling
  let machines: MachineData[] = [];
  try {
    const { data: machinesData, error: machinesError } = await supabase
      .from('machines')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false });

    if (machinesError) {
      console.error('[MachinesPage] Error fetching machines:', machinesError);
    } else if (machinesData && Array.isArray(machinesData)) {
      // Map data to match Machine interface (ensure qr_uuid is string or undefined, not null)
      machines = machinesData.map((m: any) => ({
        ...m,
        type: (m.type === 'treadmill' || m.type === 'bike') ? m.type : 'treadmill' as 'treadmill' | 'bike',
        qr_uuid: m.qr_uuid ? m.qr_uuid : undefined,
        unique_qr_code: m.unique_qr_code || m.qr_uuid || '',
      })) as any;
    }
  } catch (error) {
    console.error('[MachinesPage] Unexpected error fetching machines:', error);
    // Continue with empty array
  }

  // 5. Fetch reports with error handling
  let reports: ReportData[] = [];
  const reportsMap = new Map<string, number>();
  
  try {
    const { data: reportsData, error: reportsError } = await supabase.rpc('get_machines_with_reports', { 
      p_gym_id: id 
    });

    if (reportsError) {
      console.warn('[MachinesPage] RPC function get_machines_with_reports not available or failed:', reportsError);
    } else if (reportsData && Array.isArray(reportsData)) {
      reports = reportsData as ReportData[];
      // Create map of machine_id -> report_count
      reports.forEach((r: ReportData) => {
        if (r.machine_id && typeof r.report_count === 'number') {
          reportsMap.set(r.machine_id, r.report_count);
        }
      });
    }
  } catch (error) {
    console.warn('[MachinesPage] Error fetching reports:', error);
    // Continue with empty map
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Management</h1>
        <p className="text-[#808080]">Manage treadmills and bikes with QR codes</p>
      </div>

      <MachinesManager 
        gymId={id} 
        initialMachines={machines as any} 
        initialReports={reportsMap}
        userRole={profile.role}
      />
    </div>
  );
}
