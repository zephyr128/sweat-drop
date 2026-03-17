'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createChallenge, updateChallenge, deleteChallenge, toggleChallengeStatus, getChallengeCompletionStats, getChallengeDetailedProgress, closeChallenge } from '@/lib/actions/challenge-actions';
import { X, Trash2, Power, Droplet, Upload, Image, BarChart3, Users, CheckCircle2, XCircle, Building2, Plus, Minus, Pencil, Info, CalendarDays, Infinity } from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/lib/utils/storage';

interface TierInput {
  label: string;
  target: number;
  drops: number;
}

const challengeSchema = z.object({
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone', 'checkin_streak', 'checkin_count']),
  // Conditional fields based on challengeType
  targetDrops: z.number().int().positive().optional(), // For daily/weekly/monthly
  milestoneThreshold: z.number().int().positive().optional(), // For milestone
  streakDays: z.number().int().positive().optional(), // For streak
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional().or(z.literal('')), // Optional badge image URL
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // New fields for enhancement
  categoryType: z.enum(['individual', 'group', 'streak']).optional(),
  scoringModel: z.enum(['total_drops', 'distance_km', 'days_visited', 'streak_days']).optional(),
  sponsorName: z.string().optional(),
  sponsorLogo: z.string().url().optional().or(z.literal('')),
  prizeDescription: z.string().optional(),
}).superRefine((data, ctx) => {
  // Conditional validation with specific field errors
  if (data.challengeType === 'daily' || data.challengeType === 'weekly' || data.challengeType === 'monthly' || data.challengeType === 'checkin_count') {
    if (!data.targetDrops || data.targetDrops <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: data.challengeType === 'checkin_count' ? 'Number of check-ins is required' : 'Target drops is required for this challenge type',
        path: ['targetDrops'],
      });
    }
  }
  if (data.challengeType === 'streak' || data.challengeType === 'checkin_streak') {
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
  end_date: string | null;
  target_drops: number | null;
  milestone_threshold: number | null;
  streak_days: number | null;
  badge_image_url: string | null;
  scoring_model?: string | null;
  tiers?: TierInput[] | null;
  sponsor_name?: string | null;
  sponsor_logo?: string | null;
  prize_description?: string | null;
  category_type?: string | null;
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
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [badgePreview, setBadgePreview] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState<Record<string, boolean>>({});
  type ChallengeCompletionStats = {
    total_completions: number;
  };

  const [challengeStats, setChallengeStats] = useState<Record<string, ChallengeCompletionStats>>({});
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<TierInput[]>([
    { label: 'Bronze', target: 100, drops: 25 },
    { label: 'Silver', target: 250, drops: 75 },
    { label: 'Gold', target: 500, drops: 200 },
  ]);
  const [enableTiers, setEnableTiers] = useState(false);
  const [sponsorLogoPreview, setSponsorLogoPreview] = useState<string | null>(null);
  const [uploadingSponsorLogo, setUploadingSponsorLogo] = useState(false);

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
      categoryType: 'individual',
      scoringModel: 'total_drops',
      sponsorName: '',
      sponsorLogo: '',
      prizeDescription: '',
    },
  });

  const [showDateRange, setShowDateRange] = useState(false);

  const watchedChallengeType = watch('challengeType');
  const isStreakChallenge = watchedChallengeType === 'streak' || watchedChallengeType === 'checkin_streak';
  const isMilestoneChallenge = watchedChallengeType === 'milestone';
  const isDropsBasedChallenge = watchedChallengeType === 'daily' || watchedChallengeType === 'weekly' || watchedChallengeType === 'monthly';
  const isCheckinCountChallenge = watchedChallengeType === 'checkin_count';

  const lifecycleInfo: Record<string, { text: string; icon: string }> = {
    daily: { text: 'Progress resets every day at midnight. Users can earn rewards repeatedly across the campaign window.', icon: '🔄' },
    weekly: { text: 'Progress resets every Sunday. Users can earn rewards each week across the campaign window.', icon: '📅' },
    monthly: { text: 'One chance to complete within the month. Does not reset.', icon: '📆' },
    streak: { text: 'User must train on consecutive days within the time window. Streak resets if a day is missed.', icon: '🔥' },
    checkin_streak: { text: 'User must check in on consecutive days within the time window. Streak resets if a day is missed.', icon: '📍' },
    checkin_count: { text: 'Count check-ins within the date range. Does not reset.', icon: '🗓️' },
    milestone: { text: 'Permanent challenge with no deadline. Users work toward it indefinitely — it never expires.', icon: '🏆' },
  };

  const defaultDateHint: Record<string, string> = {
    daily: 'Default: 1 year from start (progress resets daily)',
    weekly: 'Default: 1 year from start (progress resets weekly)',
    monthly: 'Default: end of current month',
    streak: 'Default: streak days × 2',
    checkin_streak: 'Default: streak days × 2',
    checkin_count: 'Default: end of current month',
    milestone: 'No end date (permanent)',
  };

  // Badge image upload dropzone
  const badgeDropzone = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      setUploadingBadge(true);
      try {
        const file = acceptedFiles[0];
        // Upload to gym-challenge-badges bucket in gym-specific folder
        const result = await uploadFile(file, 'gym-challenge-badges', gymId);
        // Set the badge image URL in the form
        reset({ ...watch(), badgeImageUrl: result.url });
        setBadgePreview(result.url);
        toast.success('Badge image uploaded successfully');
      } catch (error: any) {
        console.error('Badge upload error:', error);
        const errorMessage = error.message || 'Unknown error';
        if (errorMessage.includes('Bucket') && errorMessage.includes('does not exist')) {
          toast.error('Bucket "gym-challenge-badges" not found. Please ensure it exists in Supabase Dashboard > Storage and is set to Public.');
        } else if (errorMessage.includes('row-level security') || errorMessage.includes('RLS')) {
          toast.error('Permission denied. Please check RLS policies for the "gym-challenge-badges" bucket.');
        } else {
          toast.error(`Failed to upload badge: ${errorMessage}`);
        }
      } finally {
        setUploadingBadge(false);
      }
    },
  });

  // Sponsor logo dropzone for challenges
  const challengeSponsorDropzone = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      setUploadingSponsorLogo(true);
      try {
        const file = acceptedFiles[0];
        const result = await uploadFile(file, 'images', gymId);
        reset({ ...watch(), sponsorLogo: result.url });
        setSponsorLogoPreview(result.url);
        toast.success('Sponsor logo uploaded');
      } catch (error: any) {
        toast.error(`Failed to upload logo: ${error.message}`);
      } finally {
        setUploadingSponsorLogo(false);
      }
    },
  });

  const openEdit = (challenge: Challenge) => {
    setEditingChallenge(challenge);
    const challengeType = challenge.challenge_type as ChallengeFormData['challengeType'];
    const hasCustomDates = !!challenge.start_date || !!challenge.end_date;
    setShowDateRange(hasCustomDates);
    reset({
      name: challenge.name,
      description: challenge.description || undefined,
      challengeType: challengeType,
      targetDrops: challenge.target_drops || undefined,
      milestoneThreshold: challenge.milestone_threshold || undefined,
      streakDays: challenge.streak_days || undefined,
      rewardDrops: challenge.reward_drops,
      badgeImageUrl: challenge.badge_image_url || '',
      startDate: challenge.start_date || undefined,
      endDate: challenge.end_date || undefined,
      categoryType: (challenge.category_type as ChallengeFormData['categoryType']) || 'individual',
      scoringModel: (challenge.scoring_model as ChallengeFormData['scoringModel']) || 'total_drops',
      sponsorName: challenge.sponsor_name || '',
      sponsorLogo: challenge.sponsor_logo || '',
      prizeDescription: challenge.prize_description || '',
    });
    setBadgePreview(challenge.badge_image_url || null);
    setSponsorLogoPreview(challenge.sponsor_logo || null);
    if (challenge.tiers && challenge.tiers.length > 0) {
      setEnableTiers(true);
      setTiers(challenge.tiers);
    } else {
      setEnableTiers(false);
      setTiers([
        { label: 'Bronze', target: 100, drops: 25 },
        { label: 'Silver', target: 250, drops: 75 },
        { label: 'Gold', target: 500, drops: 200 },
      ]);
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data: ChallengeFormData) => {
    try {
      const submitData: any = {
        ...data,
        gymId,
        tiers: enableTiers ? tiers : undefined,
      };

      let result: { success: boolean; data?: Challenge; error?: string };

      if (editingChallenge) {
        result = await updateChallenge(editingChallenge.id, submitData) as {
          success: boolean;
          data?: Challenge;
          error?: string;
        };
      } else {
        result = await createChallenge(submitData) as {
          success: boolean;
          data?: Challenge;
          error?: string;
        };
      }

      if (result.success && result.data) {
        if (editingChallenge) {
          setChallenges(
            challenges.map((c) => (c.id === editingChallenge.id ? (result.data as Challenge) : c))
          );
          toast.success('Challenge updated successfully');
        } else {
          setChallenges([result.data as Challenge, ...challenges]);
          toast.success('Challenge created successfully');
        }
        reset();
        setBadgePreview(null);
        setSponsorLogoPreview(null);
        setShowDateRange(false);
        setEnableTiers(false);
        setTiers([
          { label: 'Bronze', target: 100, drops: 25 },
          { label: 'Silver', target: 250, drops: 75 },
          { label: 'Gold', target: 500, drops: 200 },
        ]);
        setEditingChallenge(null);
        setIsModalOpen(false);
      } else {
        toast.error(`Failed to ${editingChallenge ? 'update' : 'create'} challenge: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (challengeId: string) => {
    if (!(await confirmAction({ title: 'Delete Challenge', message: 'Are you sure you want to delete this challenge?', confirmLabel: 'Delete', variant: 'danger' }))) return;

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

  const loadChallengeStats = async (challengeId: string) => {
    if (statsLoading[challengeId] || challengeStats[challengeId]) return;
    
    setStatsLoading((prev) => ({ ...prev, [challengeId]: true }));
    try {
      const result = await getChallengeCompletionStats(challengeId, gymId);
      if (result.success && result.data) {
        // Backend returns aggregate stats; derive total_completions from completed_users
        const { completed_users } = result.data as {
          total_users: number;
          completed_users: number;
          completion_percentage: number;
        };

        const stats: ChallengeCompletionStats = {
          total_completions: completed_users,
        };

        setChallengeStats((prev) => ({
          ...prev,
          [challengeId]: stats,
        }));
      }
    } catch (error: any) {
      console.error('Error loading challenge stats:', error);
    } finally {
      setStatsLoading((prev) => ({ ...prev, [challengeId]: false }));
    }
  };

  const openMonitor = async (challengeId: string) => {
    setMonitorId(challengeId);
    setMonitorLoading(true);
    setMonitorData(null);
    try {
      const result = await getChallengeDetailedProgress(challengeId, gymId);
      if (result.success && result.data) {
        setMonitorData(result.data);
      } else {
        toast.error(result.error || 'Failed to load progress');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setMonitorLoading(false);
    }
  };

  const handleCloseChallenge = async (challengeId: string) => {
    if (!(await confirmAction({ title: 'End Challenge', message: 'End this challenge early? It will be deactivated immediately.', confirmLabel: 'End Now', variant: 'warning' }))) return;
    setClosingId(challengeId);
    try {
      const result = await closeChallenge(challengeId, gymId);
      if (result.success) {
        setChallenges(
          challenges.map((c) =>
            c.id === challengeId ? { ...c, is_active: false } : c
          )
        );
        toast.success('Challenge ended successfully');
        setMonitorId(null);
      } else {
        toast.error(result.error || 'Failed to close challenge');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setClosingId(null);
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
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF9100]/10 text-[#FF9100] capitalize w-fit">
                          {challenge.challenge_type || challenge.frequency}
                        </span>
                        <span className="text-[10px] text-zinc-600 pl-1">
                          {challenge.challenge_type === 'milestone'
                            ? '∞ Ongoing'
                            : (challenge.challenge_type === 'daily' || challenge.challenge_type === 'weekly')
                            ? `🔄 Recurring`
                            : challenge.end_date
                            ? `Until ${challenge.end_date}`
                            : '∞ No deadline'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {challenge.challenge_type === 'checkin_streak' && challenge.streak_days ? (
                        <span className="text-white font-bold">
                          📍 {challenge.streak_days} day visit streak
                        </span>
                      ) : challenge.challenge_type === 'checkin_count' && challenge.target_drops ? (
                        <span className="text-white font-bold">
                          🗓️ {challenge.target_drops} check-ins
                        </span>
                      ) : challenge.challenge_type === 'streak' && challenge.streak_days ? (
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
                      <div className="flex flex-col gap-1">
                        <span className="text-[#00E5FF] font-bold">
                          <span className="flex items-center gap-1">
                            {challenge.reward_drops || challenge.drops_bounty || 0} <Droplet className="w-4 h-4" strokeWidth={1.5} />
                          </span>
                        </span>
                        {challenge.is_active && (
                          <button
                            onClick={() => loadChallengeStats(challenge.id)}
                            className="text-xs text-[#808080] hover:text-[#00E5FF] transition-colors text-left"
                          >
                            {statsLoading[challenge.id] ? (
                              'Loading...'
                            ) : challengeStats[challenge.id] ? (
                              `${challengeStats[challenge.id].total_completions} completed`
                            ) : (
                              'View stats'
                            )}
                          </button>
                        )}
                      </div>
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
                          onClick={() => openMonitor(challenge.id)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title="View Progress"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(challenge)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
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
              <h2 className="text-2xl font-bold text-white">
                {editingChallenge ? 'Edit Challenge' : 'Create New Challenge'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingChallenge(null);
                  setShowDateRange(false);
                  reset();
                  setBadgePreview(null);
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
                  <option value="checkin_streak">📍 Check-in Streak (reception)</option>
                  <option value="checkin_count">🗓️ Check-in Count (reception)</option>
                </select>
                {errors.challengeType && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.challengeType.message}</p>
                )}

                {/* Lifecycle info banner */}
                {lifecycleInfo[watchedChallengeType] && (
                  <div className="mt-3 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#1A1A1A] border border-[#333]">
                    <Info className="w-4 h-4 text-[#00E5FF] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      <span className="mr-1">{lifecycleInfo[watchedChallengeType].icon}</span>
                      {lifecycleInfo[watchedChallengeType].text}
                    </p>
                  </div>
                )}
              </div>

              {/* Conditional fields based on challenge type */}
              {(isDropsBasedChallenge || isCheckinCountChallenge) && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {isCheckinCountChallenge ? 'Number of Check-ins *' : 'Target Drops *'}
                  </label>
                  <input
                    type="number"
                    {...register('targetDrops', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder={isCheckinCountChallenge ? '10' : '100'}
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    {isCheckinCountChallenge
                      ? 'Number of reception check-ins required to complete the challenge'
                      : 'Total drops required to complete this challenge'}
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
                    {watchedChallengeType === 'checkin_streak' ? 'Consecutive Visit Days *' : 'Streak Days *'}
                  </label>
                  <input
                    type="number"
                    {...register('streakDays', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="3"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    {watchedChallengeType === 'checkin_streak'
                      ? 'Number of consecutive days the member must check in at reception'
                      : 'Number of consecutive days required (minimum 1 drop per day)'}
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

              {/* Custom Date Range (collapsible) */}
              <div className="border border-[#1A1A1A] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDateRange(!showDateRange)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-[#1A1A1A]/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    Custom date range
                  </span>
                  <span className="text-xs">{showDateRange ? '▲' : '▼'}</span>
                </button>

                {showDateRange && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-[#1A1A1A]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
                        <input
                          type="date"
                          {...register('startDate')}
                          style={{ colorScheme: 'dark' }}
                          className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                        />
                        <p className="mt-1 text-xs text-zinc-600">Default: today</p>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">
                          {isMilestoneChallenge ? (
                            <span className="flex items-center gap-1">
                              End Date <Infinity className="w-3 h-3 text-zinc-600" />
                            </span>
                          ) : 'End Date'}
                        </label>
                        <input
                          type="date"
                          {...register('endDate')}
                          disabled={isMilestoneChallenge}
                          style={{ colorScheme: 'dark' }}
                          className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <p className="mt-1 text-xs text-zinc-600">
                          {defaultDateHint[watchedChallengeType] || 'Auto-calculated'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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

              {/* Category Type */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Category
                </label>
                <select
                  {...register('categoryType')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="individual">Individual</option>
                  <option value="group">Group</option>
                  <option value="streak">Streak</option>
                </select>
                <p className="mt-1 text-xs text-[#808080]">
                  Individual: personal progress • Group: gym-wide collective • Streak: consecutive days
                </p>
              </div>

              {/* Scoring Model */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Scoring Model
                </label>
                <select
                  {...register('scoringModel')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="total_drops">Total Drops</option>
                  <option value="distance_km">Distance (km)</option>
                  <option value="days_visited">Days Visited</option>
                  <option value="streak_days">Streak Days</option>
                </select>
              </div>

              {/* Tiers Editor */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-white">Tiers (Optional)</label>
                  <button
                    type="button"
                    onClick={() => setEnableTiers(!enableTiers)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      enableTiers
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                        : 'bg-[#1A1A1A] text-[#808080] border border-[#333]'
                    }`}
                  >
                    {enableTiers ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {enableTiers && (
                  <div className="space-y-3">
                    {tiers.map((tier, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-[#1A1A1A] rounded-lg p-3">
                        <input
                          type="text"
                          value={tier.label}
                          onChange={(e) => {
                            const newTiers = [...tiers];
                            newTiers[idx].label = e.target.value;
                            setTiers(newTiers);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0A0A0A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                          placeholder="Tier name"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={tier.target}
                            onChange={(e) => {
                              const newTiers = [...tiers];
                              newTiers[idx].target = parseInt(e.target.value) || 0;
                              setTiers(newTiers);
                            }}
                            className="w-20 px-2 py-2 bg-[#0A0A0A] border border-[#333] rounded-lg text-white text-sm text-center focus:border-[#00E5FF] focus:outline-none"
                            placeholder="Target"
                            min={1}
                          />
                          <span className="text-xs text-[#808080]">target</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={tier.drops}
                            onChange={(e) => {
                              const newTiers = [...tiers];
                              newTiers[idx].drops = parseInt(e.target.value) || 0;
                              setTiers(newTiers);
                            }}
                            className="w-20 px-2 py-2 bg-[#0A0A0A] border border-[#333] rounded-lg text-white text-sm text-center focus:border-[#00E5FF] focus:outline-none"
                            placeholder="Drops"
                            min={0}
                          />
                          <Droplet className="w-3 h-3 text-[#00E5FF]" />
                        </div>
                        {tiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}
                            className="p-1 text-[#808080] hover:text-[#FF5252] transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setTiers([...tiers, { label: `Tier ${tiers.length + 1}`, target: 0, drops: 0 }])
                      }
                      className="flex items-center gap-1 text-sm text-[#00E5FF] hover:underline"
                    >
                      <Plus className="w-4 h-4" />
                      Add Tier
                    </button>
                  </div>
                )}
              </div>

              {/* Prize Description */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Prize Description
                </label>
                <textarea
                  {...register('prizeDescription')}
                  rows={2}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="E.g., Gold tier winners receive a free 3-month membership"
                />
              </div>

              {/* Sponsor Section */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-[#808080]" />
                  <label className="text-sm font-medium text-white">Sponsor (Optional)</label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Name</label>
                    <input
                      {...register('sponsorName')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="E.g., Nike"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Logo</label>
                    <div
                      {...challengeSponsorDropzone.getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                        challengeSponsorDropzone.isDragActive
                          ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                          : 'border-[#333] hover:border-[#00E5FF]/50'
                      }`}
                    >
                      <input {...challengeSponsorDropzone.getInputProps()} />
                      {sponsorLogoPreview ? (
                        <img src={sponsorLogoPreview} alt="" className="h-8 mx-auto object-contain" />
                      ) : uploadingSponsorLogo ? (
                        <p className="text-xs text-[#00E5FF]">Uploading...</p>
                      ) : (
                        <p className="text-xs text-[#808080]">Drop logo</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Badge Image
                </label>
                
                {/* Badge Image Upload Dropzone */}
                <div
                  {...badgeDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    badgeDropzone.isDragActive
                      ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                      : 'border-[#333] bg-[#1A1A1A] hover:border-[#00E5FF]/50'
                  } ${uploadingBadge ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input {...badgeDropzone.getInputProps()} />
                  {badgePreview ? (
                    <div className="space-y-3">
                      <div className="relative inline-block">
                        <img
                          src={badgePreview}
                          alt="Badge preview"
                          className="w-32 h-32 object-contain mx-auto rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBadgePreview(null);
                            reset({ ...watch(), badgeImageUrl: '' });
                          }}
                          className="absolute top-0 right-0 p-1 bg-[#FF5252] text-white rounded-full hover:bg-[#FF0000] transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-[#808080]">Click or drag to replace</p>
                    </div>
                  ) : uploadingBadge ? (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-[#00E5FF] mx-auto animate-pulse" />
                      <p className="text-sm text-[#808080]">Uploading...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Image className="w-8 h-8 text-[#808080] mx-auto" />
                      <p className="text-sm text-white">
                        Drag & drop badge image here, or click to select
                      </p>
                      <p className="text-xs text-[#808080]">
                        PNG, JPG, JPEG, WEBP (max 10MB)
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual URL input (fallback) */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[#808080] mb-1">
                    Or enter URL manually:
                  </label>
                  <input
                    type="url"
                    {...register('badgeImageUrl')}
                    className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none text-sm"
                    placeholder="https://example.com/badge.png"
                    onChange={(e) => {
                      if (e.target.value) {
                        setBadgePreview(e.target.value);
                      } else {
                        setBadgePreview(null);
                      }
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-[#808080]">
                  Optional: Badge image/icon that users earn when completing this challenge
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
                  {isSubmitting
                    ? (editingChallenge ? 'Saving...' : 'Creating...')
                    : (editingChallenge ? 'Save Changes' : 'Create Challenge')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingChallenge(null);
                    setShowDateRange(false);
                    reset();
                    setBadgePreview(null);
                    setSponsorLogoPreview(null);
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

      {/* Challenge Monitor Modal */}
      {monitorId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Challenge Progress</h2>
              <button
                onClick={() => {
                  setMonitorId(null);
                  setMonitorData(null);
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {monitorLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-[#1A1A1A] rounded-lg animate-pulse" />
                  ))}
                </div>
                <div className="h-40 bg-[#1A1A1A] rounded-lg animate-pulse" />
              </div>
            ) : monitorData ? (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-[#808080]" />
                      <p className="text-xs text-[#808080] uppercase">Participants</p>
                    </div>
                    <p className="text-2xl font-bold text-white">{monitorData.totalParticipants}</p>
                  </div>
                  <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <p className="text-xs text-[#808080] uppercase">Completed</p>
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">
                      {monitorData.completedCount}
                      <span className="text-sm text-[#808080] ml-1">({monitorData.completionPercentage}%)</span>
                    </p>
                  </div>
                  <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <BarChart3 className="w-4 h-4 text-[#00E5FF]" />
                      <p className="text-xs text-[#808080] uppercase">Avg Progress</p>
                    </div>
                    <p className="text-2xl font-bold text-[#00E5FF]">{monitorData.avgProgress}%</p>
                  </div>
                </div>

                {/* Completion Bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-[#808080]">Overall Progress</p>
                    <p className="text-sm text-white font-medium">{monitorData.completionPercentage}%</p>
                  </div>
                  <div className="w-full h-3 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00E5FF] to-[#00B8CC] rounded-full transition-all duration-500"
                      style={{ width: `${monitorData.completionPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Participant List */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Participants</h3>
                  {monitorData.participants.length === 0 ? (
                    <div className="bg-[#1A1A1A] rounded-lg p-6 text-center">
                      <Users className="w-8 h-8 text-[#808080] mx-auto mb-2" />
                      <p className="text-sm text-[#808080]">No participants yet</p>
                    </div>
                  ) : (
                    <div className="bg-[#1A1A1A] rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[#333]">
                            <th className="text-left px-4 py-2 text-xs text-[#808080] uppercase">Member</th>
                            <th className="text-left px-4 py-2 text-xs text-[#808080] uppercase">Progress</th>
                            <th className="text-left px-4 py-2 text-xs text-[#808080] uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#333]">
                          {monitorData.participants.map((p: any) => {
                            const pct = monitorData.target > 0
                              ? Math.min(Math.round((p.current_value / monitorData.target) * 100), 100)
                              : 0;
                            return (
                              <tr key={p.user_id} className="hover:bg-[#222] transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-[#333] flex items-center justify-center">
                                      <span className="text-xs font-bold text-[#808080]">
                                        {p.username.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-sm text-white">{p.username}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden min-w-[80px]">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          p.is_completed ? 'bg-emerald-400' : 'bg-[#00E5FF]'
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-[#808080] w-12 text-right">
                                      {p.current_value}/{monitorData.target}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {p.is_completed ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Done
                                    </span>
                                  ) : (
                                    <span className="text-xs text-[#808080]">{pct}%</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Close Challenge Button */}
                {challenges.find((c) => c.id === monitorId)?.is_active && (
                  <div className="pt-4 border-t border-[#1A1A1A]">
                    <button
                      onClick={() => handleCloseChallenge(monitorId!)}
                      disabled={closingId === monitorId}
                      className="flex items-center gap-2 px-4 py-2 bg-[#FF5252]/10 border border-[#FF5252]/30 text-[#FF5252] rounded-lg font-medium hover:bg-[#FF5252]/20 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      {closingId === monitorId ? 'Ending...' : 'End Challenge Early'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-[#808080]">Failed to load challenge data</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
