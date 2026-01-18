import { getCurrentProfile, getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CRITICAL: Prevent DashboardLayout from running during build phase
  // Error pages (404, 500) are prerendered during build, and they should NOT
  // use DashboardLayout. This guard prevents styled-jsx/context crashes.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null;
  }

  // CRITICAL: Middleware already handles authentication and redirects
  // DO NOT redirect here - it will cause a redirect loop!
  // Middleware guarantees user is authenticated before reaching this layout
  // However, getCurrentProfile() might fail due to RLS or cookie issues
  let profile = null;
  try {
    // Debug: Check what getCurrentUser returns
    const user = await getCurrentUser();
    console.log('[DashboardLayout] getCurrentUser result:', user ? { id: user.id, email: user.email } : 'null');
    
    profile = await getCurrentProfile();
    
    if (!profile) {
      console.error('[DashboardLayout] getCurrentProfile returned null but user exists:', user?.id);
      console.error('[DashboardLayout] This is likely an RLS policy issue. Check server logs above for details.');
    }
  } catch (error: unknown) {
    // If getCurrentProfile fails, middleware should have handled it
    // But if it didn't, render minimal layout to avoid redirect loop
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[DashboardLayout] Error fetching profile:', {
      message: errorMessage,
      stack: errorStack,
    });
    // Render minimal layout without profile - middleware will handle redirect if needed
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }
  
  // If no profile but user is authenticated (middleware passed), render minimal layout
  // Middleware should have caught this, but don't redirect to avoid loop
  // This is likely an RLS policy or cookie issue - check server console logs
  if (!profile) {
    console.warn('[DashboardLayout] Profile not found but user is authenticated');
    console.warn('[DashboardLayout] This is likely an RLS policy issue. Check server logs for getCurrentProfile errors.');
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-2">Profile not found. Please contact support.</p>
          <p className="text-[#808080] text-sm">Check server console for details.</p>
        </div>
      </div>
    );
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
