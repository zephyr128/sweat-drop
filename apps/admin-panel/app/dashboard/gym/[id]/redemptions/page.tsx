import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { RedemptionsManager } from '@/components/modules/RedemptionsManager';

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

  // Verify access
  if (profile.role === 'gym_admin' && profile.admin_gym_id !== id) {
    notFound();
  }

  const supabase = createClient();
  
  // Load pending redemptions
  const { data: pendingRedemptions, error: pendingError } = await supabase
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
  // Note: confirmed_by is a UUID reference to auth.users, not profiles
  // We need to join through profiles table using the user_id
  const { data: confirmedRedemptions, error: confirmedError } = await supabase
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
  
  // Fetch confirmed_by_profile separately if needed
  // Since confirmed_by references auth.users, we'll need to get it from profiles
  // For now, we'll fetch it in the component if needed

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
