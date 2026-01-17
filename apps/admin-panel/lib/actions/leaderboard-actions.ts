'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const leaderboardRewardsSchema = z.object({
  gymId: z.string().uuid(),
  rank1: z.string().min(1, 'Rank 1 reward is required'),
  rank2: z.string().min(1, 'Rank 2 reward is required'),
  rank3: z.string().min(1, 'Rank 3 reward is required'),
});

export async function updateLeaderboardRewards(
  input: z.infer<typeof leaderboardRewardsSchema>
) {
  try {
    const validated = leaderboardRewardsSchema.parse(input);

    const leaderboardConfig = {
      rank1: validated.rank1,
      rank2: validated.rank2,
      rank3: validated.rank3,
    };

    const { data, error } = await supabaseAdmin
      .from('gyms')
      .update({
        leaderboard_config: leaderboardConfig,
      })
      .eq('id', validated.gymId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/settings`);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    // Error updating leaderboard rewards
    return { success: false, error: error.message };
  }
}
