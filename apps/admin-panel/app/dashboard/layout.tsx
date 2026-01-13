import { getCurrentProfile } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already handles authentication and redirects
  // This is a server component, so we can safely get the profile
  // If profile is not found, middleware should have redirected, but we handle gracefully
  const profile = await getCurrentProfile();
  
  // If no profile, middleware should have redirected, but render nothing to avoid redirect loop
  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      <Sidebar role={profile.role} currentGymId={profile.admin_gym_id} />
      <div className="w-full p-4 md:pl-[17rem] md:pr-8 md:pt-8 md:pb-8 transition-all min-h-screen">{children}</div>
    </div>
  );
}
