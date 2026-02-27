'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createChallenge, deleteChallenge, toggleChallengeStatus } from '@/lib/actions/challenge-actions';
import { X, Trash2, Power, Droplet } from 'lucide-react';

const challengeSchema = z.object({
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone']),
  // Conditional fields based on challengeType
  targetDrops: z.number().int().positive().optional(), // For daily/weekly/monthly
  milestoneThreshold: z.number().int().positive().optional(), // For milestone
  streakDays: z.number().int().positive().optional(), // For streak
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional().or(z.literal('')), // Optional badge image URL
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).superRefine((data, ctx) => {
  // Conditional validation with specific field errors
  if (data.challengeType === 'daily' || data.challengeType === 'weekly' || data.challengeType === 'monthly') {
    if (!data.targetDrops || data.targetDrops <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Target drops is required for this challenge type',
        path: ['targetDrops'],
      });
    }
  }
  if (data.challengeType === 'streak') {
    if (!data.streakDays || data.streakDays <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Streak days is required for streak challenges',
        path: ['streakDays'],
      });
    }
  }
  if (data.challengeType === 'milestone') {
    if (!data.milestoneThreshold || data.milestoneThreshold <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Milestone threshold is required for milestone challenges',
        path: ['milestoneThreshold'],
      });
    }
  }
});

type ChallengeFormData = z.infer<typeof challengeSchema>;

interface Challenge {
  id: string;
  name: string;
  description: string | null;
  reward_drops: number;
  challenge_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  target_drops: number | null;
  milestone_threshold: number | null;
  streak_days: number | null;
  badge_image_url: string | null;
  // Legacy fields (deprecated)
  frequency?: string;
  required_minutes?: number;
  machine_type?: string;
  drops_bounty?: number;
}

interface ChallengesManagerProps {
  gymId: string;
  initialChallenges: Challenge[];
}

