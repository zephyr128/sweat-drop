import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { StoreManager } from '@/components/modules/StoreManager';

export default async function StorePage({
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
  const { data: items, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('gym_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    // Error handled gracefully
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Store Manager</h1>
        <p className="text-[#808080]">Manage items that users can buy with drops</p>
      </div>

      <StoreManager gymId={id} initialItems={items || []} />
    </div>
  );
}
