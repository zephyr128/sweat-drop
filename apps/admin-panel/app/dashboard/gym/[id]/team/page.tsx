// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { TeamManager } from '@/components/modules/TeamManager';
import { getStaffMembers, getStaffInvitations } from '@/lib/actions/staff-actions';

interface TeamPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  owner_id: string | null;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { id } = await params;

  const profile = await requireGymAccess(id);

  // Initialize Supabase client
  const supabase = await createClient();

  let gym: GymData | null = null;
  try {
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (gymError || !gymData) {
      console.error('[TeamPage] Gym fetch failed:', gymError);
      notFound();
    }

    gym = gymData;
  } catch (error) {
    console.error('[TeamPage] Unexpected error fetching gym:', error);
    notFound();
  }

  const isGymOwner = gym.owner_id === profile.id;

  // Fetch staff and invitations with error handling
  let staffMembers: any[] = [];
  let invitations: any[] = [];

  try {
    const [staffResult, invitationsResult] = await Promise.all([
      getStaffMembers(id),
      getStaffInvitations(id),
    ]);

    if (staffResult.success && staffResult.data) {
      staffMembers = Array.isArray(staffResult.data) ? staffResult.data : [];
    }

    if (invitationsResult.success && invitationsResult.data) {
      invitations = Array.isArray(invitationsResult.data) ? invitationsResult.data : [];
    }
  } catch (error) {
    console.error('[TeamPage] Error fetching staff/invitations:', error);
    // Continue with empty arrays - component will handle empty state
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Team Management</h1>
        <p className="text-[#808080]">
          {isGymOwner 
            ? 'Assign gym admins and receptionists to this location'
            : 'Invite and manage staff members'}
        </p>
      </div>

      <TeamManager 
        gymId={id} 
        initialInvitations={invitations}
        initialStaff={staffMembers}
        isGymOwner={isGymOwner}
      />
    </div>
  );
}
