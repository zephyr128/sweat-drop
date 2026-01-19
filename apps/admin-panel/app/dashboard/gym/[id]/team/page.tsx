// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
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
  
  // Initialize Supabase client
  const supabase = await createClient();
  
  // 1. Check authentication first
  let user;
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      redirect('/login');
    }
    
    user = authUser;
  } catch (error) {
    console.error('[TeamPage] Auth check failed:', error);
    redirect('/login');
  }

  // 2. Fetch user profile
  let profile;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, username, role, assigned_gym_id, owner_id, home_gym_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      console.error('[TeamPage] Profile fetch failed:', profileError);
      notFound();
    }

    profile = {
      id: profileData.id,
      email: profileData.email || user.email || '',
      username: profileData.username,
      role: (profileData.role as 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user') || 'user',
      assigned_gym_id: profileData.assigned_gym_id,
      owner_id: profileData.owner_id,
      home_gym_id: profileData.home_gym_id,
    };
  } catch (error) {
    console.error('[TeamPage] Unexpected error fetching profile:', error);
    notFound();
  }

  // 3. Fetch gym data and verify access
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

  // 4. Verify access permissions
  const isGymOwner = gym.owner_id === profile.id;
  const isSuperadmin = profile.role === 'superadmin';
  const isGymAdmin = profile.role === 'gym_admin' && profile.assigned_gym_id === id;

  if (!isGymOwner && !isSuperadmin && !isGymAdmin) {
    notFound();
  }

  // 5. Fetch staff and invitations with error handling
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
        initialInvitations={invitations}
        initialStaff={staffMembers}
        isGymOwner={isGymOwner}
      />
    </div>
  );
}
