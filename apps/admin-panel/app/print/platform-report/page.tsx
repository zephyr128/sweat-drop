// Route is auto-dynamic (reads cookies via createClient)

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { PlatformReportPrintView } from '@/components/reports/PlatformReportPrintView';

interface PrintPageProps {
  searchParams: Promise<{ start?: string; end?: string; period?: string }>;
}

export default async function PlatformReportPrintPage({ searchParams }: PrintPageProps) {
  const { start, end, period } = await searchParams;

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

  if (!profile || (profile as any).role !== 'superadmin') redirect('/dashboard');

  const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = end || new Date().toISOString();
  const periodLabel = period || 'Last 30 days';

  const admin = getAdminClient();
  if (!admin) redirect('/dashboard');

  const { data, error: rpcError } = await (admin.rpc as any)('get_platform_report', {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  const platformData = !rpcError ? data : null;

  return (
    <PlatformReportPrintView
      periodLabel={periodLabel}
      data={platformData}
    />
  );
}
