import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { MachinesManager } from '@/components/modules/MachinesManager';

export default async function MachinesPage({
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
  const { data: machines, error } = await supabase
    .from('machines')
    .select('*')
    .eq('gym_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    // Error handled gracefully
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Management</h1>
        <p className="text-[#808080]">Manage treadmills and bikes with QR codes</p>
      </div>

      <MachinesManager gymId={id} initialMachines={machines || []} />
    </div>
  );
}
