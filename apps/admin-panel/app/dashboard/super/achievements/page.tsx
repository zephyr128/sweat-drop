// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// CRITICAL: Prevent static generation by returning empty array
export function generateStaticParams() {
  return [];
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { AchievementsManager } from '@/components/modules/AchievementsManager';
import { getGlobalAchievements } from '@/lib/actions/achievement-actions';

export default async function AchievementsPage() {
  // 1. Check authentication
  const supabase = await createClient();
  let user;
  try {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      redirect('/login');
    }
    user = authUser;
  } catch {
    redirect('/login');
  }

  // 2. Verify superadmin role
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      notFound();
    }

    if (profile.role !== 'superadmin') {
      redirect('/dashboard');
    }
  } catch {
    notFound();
  }

  // 3. Fetch global achievements via server action
  const result = await getGlobalAchievements();
  const achievements = result.success ? result.data : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Global Achievements</h1>
        <p className="text-[#808080]">
          Manage global badges that all SweatDrop users can earn across any gym
        </p>
      </div>

      <AchievementsManager initialAchievements={achievements as any} />
    </div>
  );
}
