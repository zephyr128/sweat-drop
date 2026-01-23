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
  // Cardio Challenge fields
  frequency: z.enum(['daily', 'weekly', 'one-time', 'streak']),
  requiredMinutes: z.number().int().positive().optional(),
  machineType: z.enum(['treadmill', 'bike', 'any']),
  dropsBounty: z.number().int().min(0),
  streakDays: z.number().int().positive().optional(),
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
  target_drops: number;
  // Cardio Challenge fields
  frequency?: string;
  required_minutes?: number;
  machine_type?: string;
  drops_bounty?: number;
  streak_days?: number;
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
      frequency: 'daily',
      machineType: 'any',
      dropsBounty: 0,
      requiredMinutes: 30,
      streakDays: 3,
    },
  });

  const watchedFrequency = watch('frequency');
  const isStreakChallenge = watchedFrequency === 'streak';

  const onSubmit = async (data: ChallengeFormData) => {
    try {
      const submitData: any = {
        ...data,
        gymId,
      };

      // For streak challenges, ensure streakDays is set
      if (data.frequency === 'streak') {
        if (!data.streakDays || data.streakDays < 1) {
          toast.error('Streak days is required for streak challenges');
          return;
        }
      } else {
        // For non-streak challenges, ensure requiredMinutes is set
        if (!data.requiredMinutes) {
          toast.error('Required minutes is required');
          return;
        }
      }

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
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF9100]/10 text-[#FF9100]">
                          {challenge.frequency === 'streak' && challenge.streak_days
                            ? `${challenge.streak_days}-Day Streak`
                            : challenge.frequency || challenge.challenge_type}
                        </span>
                        {challenge.machine_type && (
                          <span className="text-xs text-[#808080]">
                            {challenge.machine_type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {challenge.frequency === 'streak' && challenge.streak_days ? (
                        <span className="text-white font-bold">
                          {challenge.streak_days} days streak
                          {challenge.required_minutes && ` (${challenge.required_minutes} min/day)`}
                        </span>
                      ) : challenge.required_minutes ? (
                        <span className="text-white font-bold">
                          {challenge.required_minutes} min
                        </span>
                      ) : (
                        <span className="text-white font-bold">
                          {challenge.target_drops} drops
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#00E5FF] font-bold">
                        <span className="flex items-center gap-1">
                          {challenge.drops_bounty || challenge.reward_drops} <Droplet className="w-4 h-4" strokeWidth={1.5} />
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
                  placeholder="E.g., Daily 30-Minute Treadmill Challenge"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Frequency *
                  </label>
                      <select
                        {...register('frequency')}
                        className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                      >
                        <option value="daily">Daily (Resets every 24h)</option>
                        <option value="weekly">Weekly (Resets every Monday)</option>
                        <option value="streak">Streak (Consecutive days)</option>
                        <option value="one-time">One-Time</option>
                      </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Machine Type *
                  </label>
                  <select
                    {...register('machineType')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="any">Any Machine</option>
                    <option value="treadmill">Treadmill Only</option>
                    <option value="bike">Bike Only</option>
                  </select>
                </div>
              </div>

              {isStreakChallenge ? (
                <div className="grid grid-cols-2 gap-4">
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
                      Number of consecutive days required
                    </p>
                    {errors.streakDays && (
                      <p className="mt-1 text-sm text-[#FF5252]">
                        {errors.streakDays.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Daily Minutes Required *
                    </label>
                    <input
                      type="number"
                      {...register('requiredMinutes', { valueAsNumber: true })}
                      min={1}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="30"
                    />
                    <p className="mt-1 text-xs text-[#808080]">
                      Minutes required per day
                    </p>
                    {errors.requiredMinutes && (
                      <p className="mt-1 text-sm text-[#FF5252]">
                        {errors.requiredMinutes.message}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Required Minutes *
                    </label>
                    <input
                      type="number"
                      {...register('requiredMinutes', { valueAsNumber: true })}
                      min={1}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="30"
                    />
                    {errors.requiredMinutes && (
                      <p className="mt-1 text-sm text-[#FF5252]">
                        {errors.requiredMinutes.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Drops Bounty *
                    </label>
                    <input
                      type="number"
                      {...register('dropsBounty', { valueAsNumber: true })}
                      min={0}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="100"
                    />
                    {errors.dropsBounty && (
                      <p className="mt-1 text-sm text-[#FF5252]">
                        {errors.dropsBounty.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {isStreakChallenge && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Drops Bounty (Total Reward) *
                  </label>
                  <input
                    type="number"
                    {...register('dropsBounty', { valueAsNumber: true })}
                    min={0}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="500"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    Total drops awarded when streak is completed
                  </p>
                  {errors.dropsBounty && (
                    <p className="mt-1 text-sm text-[#FF5252]">
                      {errors.dropsBounty.message}
                    </p>
                  )}
                </div>
              )}

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
