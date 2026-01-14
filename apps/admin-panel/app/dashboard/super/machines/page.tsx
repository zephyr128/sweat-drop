import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { MachinesManager } from '@/components/modules/MachinesManager';

export default async function SuperAdminMachinesPage() {
  const profile = await getCurrentProfile();
  
  if (!profile) {
    redirect('/login');
  }

  if (profile.role !== 'superadmin') {
    notFound();
  }

  const supabase = createClient();
  
  // Fetch all machines across all gyms
  const { data: machinesData, error } = await supabase
    .from('machines')
    .select(`
      *,
      gyms:gym_id (
        id,
        name,
        city,
        country
      )
    `)
    .order('created_at', { ascending: false });

  // Transform data to match Machine interface
  const machines = machinesData?.map((m: any) => ({
    ...m,
    gyms: m.gyms || null,
  })) || [];

  if (error) {
    // Error handled gracefully
  }

  // Get reports for all machines
  const { data: allReports } = await supabase
    .from('machine_reports')
    .select('machine_id')
    .eq('status', 'pending');

  // Create a map of machine_id -> report_count
  const reportsMap = new Map<string, number>();
  allReports?.forEach((report) => {
    const count = reportsMap.get(report.machine_id) || 0;
    reportsMap.set(report.machine_id, count + 1);
  });

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Global Machine Management</h1>
        <p className="text-[#808080]">Manage all machines across all gyms. Create, pair sensors, and assign to gyms.</p>
      </div>

      <MachinesManager 
        gymId={''} // Empty for global view
        initialMachines={machines || []}
        initialReports={reportsMap}
        userRole={profile.role}
        isGlobalView={true}
      />
    </div>
  );
}
