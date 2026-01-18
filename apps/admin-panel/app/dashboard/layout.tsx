import { getCurrentProfile } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

// CRITICAL: Force dynamic rendering for dashboard layout
// This prevents static generation during build which causes error page issues
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already handles authentication and redirects
  // This is a server component, so we can safely get the profile
  // If profile is not found, middleware should have redirected, but we handle gracefully
  // CRITICAL: Wrap in try-catch to handle build-time errors gracefully
  let profile = null;
  try {
    profile = await getCurrentProfile();
  } catch (error) {
    // During build, getCurrentProfile might fail - return minimal layout
    console.error('[DashboardLayout] Error fetching profile:', error);
    return null;
  }
  
  // If no profile, middleware should have redirected, but render nothing to avoid redirect loop
  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      <Sidebar 
        role={profile.role} 
        currentGymId={profile.assigned_gym_id || profile.owner_id}
        username={profile.username}
        email={profile.email}
      />
      <div className="w-full p-4 md:pl-[17rem] md:pr-8 md:pt-8 md:pb-8 transition-all min-h-screen">{children}</div>
    </div>
  );
}
