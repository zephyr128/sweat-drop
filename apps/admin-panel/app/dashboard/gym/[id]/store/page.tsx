export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { StorePageTabs } from '@/components/modules/StorePageTabs';

interface StorePageProps {
  params: Promise<{ id: string }>;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function StorePage({ params }: StorePageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, assigned_gym_id')
    .eq('id', user.id)
    .single();

  if (!profileData) {
    notFound();
  }

  const role = (profileData.role as string) || 'user';
  if (!['superadmin', 'gym_owner', 'gym_admin', 'receptionist'].includes(role)) {
    redirect(`/dashboard/gym/${id}/dashboard`);
  }

  const { data: gym } = await supabase
    .from('gyms')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (!gym) {
    notFound();
  }

  if (role !== 'superadmin') {
    const ownsGym = (gym as { owner_id: string | null }).owner_id === profileData.id;
    const isAssigned = profileData.assigned_gym_id === id;
    if (!ownsGym && !isAssigned) {
      notFound();
    }
  }

  // Fetch store items
  const { data: itemsData } = await supabase
    .from('rewards')
    .select('*')
    .eq('gym_id', id)
    .order('created_at', { ascending: false });

  const storeItems = (itemsData || []) as any[];

  // Fetch redemptions using admin client (bypasses RLS)
  const adminClient = getAdminClient();
  const client = adminClient || supabase;

  const redemptionSelect = `
    *,
    profiles:user_id (id, username, email),
    rewards:reward_id (id, name, reward_type, price_drops, image_url)
  `;

  const [pendingResult, confirmedResult] = await Promise.all([
    client
      .from('redemptions')
      .select(redemptionSelect)
      .eq('gym_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    client
      .from('redemptions')
      .select(redemptionSelect)
      .eq('gym_id', id)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(50),
  ]);

  function mapRedemption(r: any) {
    return {
      id: r.id,
      redemption_code: r.redemption_code || '',
      drops_spent: r.drops_spent || 0,
      status: r.status,
      source_type: r.source_type || undefined,
      description: r.description || null,
      created_at: r.created_at,
      confirmed_at: r.confirmed_at || undefined,
      profiles: r.profiles ? { id: r.profiles.id, username: r.profiles.username || '', email: r.profiles.email || '' } : null,
      rewards: r.rewards ? { id: r.rewards.id, name: r.rewards.name || '', reward_type: r.rewards.reward_type || '', price_drops: r.rewards.price_drops || 0, image_url: r.rewards.image_url || undefined } : null,
    };
  }

  const pendingRedemptions = (pendingResult.data || []).map(mapRedemption);
  const confirmedRedemptions = (confirmedResult.data || []).map(mapRedemption);

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Store</h1>
        <p className="text-[#808080] mt-1">
          Manage rewards, process redemptions, and verify pickup codes.
        </p>
      </div>

      <StorePageTabs
        gymId={id}
        storeItems={storeItems}
        pendingRedemptions={pendingRedemptions}
        confirmedRedemptions={confirmedRedemptions}
        pendingCount={pendingRedemptions.length}
      />
    </div>
  );
}
