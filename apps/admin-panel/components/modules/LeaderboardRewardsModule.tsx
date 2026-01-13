'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { updateLeaderboardRewards } from '@/lib/actions/leaderboard-actions';

const leaderboardRewardsSchema = z.object({
  rank1: z.string().min(1, 'Rank 1 reward is required'),
  rank2: z.string().min(1, 'Rank 2 reward is required'),
  rank3: z.string().min(1, 'Rank 3 reward is required'),
});

type LeaderboardRewardsFormData = z.infer<typeof leaderboardRewardsSchema>;

interface LeaderboardRewardsModuleProps {
  gymId: string;
  initialData: {
    rank1: string;
    rank2: string;
    rank3: string;
  };
}

export function LeaderboardRewardsModule({
  gymId,
  initialData,
}: LeaderboardRewardsModuleProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LeaderboardRewardsFormData>({
    resolver: zodResolver(leaderboardRewardsSchema),
    defaultValues: initialData,
  });

  const onSubmit = async (data: LeaderboardRewardsFormData) => {
    try {
      const result = await updateLeaderboardRewards({
        ...data,
        gymId,
      });

      if (result.success) {
        toast.success('Leaderboard rewards updated successfully');
      } else {
        toast.error(`Failed to update rewards: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              🥇 Rank #1 Reward
            </label>
            <input
              {...register('rank1')}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="E.g., Free Protein Tub"
            />
            {errors.rank1 && (
              <p className="mt-1 text-sm text-[#FF5252]">{errors.rank1.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              🥈 Rank #2 Reward
            </label>
            <input
              {...register('rank2')}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="E.g., 50% off Membership"
            />
            {errors.rank2 && (
              <p className="mt-1 text-sm text-[#FF5252]">{errors.rank2.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              🥉 Rank #3 Reward
            </label>
            <input
              {...register('rank3')}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="E.g., Free Gym Bag"
            />
            {errors.rank3 && (
              <p className="mt-1 text-sm text-[#FF5252]">{errors.rank3.message}</p>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-[#1A1A1A]">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Rewards'}
          </button>
        </div>
      </form>
    </div>
  );
}
