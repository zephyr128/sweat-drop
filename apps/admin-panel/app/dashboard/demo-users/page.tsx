import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { getDemoUsersPageData } from '@/lib/actions/demo-users';
import { DemoUsersManager } from './DemoUsersManager';

interface DemoUsersPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function DemoUsersPage({ searchParams }: DemoUsersPageProps) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'superadmin') redirect('/dashboard');

  const { q } = await searchParams;
  const result = await getDemoUsersPageData(q);

  return (
    <div className="min-h-screen md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Demo Users</h1>
        <p className="text-[#808080] mt-1">
          Reviewer accounts and internal QA. Promote sparingly - demo users bypass workout machine locks.
        </p>
      </div>

      {!result.success || !result.data ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm">
          {result.error || 'Unable to load demo users data.'}
        </div>
      ) : (
        <DemoUsersManager
          initialQuery={result.data.query}
          demoUsers={result.data.demoUsers}
          searchResults={result.data.searchResults}
        />
      )}
    </div>
  );
}
