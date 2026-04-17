import { getCurrentProfile } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// Layout reads cookies via getCurrentProfile() — auto-dynamic at runtime.
// No explicit force-dynamic needed: cookie access makes this dynamic automatically.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null;
  }

  let profile = null;
  try {
    profile = await getCurrentProfile();
  } catch {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-2">Profile not found. Please contact support.</p>
          <p className="text-[#808080] text-sm">Please try logging in again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Sidebar 
        role={profile.role} 
        currentGymId={profile.assigned_gym_id || profile.owner_id}
        username={profile.username}
        email={profile.email}
      />
      <Header
        role={profile.role}
        username={profile.username}
        email={profile.email}
      />
      <div className="w-full px-4 pt-20 pb-4 md:pl-[17rem] md:pr-8 md:pt-24 md:pb-8 transition-all min-h-screen">{children}</div>
      <ConfirmDialog />
    </div>
  );
}
