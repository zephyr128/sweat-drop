export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { PlatformReportDashboard } from '@/components/reports/PlatformReportDashboard';

export default async function SuperReportsPage() {
  const supabase = await createClient();

  let user;
  try {
    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (error || !authUser) redirect('/login');
    user = authUser;
  } catch {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile as any).role !== 'superadmin') {
    redirect('/dashboard');
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Reports</h1>
        <p className="text-zinc-400 text-sm mt-1">SweatDrop network overview</p>
      </div>
      <PlatformReportDashboard />
    </div>
  );
}
