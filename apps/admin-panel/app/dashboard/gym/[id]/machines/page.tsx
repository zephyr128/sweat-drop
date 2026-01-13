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
  const [machinesResult, reportsResult] = await Promise.all([
    supabase
      .from('machines')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_machines_with_reports', { p_gym_id: id }),
  ]);

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
      />
    </div>
  );
}
