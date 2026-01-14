import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { RedemptionsManager } from '@/components/modules/RedemptionsManager';

// Service role client to bypass RLS for fetching profiles
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = supabaseServiceKey 
  ? createAdminClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export default async function RedemptionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile) {
    notFound();
  }

  const supabase = createClient();
  
  // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner' || profile.role === 'receptionist') {
    const { data: gym } = await supabase
      .from('gyms')
      .select('owner_id')
      .eq('id', id)
      .single();
    
    if (!gym) {
      notFound();
    }
    
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }
  
  // Use service role client to fetch redemptions with profiles (bypasses RLS)
  // This avoids infinite recursion issues with profiles RLS policies
  const clientToUse = supabaseAdmin || supabase;
  
  // Load pending redemptions
  const { data: pendingRedemptions, error: pendingError } = await clientToUse
    .from('redemptions')
    .select(`
      *,
      profiles:user_id (id, username, email),
      rewards:reward_id (id, name, reward_type, price_drops, image_url)
    `)
    .eq('gym_id', id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Load confirmed redemptions (last 50)
  const { data: confirmedRedemptions, error: confirmedError } = await clientToUse
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

  if (pendingError || confirmedError) {
    // Errors handled gracefully - components will show empty state
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Redemptions</h1>
        <p className="text-[#808080]">Manage and validate reward redemptions</p>
      </div>

      <RedemptionsManager
        gymId={id}
        initialPendingRedemptions={pendingRedemptions || []}
        initialConfirmedRedemptions={confirmedRedemptions || []}
      />
    </div>
  );
}
