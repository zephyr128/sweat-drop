// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface GymDetailPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  primary_color: string | null;
}

interface AdminData {
  username: string | null;
  email: string | null;
}

export default async function GymDetailPage({ params }: GymDetailPageProps) {
  const { id } = await params;
  
  // Initialize Supabase client
  const supabase = await createClient();
  
  // 1. Check authentication first
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      redirect('/login');
    }
    
    // User is authenticated - no need to store it
  } catch (error) {
    console.error('[GymDetailPage] Auth check failed:', error);
    redirect('/login');
  }

  // 2. Fetch gym data with error handling
  let gym: GymData;
  try {
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .select('*')
      .eq('id', id)
      .single();

    if (gymError || !gymData) {
      console.error('[GymDetailPage] Gym fetch failed:', gymError);
      notFound();
    }

    gym = gymData as GymData;
  } catch (error) {
    console.error('[GymDetailPage] Unexpected error fetching gym:', error);
    notFound();
  }

  // 3. Get gym admin (if any) with error handling
  let admin: AdminData | null = null;
  try {
    const { data: adminData, error: adminError } = await supabase
      .from('profiles')
      .select('username, email')
      .eq('assigned_gym_id', gym.id)
      .eq('role', 'gym_admin')
      .single();

    if (!adminError && adminData) {
      admin = adminData as AdminData;
    }
  } catch (error) {
    console.warn('[GymDetailPage] Error fetching admin (may not exist):', error);
    // Continue without admin - it's optional
  }

  // 4. Get stats with error handling
  let members = 0;
  let challenges = 0;
  let storeItems = 0;

  try {
    const [
      membersResult,
      challengesResult,
      storeItemsResult,
    ] = await Promise.all([
      supabase
        .from('gym_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', gym.id),
      supabase
        .from('challenges')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', gym.id),
      supabase
        .from('rewards')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', gym.id),
    ]);

    members = membersResult.count || 0;
    challenges = challengesResult.count || 0;
    storeItems = storeItemsResult.count || 0;
  } catch (error) {
    console.error('[GymDetailPage] Error fetching stats:', error);
    // Continue with default values
  }

  return (
    <div>
      <div className="mb-8">
        <Link 
          href="/dashboard/gyms"
          className="text-[#00E5FF] hover:text-[#00B8CC] mb-2 inline-block"
        >
          ← Back to Gyms
        </Link>
        <h1 className="text-4xl font-bold text-white mb-2">{gym.name}</h1>
        <p className="text-[#808080]">
          {gym.city && `${gym.city}, `}
          {gym.country}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Members</h3>
          <p className="text-3xl font-bold text-white">{members}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Active Challenges</h3>
          <p className="text-3xl font-bold text-white">{challenges}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Store Items</h3>
          <p className="text-3xl font-bold text-white">{storeItems}</p>
        </div>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Gym Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[#808080]">Gym Admin</label>
            <p className="text-white">
              {admin ? `${admin.username || admin.email}` : 'No admin assigned'}
            </p>
          </div>
          {gym.address && (
            <div>
              <label className="text-sm text-[#808080]">Address</label>
              <p className="text-white">{gym.address}</p>
            </div>
          )}
          {gym.primary_color && (
            <div>
              <label className="text-sm text-[#808080]">Primary Color</label>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="w-8 h-8 rounded border border-[#1A1A1A]"
                  style={{ backgroundColor: gym.primary_color }}
                />
                <span className="text-white">{gym.primary_color}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
