// Force dynamic rendering for Next.js build
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { ChallengesManager } from '@/components/modules/ChallengesManager';

interface ChallengesPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  owner_id: string | null;
}

interface ChallengeData {
  id: string;
  name: string;
  description: string | null;
  gym_id: string;
  challenge_type: string;
  required_minutes?: number;
  drops_bounty?: number;
  reward_drops: number;
  target_drops: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  frequency?: string;
  machine_type?: string;
  streak_days?: number;
}

export default async function ChallengesPage({ params }: ChallengesPageProps) {
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
    console.error('[ChallengesPage] Auth check failed:', error);
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
      console.error('[ChallengesPage] Profile fetch failed:', profileError);
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
    console.error('[ChallengesPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
    let gym: GymData | null = null;
    try {
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('owner_id')
        .eq('id', id)
        .single();
      
      if (gymError || !gymData) {
        console.error('[ChallengesPage] Gym fetch failed:', gymError);
        notFound();
      }
      
      gym = gymData as GymData;
    } catch (error) {
      console.error('[ChallengesPage] Unexpected error fetching gym:', error);
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // 4. Fetch challenges with error handling
  let challenges: ChallengeData[] = [];
  try {
    const { data: challengesData, error: challengesError } = await supabase
      .from('challenges')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false });

    if (challengesError) {
      console.error('[ChallengesPage] Error fetching challenges:', challengesError);
    } else if (challengesData && Array.isArray(challengesData)) {
      // Map data to match Challenge interface (ensure end_date is string or undefined)
      challenges = challengesData.map((c: any) => ({
        ...c,
        end_date: c.end_date || '',
        reward_drops: c.reward_drops || c.drops_bounty || 0,
        target_drops: c.target_drops || 0,
      })) as any;
    }
  } catch (error) {
    console.error('[ChallengesPage] Unexpected error fetching challenges:', error);
    // Continue with empty array
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Challenges Manager</h1>
        <p className="text-[#808080]">Create and manage daily, weekly, and custom challenges</p>
      </div>

      <ChallengesManager gymId={id} initialChallenges={challenges as any} />
    </div>
  );
}
