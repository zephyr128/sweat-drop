import { getCurrentProfile, isSuperadmin } from '@/lib/auth';
import { SuperadminDashboard } from '@/components/dashboards/SuperadminDashboard';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  // Middleware already handles authentication and role-based redirects
  // If we reach here, user is authenticated
  // Only superadmin should reach /dashboard (gym_admin and receptionist are redirected by middleware)
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  const isSuper = await isSuperadmin();

  // Only superadmin should see this page
  // If gym_admin or receptionist reach here, middleware should have redirected them
  // But handle it gracefully just in case
  if (isSuper) {
    return <SuperadminDashboard />;
  }

  // If not superadmin, redirect based on role (middleware should have caught this, but fallback)
  if (profile.admin_gym_id) {
    redirect(`/dashboard/gym/${profile.admin_gym_id}/dashboard`);
  }

  redirect('/login');
}
