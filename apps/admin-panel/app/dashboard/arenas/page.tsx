// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ArenasManager } from '@/components/modules/ArenasManager';

export default async function ArenasPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  // Only superadmin and gym_owner can access the global arenas page
  if (!['superadmin', 'gym_owner'].includes(profile.role)) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Sweat Arenas</h1>
        <p className="text-[#808080] mt-1">
          Manage sponsor-branded competitions across the network.
        </p>
      </div>

      <ArenasManager isSuperadmin={profile.role === 'superadmin'} />
    </div>
  );
}
