import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { TeamManager } from '@/components/modules/TeamManager';
import { getStaffMembers, getStaffInvitations } from '@/lib/actions/staff-actions';

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

  const supabase = createClient();
  
  // Check if user is gym owner (owns this gym)
  const { data: gym } = await supabase
    .from('gyms')
    .select('owner_id')
    .eq('id', id)
    .single();

  const isGymOwner = gym?.owner_id === profile.id;
  const isSuperadmin = profile.role === 'superadmin';
  const isGymAdmin = profile.role === 'gym_admin' && profile.assigned_gym_id === id;

  // Only gym owner, gym admin, and superadmin can access team management
  if (!isGymOwner && !isSuperadmin && !isGymAdmin) {
    notFound();
  }

  // Fetch staff and invitations
  const [staffResult, invitationsResult] = await Promise.all([
    getStaffMembers(id),
    getStaffInvitations(id),
  ]);

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Team Management</h1>
        <p className="text-[#808080]">
          {isGymOwner 
            ? 'Assign gym admins and receptionists to this location'
            : 'Invite and manage staff members'}
        </p>
      </div>

      <TeamManager 
        gymId={id} 
        initialInvitations={invitationsResult.success ? invitationsResult.data || [] : []}
        initialStaff={staffResult.success ? staffResult.data || [] : []}
        isGymOwner={isGymOwner}
      />
    </div>
  );
}