export function ChallengesManager({ gymId, initialChallenges }: ChallengesManagerProps) {
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChallengeFormData>({
    resolver: zodResolver(challengeSchema),
    defaultValues: {
      challengeType: 'daily',
      rewardDrops: 0,
      targetDrops: 100,
      streakDays: 3,
      milestoneThreshold: 1000,
      badgeImageUrl: '',
    },
  });

  const watchedChallengeType = watch('challengeType');
  const isStreakChallenge = watchedChallengeType === 'streak';
  const isMilestoneChallenge = watchedChallengeType === 'milestone';
  const isDropsBasedChallenge = watchedChallengeType === 'daily' || watchedChallengeType === 'weekly' || watchedChallengeType === 'monthly';

  const onSubmit = async (data: ChallengeFormData) => {
    try {
      const submitData: any = {
        ...data,
        gymId,
      };

      const result = await createChallenge(submitData) as {
        success: boolean;
        data?: Challenge;
        error?: string;
      };

      if (result.success && result.data) {
        setChallenges([result.data as Challenge, ...challenges]);
        toast.success('Challenge created successfully');
        reset();
        setIsModalOpen(false);
      } else {
        toast.error(`Failed to create challenge: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (challengeId: string) => {
    if (!confirm('Are you sure you want to delete this challenge?')) return;

    setDeletingId(challengeId);
    try {
      const result = await deleteChallenge(challengeId, gymId);
      if (result.success) {
        setChallenges(challenges.filter((c) => c.id !== challengeId));
        toast.success('Challenge deleted successfully');
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (challengeId: string, currentStatus: boolean) => {
    try {
      const result = await toggleChallengeStatus(challengeId, gymId, !currentStatus);
      if (result.success) {
        setChallenges(
          challenges.map((c) =>
            c.id === challengeId ? { ...c, is_active: !currentStatus } : c
          )
        );
        toast.success(
          `Challenge ${!currentStatus ? 'activated' : 'deactivated'} successfully`
        );
      } else {
        toast.error(`Failed to update status: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          + Add Challenge
        </button>
      </div>

      {/* Challenges Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1A1A]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Title</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Type</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Target</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Reward</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {challenges.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#808080]">
                    No challenges yet. Create your first challenge!
                  </td>
                </tr>
              ) : (
                challenges.map((challenge) => (
                  <tr key={challenge.id} className="hover:bg-[#1A1A1A]/50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-white font-medium">{challenge.name}</div>
                        {challenge.description && (
                          <div className="text-sm text-[#808080] mt-1">
                            {challenge.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF9100]/10 text-[#FF9100] capitalize">
                          {challenge.challenge_type || challenge.frequency}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {challenge.challenge_type === 'streak' && challenge.streak_days ? (
                        <span className="text-white font-bold">
                          {challenge.streak_days} days streak
                        </span>
                      ) : challenge.challenge_type === 'milestone' && challenge.milestone_threshold ? (
                        <span className="text-white font-bold">
                          {challenge.milestone_threshold} drops (all-time)
                        </span>
                      ) : challenge.target_drops ? (
                        <span className="text-white font-bold">
                          {challenge.target_drops} <Droplet className="w-4 h-4 inline" strokeWidth={1.5} />
                        </span>
                      ) : (
                        <span className="text-[#808080] text-sm">No target set</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#00E5FF] font-bold">
                        <span className="flex items-center gap-1">
                          {challenge.reward_drops || challenge.drops_bounty || 0} <Droplet className="w-4 h-4" strokeWidth={1.5} />
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          challenge.is_active
                            ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                            : 'bg-[#808080]/10 text-[#808080]'
                        }`}
                      >
                        {challenge.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            handleToggleStatus(challenge.id, challenge.is_active)
                          }
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title={challenge.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power
                            className={`w-4 h-4 ${
                              challenge.is_active ? 'text-[#00E5FF]' : ''
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => handleDelete(challenge.id)}
                          disabled={deletingId === challenge.id}
                          className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Challenge Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Create New Challenge</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  reset();
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Title *
                </label>
                <input
                  {...register('name')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="E.g., Daily 100 Drops Challenge"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="Optional description of the challenge"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Challenge Type *
                </label>
                <select
                  {...register('challengeType')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="daily">Daily (Resets every 24h)</option>
                  <option value="weekly">Weekly (Resets every Monday)</option>
                  <option value="monthly">Monthly (Resets every month)</option>
                  <option value="streak">Streak (Consecutive days)</option>
                  <option value="milestone">Milestone (All-time drops in gym)</option>
                </select>
                {errors.challengeType && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.challengeType.message}</p>
                )}
              </div>

              {/* Conditional fields based on challenge type */}
              {isDropsBasedChallenge && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Target Drops *
                  </label>
                  <input
                    type="number"
                    {...register('targetDrops', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="100"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    Total drops required to complete this challenge
                  </p>
                  {errors.targetDrops && (
                    <p className="mt-1 text-sm text-[#FF5252]">
                      {errors.targetDrops.message}
                    </p>
                  )}
                </div>
              )}

              {isStreakChallenge && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Streak Days *
                  </label>
                  <input
                    type="number"
                    {...register('streakDays', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="3"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    Number of consecutive days required (minimum 1 drop per day)
                  </p>
                  {errors.streakDays && (
                    <p className="mt-1 text-sm text-[#FF5252]">
                      {errors.streakDays.message}
                    </p>
                  )}
                </div>
              )}

              {isMilestoneChallenge && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Milestone Threshold *
                  </label>
                  <input
                    type="number"
                    {...register('milestoneThreshold', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="1000"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    All-time drops required in this gym to complete the milestone
                  </p>
                  {errors.milestoneThreshold && (
                    <p className="mt-1 text-sm text-[#FF5252]">
                      {errors.milestoneThreshold.message}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Reward Drops *
                </label>
                <input
                  type="number"
                  {...register('rewardDrops', { valueAsNumber: true })}
                  min={0}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="100"
                />
                <p className="mt-1 text-xs text-[#808080]">
                  Drops awarded when challenge is completed
                </p>
                {errors.rewardDrops && (
                  <p className="mt-1 text-sm text-[#FF5252]">
                    {errors.rewardDrops.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Badge Image URL
                </label>
                <input
                  type="url"
                  {...register('badgeImageUrl')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="https://example.com/badge.png"
                />
                <p className="mt-1 text-xs text-[#808080]">
                  Optional: URL to badge image/icon that users earn when completing this challenge
                </p>
                {errors.badgeImageUrl && (
                  <p className="mt-1 text-sm text-[#FF5252]">
                    {errors.badgeImageUrl.message}
                  </p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating...' : 'Create Challenge'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    reset();
                  }}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
