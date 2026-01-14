import { getCurrentProfile, isSuperadmin } from '@/lib/auth';
import { SuperadminDashboard } from '@/components/dashboards/SuperadminDashboard';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  // Middleware already handles authentication and role-based redirects
  // If we reach here, user is authenticated
  // Only superadmin should reach /dashboard (gym_admin and receptionist are redirected by middleware)
  const profile = await getCurrentProfile();
  
  // If profile fetch fails, show error instead of redirecting (to avoid loops)
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Error Loading Profile</h1>
          <p className="text-[#808080] mb-4">
            Unable to fetch your profile. This might be a database permissions issue.
          </p>
          <p className="text-[#808080] text-sm mb-4">
            Please check that the RLS migration has been applied correctly.
          </p>
          <a 
            href="/login" 
            className="text-[#00E5FF] hover:underline"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  const isSuper = await isSuperadmin();

  // Only superadmin should see this page
  // If gym_admin or receptionist reach here, middleware should have redirected them
  // But handle it gracefully just in case
  if (isSuper) {
    redirect('/dashboard/super');
  }

  // If not superadmin, redirect based on role (middleware should have caught this, but fallback)
  if (profile.assigned_gym_id) {
    redirect(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`);
  }

  // If no assigned gym, show error
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-4">No Gym Assigned</h1>
        <p className="text-[#808080]">
          Your account doesn't have a gym assigned. Please contact an administrator.
        </p>
      </div>
    </div>
  );
}
