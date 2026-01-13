import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { TeamManager } from '@/components/modules/TeamManager';

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile) {
    notFound();
  }

  // Only gym_admin and superadmin can access team management
  if (profile.role !== 'gym_admin' && profile.role !== 'superadmin') {
    notFound();
  }

  // Verify access
  if (profile.role === 'gym_admin' && profile.admin_gym_id !== id) {
    notFound();
  }

  const supabase = createClient();
  const [invitationsResult, staffResult] = await Promise.all([
    supabase
      .from('staff_invitations')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, username, email, role, created_at')
      .eq('admin_gym_id', id)
      .in('role', ['gym_admin', 'receptionist'])
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Team Management</h1>
        <p className="text-[#808080]">Invite and manage staff members</p>
      </div>

      <TeamManager 
        gymId={id} 
        initialInvitations={invitationsResult.data || []}
        initialStaff={staffResult.data || []}
      />
    </div>
  );
}
