import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { getWaitlistEntries } from '@/lib/actions/waitlist-actions';
import { WaitlistDashboard } from './WaitlistDashboard';

export default async function WaitlistPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'superadmin') redirect('/dashboard');

  const result = await getWaitlistEntries('all');

  return (
    <div className="min-h-screen md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Gym Waitlist</h1>
        <p className="text-[#808080] mt-1">
          Gym requests from users — track demand and onboard new locations.
        </p>
      </div>

      {!result.success || !result.data ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm">
          {result.error || 'Unable to load waitlist data.'}
        </div>
      ) : (
        <WaitlistDashboard
          initialEntries={result.data}
          initialPendingCount={result.pendingCount ?? 0}
        />
      )}
    </div>
  );
}
