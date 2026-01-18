// Force dynamic rendering for Next.js build
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { StoreManager } from '@/components/modules/StoreManager';

interface StorePageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  owner_id: string | null;
}

interface StoreItemData {
  id: string;
  name: string;
  description: string | null;
  gym_id: string;
  price_drops: number;
  stock: number | null;
  image_url: string | null;
  is_active: boolean;
  reward_type: string;
  created_at: string;
  updated_at: string;
}

export default async function StorePage({ params }: StorePageProps) {
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
    console.error('[StorePage] Auth check failed:', error);
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
      console.error('[StorePage] Profile fetch failed:', profileError);
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
    console.error('[StorePage] Unexpected error fetching profile:', error);
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
        console.error('[StorePage] Gym fetch failed:', gymError);
        notFound();
      }
      
      gym = gymData as GymData;
    } catch (error) {
      console.error('[StorePage] Unexpected error fetching gym:', error);
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // 4. Fetch store items with error handling
  let items: StoreItemData[] = [];
  try {
    const { data: itemsData, error: itemsError } = await supabase
      .from('rewards')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false });

    if (itemsError) {
      console.error('[StorePage] Error fetching store items:', itemsError);
    } else if (itemsData && Array.isArray(itemsData)) {
      items = itemsData as StoreItemData[];
    }
  } catch (error) {
    console.error('[StorePage] Unexpected error fetching store items:', error);
    // Continue with empty array
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Store Manager</h1>
        <p className="text-[#808080]">Manage items that users can buy with drops</p>
      </div>

      <StoreManager gymId={id} initialItems={items} />
    </div>
  );
}
