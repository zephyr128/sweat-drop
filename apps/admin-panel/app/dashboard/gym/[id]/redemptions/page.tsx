// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { requireGymAccess } from '@/lib/auth-guard';
import { RedemptionsManager } from '@/components/modules/RedemptionsManager';

interface RedemptionsPageProps {
  params: Promise<{ id: string }>;
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

export default async function RedemptionsPage({ params }: RedemptionsPageProps) {
  const { id } = await params;

  await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);

  const supabase = await createClient();

  // Use service role client to fetch redemptions with profiles (bypasses RLS)
  // This avoids infinite recursion issues with profiles RLS policies
  // Create admin client inside request scope (not at module level)
  const supabaseAdmin = getAdminClient();
  const clientToUse = supabaseAdmin || supabase;
  
  // Load pending redemptions with error handling
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

  // Load confirmed redemptions (last 50) with error handling
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
      <div className="mb-8">
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
