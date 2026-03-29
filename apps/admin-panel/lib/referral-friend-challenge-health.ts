import type { SupabaseClient } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase-server';

/**
 * Read-only probes for MVP social tables from `docs/plans/master_production_vortex_90d_execution_plan.md`
 * (`referrals`, `friend_challenges`, `friend_challenge_progress`). Tables may not exist until migrations land.
 */
type WidePublicSchema = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      }
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type HealthMetric = { ok: true; count: number } | { ok: false };

export type ReferralFriendNetworkHealth = {
  referrals: HealthMetric;
  friendChallenges: HealthMetric;
  friendChallengeProgress: HealthMetric;
};

export type ReferralFriendGymHealth = {
  referralsAtGym: HealthMetric;
  friendChallengesAtGym: HealthMetric;
  friendChallengeProgressAtGym: HealthMetric;
};

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

function asWideClient(supabase: ServerSupabase): SupabaseClient<WidePublicSchema> {
  return supabase as unknown as SupabaseClient<WidePublicSchema>;
}

async function headCount(
  supabase: ServerSupabase,
  table: string,
  filter?: { column: string; value: string },
): Promise<HealthMetric> {
  const client = asWideClient(supabase);
  let q = client.from(table).select('*', { count: 'exact', head: true });
  if (filter) {
    q = q.eq(filter.column, filter.value);
  }
  const { count, error } = await q;
  if (error) {
    return { ok: false };
  }
  return { ok: true, count: count ?? 0 };
}

export async function loadReferralFriendNetworkHealth(
  supabase: ServerSupabase,
): Promise<ReferralFriendNetworkHealth> {
  const [referrals, friendChallenges, friendChallengeProgress] = await Promise.all([
    headCount(supabase, 'referrals'),
    headCount(supabase, 'friend_challenges'),
    headCount(supabase, 'friend_challenge_progress'),
  ]);
  return { referrals, friendChallenges, friendChallengeProgress };
}

/**
 * Gym-scoped counts when `gym_id` exists on friend challenge tables; referrals may optionally be gym-scoped.
 */
export async function loadReferralFriendGymHealth(
  supabase: ServerSupabase,
  gymId: string,
): Promise<ReferralFriendGymHealth> {
  const client = asWideClient(supabase);

  const referralsAtGym = await headCount(supabase, 'referrals', { column: 'gym_id', value: gymId });

  const friendChallengesAtGym = await headCount(supabase, 'friend_challenges', {
    column: 'gym_id',
    value: gymId,
  });

  let friendChallengeProgressAtGym: HealthMetric = { ok: false };

  if (friendChallengesAtGym.ok) {
    const { data: challengeRows, error: idError } = await client
      .from('friend_challenges')
      .select('id')
      .eq('gym_id', gymId);

    if (idError) {
      friendChallengeProgressAtGym = { ok: false };
    } else if (!challengeRows?.length) {
      friendChallengeProgressAtGym = { ok: true, count: 0 };
    } else {
      const ids = challengeRows.map((r) => String((r as { id: string }).id)).filter(Boolean);
      const { count, error: progError } = await client
        .from('friend_challenge_progress')
        .select('*', { count: 'exact', head: true })
        .in('challenge_id', ids);

      if (progError) {
        friendChallengeProgressAtGym = { ok: false };
      } else {
        friendChallengeProgressAtGym = { ok: true, count: count ?? 0 };
      }
    }
  }

  return {
    referralsAtGym,
    friendChallengesAtGym,
    friendChallengeProgressAtGym,
  };
}

export function anyNetworkMetricOk(h: ReferralFriendNetworkHealth): boolean {
  return h.referrals.ok || h.friendChallenges.ok || h.friendChallengeProgress.ok;
}

export function anyGymMetricOk(h: ReferralFriendGymHealth): boolean {
  return (
    h.referralsAtGym.ok ||
    h.friendChallengesAtGym.ok ||
    h.friendChallengeProgressAtGym.ok
  );
}
