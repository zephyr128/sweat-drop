// Route is auto-dynamic (reads cookies via requireGymAccess/createClient)

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { TeamPageView } from '@/components/modules/TeamPageView';
import { getStaffMembers, getStaffInvitations } from '@/lib/actions/staff-actions';

interface TeamPageProps {
  params: Promise<{ id: string }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { id } = await params;
  const profile = await requireGymAccess(id);

  const supabase = await createClient();
  const { data: gymData } = await supabase
    .from('gyms')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (!gymData) notFound();
  const isGymOwner = (gymData as { owner_id: string | null }).owner_id === profile.id;

  let staffMembers: any[] = [];
  let invitations: any[] = [];
  try {
    const [staffResult, invitationsResult] = await Promise.all([
      getStaffMembers(id),
      getStaffInvitations(id),
    ]);
    if (staffResult.success && staffResult.data) staffMembers = Array.isArray(staffResult.data) ? staffResult.data : [];
    if (invitationsResult.success && invitationsResult.data) invitations = Array.isArray(invitationsResult.data) ? invitationsResult.data : [];
  } catch { /* continue with empty arrays */ }

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Team</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {isGymOwner
            ? 'Assign gym admins and receptionists to this location.'
            : 'Manage staff members and invitations.'}
        </p>
      </div>

      <TeamPageView
        gymId={id}
        isGymOwner={isGymOwner}
        initialStaff={staffMembers}
        initialInvitations={invitations}
      />
    </div>
  );
}
