// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// CRITICAL: Prevent static generation by returning empty array
export function generateStaticParams() {
  return [];
}

import { createClient } from '@/lib/supabase-server';
import { requireGymAccess } from '@/lib/auth-guard';
import { ChallengesManager } from '@/components/modules/ChallengesManager';

interface ChallengesPageProps {
  params: Promise<{ id: string }>;
}

interface ChallengeData {
  id: string;
  name: string;
  description: string | null;
  gym_id: string;
  challenge_type: string;
  required_minutes?: number;
  drops_bounty?: number;
  reward_drops: number;
  target_drops: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  frequency?: string;
  machine_type?: string;
  streak_days?: number;
}

export default async function ChallengesPage({ params }: ChallengesPageProps) {
  const { id } = await params;
  await requireGymAccess(id);
  const supabase = await createClient();

  // Fetch challenges with error handling
  let challenges: ChallengeData[] = [];
  try {
    const { data: challengesData, error: challengesError } = await supabase
      .from('gym_challenges')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false });

    if (challengesError) {
      console.error('[ChallengesPage] Error fetching challenges:', challengesError);
    } else if (challengesData && Array.isArray(challengesData)) {
      // Map data to match Challenge interface (ensure end_date is string or undefined)
      challenges = challengesData.map((c: any) => ({
        ...c,
        end_date: c.end_date ?? null,
        reward_drops: c.reward_drops || c.drops_bounty || 0,
        target_drops: c.target_drops || 0,
      })) as any;
    }
  } catch (error) {
    console.error('[ChallengesPage] Unexpected error fetching challenges:', error);
    // Continue with empty array
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Challenges Manager</h1>
        <p className="text-[#808080]">Create and manage daily, weekly, and custom challenges</p>
      </div>

      <ChallengesManager gymId={id} initialChallenges={challenges as any} />
    </div>
  );
}
