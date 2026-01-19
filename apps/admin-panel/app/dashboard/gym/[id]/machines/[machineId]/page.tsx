// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// CRITICAL: Prevent static generation by returning empty array
export function generateStaticParams() {
  return [];
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { MachineDetailView } from '@/components/modules/MachineDetailView';

interface MachineDetailPageProps {
  params: Promise<{ id: string; machineId: string }>;
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
  gyms?: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  };
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const { id: gymId, machineId } = await params;
  
  // Initialize Supabase client
  const supabase = await createClient();
  
  // 1. Check authentication first
  let user;
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      redirect('/login');
    }
    
    user = authUser;
  } catch (error) {
    console.error('[MachineDetailPage] Auth check failed:', error);
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
      console.error('[MachineDetailPage] Profile fetch failed:', profileError);
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
    console.error('[MachineDetailPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_owner' || profile.role === 'gym_admin') {
    let gym: GymData | null = null;
    try {
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (gymError || !gymData) {
        console.error('[MachineDetailPage] Gym fetch failed:', gymError);
        notFound();
      }
      
      gym = gymData as GymData;
    } catch (error) {
      console.error('[MachineDetailPage] Unexpected error fetching gym:', error);
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === gymId;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // 4. Fetch machine details with error handling
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

  // 5. Verify machine belongs to the gym
  if (machine.gym_id !== gymId) {
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
