// Force dynamic rendering for Next.js build
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { RedemptionsManager } from '@/components/modules/RedemptionsManager';

interface RedemptionsPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  owner_id: string | null;
}

interface RedemptionData {
  id: string;
  user_id: string;
  reward_id: string;
  gym_id: string;
  drops_spent: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  redemption_code: string;
  created_at: string;
  confirmed_at?: string | null;
  profiles?: {
    id: string;
    username: string;
    email: string;
  } | null;
  rewards?: {
    id: string;
    name: string;
    reward_type: string;
    price_drops: number;
    image_url?: string | null;
  } | null;
}

// Helper function to create admin client inside request scope
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default async function RedemptionsPage({ params }: RedemptionsPageProps) {
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
    console.error('[RedemptionsPage] Auth check failed:', error);
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
      console.error('[RedemptionsPage] Profile fetch failed:', profileError);
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
    console.error('[RedemptionsPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner' || profile.role === 'receptionist') {
    let gym: GymData | null = null;
    try {
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('owner_id')
        .eq('id', id)
        .single();
      
      if (gymError || !gymData) {
        console.error('[RedemptionsPage] Gym fetch failed:', gymError);
        notFound();
      }
      
      gym = gymData as GymData;
    } catch (error) {
      console.error('[RedemptionsPage] Unexpected error fetching gym:', error);
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }
  
  // 4. Use service role client to fetch redemptions with profiles (bypasses RLS)
  // This avoids infinite recursion issues with profiles RLS policies
  // Create admin client inside request scope (not at module level)
  const supabaseAdmin = getAdminClient();
  const clientToUse = supabaseAdmin || supabase;
  
  // 5. Load pending redemptions with error handling
  let pendingRedemptions: RedemptionData[] = [];
  try {
    const { data: pendingData, error: pendingError } = await clientToUse
      .from('redemptions')
      .select(`
        *,
        profiles:user_id (id, username, email),
        rewards:reward_id (id, name, reward_type, price_drops, image_url)
      `)
      .eq('gym_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingError) {
      console.error('[RedemptionsPage] Error fetching pending redemptions:', pendingError);
    } else if (pendingData && Array.isArray(pendingData)) {
      // Map data to match Redemption interface
      pendingRedemptions = pendingData.map((r: any) => ({
        id: r.id,
        redemption_code: r.redemption_code || '',
        drops_spent: r.drops_spent || 0,
        status: (r.status === 'pending' || r.status === 'confirmed' || r.status === 'cancelled') 
          ? r.status 
          : 'pending' as 'pending' | 'confirmed' | 'cancelled',
        created_at: r.created_at,
        confirmed_at: r.confirmed_at || undefined,
        profiles: r.profiles ? {
          id: r.profiles.id,
          username: r.profiles.username || '',
          email: r.profiles.email || '',
        } : null,
        rewards: r.rewards ? {
          id: r.rewards.id,
          name: r.rewards.name || '',
          reward_type: r.rewards.reward_type || '',
          price_drops: r.rewards.price_drops || 0,
          image_url: r.rewards.image_url || undefined,
        } : null,
      })) as RedemptionData[];
    }
  } catch (error) {
    console.error('[RedemptionsPage] Unexpected error fetching pending redemptions:', error);
    // Continue with empty array
  }

  // 6. Load confirmed redemptions (last 50) with error handling
  let confirmedRedemptions: RedemptionData[] = [];
  try {
    const { data: confirmedData, error: confirmedError } = await clientToUse
      .from('redemptions')
      .select(`
        *,
        profiles:user_id (id, username, email),
        rewards:reward_id (id, name, reward_type, price_drops, image_url)
      `)
      .eq('gym_id', id)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(50);

    if (confirmedError) {
      console.error('[RedemptionsPage] Error fetching confirmed redemptions:', confirmedError);
    } else if (confirmedData && Array.isArray(confirmedData)) {
      // Map data to match Redemption interface
      confirmedRedemptions = confirmedData.map((r: any) => ({
        id: r.id,
        redemption_code: r.redemption_code || '',
        drops_spent: r.drops_spent || 0,
        status: (r.status === 'pending' || r.status === 'confirmed' || r.status === 'cancelled') 
          ? r.status 
          : 'confirmed' as 'pending' | 'confirmed' | 'cancelled',
        created_at: r.created_at,
        confirmed_at: r.confirmed_at || undefined,
        profiles: r.profiles ? {
          id: r.profiles.id,
          username: r.profiles.username || '',
          email: r.profiles.email || '',
        } : null,
        rewards: r.rewards ? {
          id: r.rewards.id,
          name: r.rewards.name || '',
          reward_type: r.rewards.reward_type || '',
          price_drops: r.rewards.price_drops || 0,
          image_url: r.rewards.image_url || undefined,
        } : null,
      })) as RedemptionData[];
    }
  } catch (error) {
    console.error('[RedemptionsPage] Unexpected error fetching confirmed redemptions:', error);
    // Continue with empty array
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Redemptions</h1>
        <p className="text-[#808080]">Manage and validate reward redemptions</p>
      </div>

      <RedemptionsManager
        gymId={id}
        initialPendingRedemptions={pendingRedemptions as any}
        initialConfirmedRedemptions={confirmedRedemptions as any}
      />
    </div>
  );
}
