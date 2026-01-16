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

  const supabase = createClient();
  
  // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_owner' || profile.role === 'gym_admin') {
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

  // Fetch machines
  const machinesResult = await supabase
    .from('machines')
    .select('*')
    .eq('gym_id', id)
    .order('created_at', { ascending: false });

  // Fetch reports (with error handling)
  let reportsResult: { data: any[] | null; error: any } = { data: [], error: null };
  try {
    reportsResult = await supabase.rpc('get_machines_with_reports', { p_gym_id: id });
  } catch (rpcError) {
    // RPC function might not exist, use empty array
    console.warn('RPC function get_machines_with_reports not available:', rpcError);
  }

  // Debug logging
  if (machinesResult.error) {
    console.error('Error fetching machines:', machinesResult.error);
    console.error('Profile role:', profile.role);
    console.error('Gym ID:', id);
    console.error('Profile ID:', profile.id);
  }

  const machines = machinesResult.data || [];
  const reports = reportsResult.data || [];

  // Create a map of machine_id -> report_count
  const reportsMap = new Map(
    reports.map((r: any) => [r.machine_id, r.report_count])
  );

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Management</h1>
        <p className="text-[#808080]">Manage treadmills and bikes with QR codes</p>
      </div>

      <MachinesManager 
        gymId={id} 
        initialMachines={machines} 
        initialReports={reportsMap}
        userRole={profile.role}
      />
    </div>
  );
}
