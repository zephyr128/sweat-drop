// Prevent static generation for dynamic [id] segment
export const dynamic = 'force-dynamic';
export function generateStaticParams() { return []; }

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { GymReportPrintView } from '@/components/reports/GymReportPrintView';

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string; period?: string }>;
}

export default async function GymReportPrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
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
    .select('id, role, assigned_gym_id, owner_id')
    .eq('id', user.id)
    .single();

  if (!profile) notFound();
  const role = (profile as any).role as string;
  if (!['superadmin', 'gym_owner', 'gym_admin'].includes(role)) redirect('/dashboard');

  const { data: gym } = await supabase
    .from('gyms')
    .select('name, city, country, owner_id')
    .eq('id', id)
    .single();

  if (!gym) notFound();

  if (role === 'gym_owner' || role === 'gym_admin') {
    const ownsGym = (gym as any).owner_id === (profile as any).id;
    const isAssigned = (profile as any).assigned_gym_id === id;
    if (!ownsGym && !isAssigned) redirect('/dashboard');
  }

  const startDate = start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = end || new Date().toISOString();
  const periodLabel = period || 'Pilot (90d)';

  const admin = getAdminClient();
  if (!admin) notFound();

  const [engRes, storeRes, arenaRes, trendRes, challengeRes] = await Promise.allSettled([
    (admin.rpc as any)('get_gym_engagement_report', { p_gym_id: id, p_start_date: startDate, p_end_date: endDate }),
    (admin.rpc as any)('get_gym_store_report', { p_gym_id: id, p_start_date: startDate, p_end_date: endDate }),
    (admin.rpc as any)('get_gym_arena_report', { p_gym_id: id, p_start_date: startDate, p_end_date: endDate }),
    (admin.rpc as any)('get_gym_sessions_trend', { p_gym_id: id, p_weeks: 12 }),
    (admin.rpc as any)('get_gym_challenge_report', { p_gym_id: id, p_start_date: startDate, p_end_date: endDate }),
  ]);

  const engagement = engRes.status === 'fulfilled' && !engRes.value.error ? engRes.value.data : null;
  const store = storeRes.status === 'fulfilled' && !storeRes.value.error ? storeRes.value.data || [] : [];
  const arenas = arenaRes.status === 'fulfilled' && !arenaRes.value.error ? arenaRes.value.data || [] : [];
  const trend = trendRes.status === 'fulfilled' && !trendRes.value.error ? trendRes.value.data || [] : [];
  const challenges = challengeRes.status === 'fulfilled' && !challengeRes.value.error ? challengeRes.value.data || [] : [];

  const gymName = (gym as any).name || 'Gym';
  const gymCity = (gym as any).city || '';
  const gymCountry = (gym as any).country || '';
  const gymLocation = [gymCity, gymCountry].filter(Boolean).join(', ');

  return (
    <GymReportPrintView
      gymName={gymName}
      gymLocation={gymLocation}
      periodLabel={periodLabel}
      engagement={engagement}
      store={store}
      arenas={arenas}
      trend={trend}
      challenges={challenges}
    />
  );
}
