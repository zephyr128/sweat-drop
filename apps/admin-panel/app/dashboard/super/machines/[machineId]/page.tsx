import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { MachineDetailView } from '@/components/modules/MachineDetailView';

export default async function SuperAdminMachineDetailPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  const { machineId } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'superadmin') {
    notFound();
  }

  const supabase = createClient();

  // Fetch machine details
  const { data: machine, error: machineError } = await supabase
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
    .eq('id', machineId)
    .single();

  if (machineError || !machine) {
    notFound();
  }

  // Transform data to match Machine interface
  const machineData = {
    ...machine,
    gyms: machine.gyms || null,
  };

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Machine Details</h1>
        <p className="text-[#808080]">View and print machine sticker</p>
      </div>

      <MachineDetailView machine={machineData} userRole={profile.role} />
    </div>
  );
}
