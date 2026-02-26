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
import { Dumbbell, Lock } from 'lucide-react';

interface WorkoutPlansPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  owner_id: string | null;
  smartcoach_enabled: boolean;
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
  template_goal?: string | null;
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

  // 3. Fetch gym data and verify access
  let gym: GymData | null = null;
  try {
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .select('id, name, owner_id, smartcoach_enabled')
      .eq('id', id)
      .single();
    
    if (gymError || !gymData) {
      console.error('[WorkoutPlansPage] Gym fetch failed:', gymError);
      notFound();
    }
    
    gym = gymData as GymData;
    // Ensure smartcoach_enabled has a default value if not present
    if (typeof gym.smartcoach_enabled !== 'boolean') {
      gym.smartcoach_enabled = false;
    }
  } catch (error) {
    console.error('[WorkoutPlansPage] Unexpected error fetching gym:', error);
    notFound();
  }

  // 4. Verify access: superadmin can access all, gym_admin/gym_owner need to own or be assigned
  if (profile.role !== 'superadmin') {
    if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
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

  // Get smartcoach_enabled status
  const smartcoachEnabled = gym.smartcoach_enabled;

  // 5. Fetch workout plans for this gym with error handling (only if smartcoach is enabled)
  let plans: WorkoutPlan[] = [];
  let machines: MachineData[] = [];
  
  if (smartcoachEnabled) {
    try {
      const { data: plansData, error: plansError } = await supabase
        .from('workout_plans')
        .select(`
          *,
          items:workout_plan_items(*)
        `)
        .eq('gym_id', id)
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

    // 6. Fetch machines for plan items (for display) with error handling
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
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">SmartCoach Dashboard</h1>
        <p className="text-[#808080]">Monitor workout plans, active sessions, and revenue</p>
      </div>

      {!smartcoachEnabled ? (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-[#00E5FF] opacity-10 rounded-full blur-3xl"></div>
              <div className="relative bg-[#0A0A0A] border-2 border-[#1A1A1A] rounded-full p-6">
                <Dumbbell className="w-16 h-16 text-[#808080]" />
                <div className="absolute top-2 right-2">
                  <Lock className="w-6 h-6 text-[#808080]" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">SmartCoach Feature Disabled</h2>
              <p className="text-[#808080] max-w-md">
                SmartCoach workout plans are currently disabled for this gym. 
                Contact your superadmin to enable this feature.
              </p>
            </div>
            <div className="pt-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg">
                <Lock className="w-4 h-4 text-[#808080]" />
                <span className="text-sm text-[#808080]">Feature requires activation</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <WorkoutPlansManager 
            gymId={id} 
            initialPlans={plans} 
            machines={machines}
          />
        </div>
      )}
    </div>
  );
}
