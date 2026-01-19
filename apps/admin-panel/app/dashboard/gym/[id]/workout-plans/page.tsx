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
import { WorkoutPlansManager } from '@/components/modules/WorkoutPlansManager';
import { SmartCoachOverview } from '@/components/modules/SmartCoachOverview';

interface WorkoutPlansPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  owner_id: string | null;
}

interface WorkoutPlanItem {
  id: string;
  plan_id: string;
  order_index: number;
  exercise_name: string;
  exercise_description: string | null;
  target_machine_type: string;
  target_metric: string;
  target_value: number;
  target_unit: string | null;
  rest_seconds: number;
  sets: number;
  instruction_video_url: string | null;
  target_machine_id: string | null;
}

interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  access_level: string;
  access_type: string;
  price: number;
  currency: string;
  difficulty_level: string | null;
  estimated_duration_minutes: number | null;
  category: string | null;
  is_active: boolean;
  items?: WorkoutPlanItem[];
}

interface MachineData {
  id: string;
  name: string;
  type: string;
}

export default async function WorkoutPlansPage({ params }: WorkoutPlansPageProps) {
  const { id } = await params;
  
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
    console.error('[WorkoutPlansPage] Auth check failed:', error);
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
      console.error('[WorkoutPlansPage] Profile fetch failed:', profileError);
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
    console.error('[WorkoutPlansPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Verify access: superadmin can access all, gym_admin/gym_owner need to own or be assigned
  if (profile.role !== 'superadmin') {
    if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
      let gym: GymData | null = null;
      try {
        const { data: gymData, error: gymError } = await supabase
          .from('gyms')
          .select('id, name, owner_id')
          .eq('id', id)
          .single();
        
        if (gymError || !gymData) {
          console.error('[WorkoutPlansPage] Gym fetch failed:', gymError);
          notFound();
        }
        
        gym = gymData as GymData;
      } catch (error) {
        console.error('[WorkoutPlansPage] Unexpected error fetching gym:', error);
        notFound();
      }
      
      // Check if user owns this gym OR it's their assigned gym
      const ownsGym = gym.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === id;
      
      if (!ownsGym && !isAssignedGym) {
        notFound();
      }
    } else {
      // Other roles don't have access
      notFound();
    }
  }

  // 4. Fetch workout plans for this gym with error handling
  let plans: WorkoutPlan[] = [];
  try {
    const { data: plansData, error: plansError } = await supabase
      .from('workout_plans')
      .select(`
        *,
        items:workout_plan_items(*)
      `)
      .eq('gym_id', id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (plansError) {
      console.error('[WorkoutPlansPage] Error fetching workout plans:', plansError);
    } else if (plansData && Array.isArray(plansData)) {
      plans = plansData as WorkoutPlan[];
    }
  } catch (error) {
    console.error('[WorkoutPlansPage] Unexpected error fetching workout plans:', error);
    // Continue with empty array
  }

  // 5. Fetch machines for plan items (for display) with error handling
  let machines: MachineData[] = [];
  try {
    const { data: machinesData, error: machinesError } = await supabase
      .from('machines')
      .select('id, name, type')
      .eq('gym_id', id)
      .eq('is_active', true);

    if (machinesError) {
      console.error('[WorkoutPlansPage] Error fetching machines:', machinesError);
    } else if (machinesData && Array.isArray(machinesData)) {
      machines = machinesData as MachineData[];
    }
  } catch (error) {
    console.error('[WorkoutPlansPage] Unexpected error fetching machines:', error);
    // Continue with empty array
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">SmartCoach Dashboard</h1>
        <p className="text-[#808080]">Monitor workout plans, active sessions, and revenue</p>
      </div>

      {/* Overview with Statistics */}
      <div className="mb-8">
        <SmartCoachOverview gymId={id} />
      </div>

      {/* Plans Manager */}
      <div className="mt-12">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Workout Plans Manager</h2>
          <p className="text-[#808080]">Create and manage workout plans for your gym members</p>
        </div>
        <WorkoutPlansManager 
          gymId={id} 
          initialPlans={plans} 
          machines={machines}
        />
      </div>
    </div>
  );
}
