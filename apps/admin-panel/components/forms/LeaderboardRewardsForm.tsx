'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Trophy, Medal, Award, Eye } from 'lucide-react';

type LeaderboardPeriod = 'weekly' | 'monthly';

interface LeaderboardReward {
  id?: string;
  rank_position: number;
  reward_name: string;
  reward_description?: string;
  reward_type: string;
  value?: string;
  is_active: boolean;
  period: LeaderboardPeriod;
}

interface LeaderboardRewardsFormProps {
  gymId: string;
  initialRewards: LeaderboardReward[];
}

const REWARD_TYPES = [
  { value: 'coffee', label: '☕ Coffee' },
  { value: 'protein', label: '🥤 Protein' },
  { value: 'discount', label: '🏷️ Discount' },
  { value: 'merch', label: '👕 Merchandise' },
  { value: 'experience', label: '🎉 Experience' },
  { value: 'cash', label: '💰 Cash' },
  { value: 'custom', label: '🎁 Custom' },
];

const RANK_ICONS = [Trophy, Medal, Award];
const RANK_COLORS = [
  'from-amber-400 to-yellow-500',
  'from-zinc-300 to-zinc-400',
  'from-amber-600 to-amber-700',
];

function getEmptyRewards(period: LeaderboardPeriod): LeaderboardReward[] {
  return [
    { rank_position: 1, reward_name: '', reward_type: 'coffee', is_active: true, period },
    { rank_position: 2, reward_name: '', reward_type: 'coffee', is_active: true, period },
    { rank_position: 3, reward_name: '', reward_type: 'coffee', is_active: true, period },
  ];
}

export function LeaderboardRewardsForm({ gymId, initialRewards }: LeaderboardRewardsFormProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rewards, setRewards] = useState<LeaderboardReward[]>(getEmptyRewards('weekly'));
  const [loading, setLoading] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load rewards for selected period
  useEffect(() => {
    loadRewardsForPeriod(selectedPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  // On mount, if we have initial rewards, use them
  useEffect(() => {
    if (initialRewards.length > 0) {
      // Determine which period the initial rewards belong to
      const firstPeriod = (initialRewards[0]?.period as LeaderboardPeriod) || 'monthly';
      setSelectedPeriod(firstPeriod);
      setRewards(
        initialRewards.filter(r => r.period === firstPeriod).length > 0
          ? initialRewards.filter(r => r.period === firstPeriod)
          : getEmptyRewards(firstPeriod)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRewardsForPeriod = async (period: LeaderboardPeriod) => {
    setLoadingPeriod(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard_rewards')
        .select('*')
        .eq('gym_id', gymId)
        .eq('period', period)
        .order('rank_position', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setRewards(data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          rank_position: r.rank_position as number,
          reward_name: r.reward_name as string || '',
          reward_description: r.reward_description as string || undefined,
          reward_type: r.reward_type as string || 'coffee',
          value: r.value as string || undefined,
          is_active: r.is_active as boolean ?? true,
          period: r.period as LeaderboardPeriod,
        })));
      } else {
        setRewards(getEmptyRewards(period));
      }
    } catch {
      setRewards(getEmptyRewards(period));
    } finally {
      setLoadingPeriod(false);
    }
  };

  const updateReward = (rank: number, field: keyof LeaderboardReward, value: string | boolean) => {
    setRewards((prev) =>
      prev.map((r) => (r.rank_position === rank ? { ...r, [field]: value } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: rank 1 is required
    const rank1 = rewards.find(r => r.rank_position === 1);
    if (!rank1?.reward_name?.trim()) {
      setMessage({ type: 'error', text: 'Rank #1 reward name is required.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Delete existing rewards for this period
      await supabase
        .from('leaderboard_rewards')
        .delete()
        .eq('gym_id', gymId)
        .eq('period', selectedPeriod);

      // Only insert rewards that have a name
      const rewardsToInsert = rewards
        .filter(r => r.reward_name?.trim())
        .map((r) => ({
          gym_id: gymId,
          rank_position: r.rank_position,
          reward_name: r.reward_name.trim(),
          reward_description: r.reward_description?.trim() || null,
          reward_type: r.reward_type,
          value: r.value?.trim() || null,
          is_active: r.is_active,
          period: selectedPeriod,
        }));

      if (rewardsToInsert.length > 0) {
        const { error } = await supabase.from('leaderboard_rewards').insert(rewardsToInsert);
        if (error) throw error;
      }

      setMessage({ type: 'success', text: `${selectedPeriod === 'weekly' ? 'Weekly' : 'Monthly'} leaderboard rewards saved!` });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Failed to update rewards';
      setMessage({ type: 'error', text: errMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedPeriod('weekly')}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
            selectedPeriod === 'weekly'
              ? 'bg-[#00E5FF] text-black'
              : 'bg-[#1A1A1A] text-[#808080] hover:text-white border border-[#333]'
          }`}
        >
          Weekly
        </button>
        <button
          type="button"
          onClick={() => setSelectedPeriod('monthly')}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
            selectedPeriod === 'monthly'
              ? 'bg-[#00E5FF] text-black'
              : 'bg-[#1A1A1A] text-[#808080] hover:text-white border border-[#333]'
          }`}
        >
          Monthly
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-sm text-[#808080] hover:text-white transition-all"
        >
          <Eye className="w-4 h-4" />
          {showPreview ? 'Hide Preview' : 'Mobile Preview'}
        </button>
      </div>

      {loadingPeriod ? (
        <div className="text-center py-12 text-[#808080]">Loading rewards...</div>
      ) : (
        <>
          {/* Preview Section */}
          {showPreview && (
            <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
              <h3 className="text-sm font-medium text-[#808080] mb-4 uppercase tracking-wider">
                Mobile Leaderboard Preview ({selectedPeriod})
              </h3>
              <div className="max-w-xs mx-auto bg-gradient-to-b from-zinc-900 to-black rounded-2xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 text-center mb-3">
                  Prizes reset every {selectedPeriod === 'weekly' ? 'Monday' : '1st of the month'}
                </p>
                {[1, 2, 3].map((rank) => {
                  const reward = rewards.find(r => r.rank_position === rank);
                  const RankIcon = RANK_ICONS[rank - 1];
                  if (!reward?.reward_name?.trim()) return null;
                  return (
                    <div key={rank} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[rank - 1]} flex items-center justify-center`}>
                        <RankIcon className="w-4 h-4 text-black" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{reward.reward_name}</p>
                        {reward.value && (
                          <p className="text-xs text-zinc-500">{reward.value}</p>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 font-mono">#{rank}</span>
                    </div>
                  );
                })}
                {!rewards.some(r => r.reward_name?.trim()) && (
                  <p className="text-xs text-zinc-600 text-center py-4">No prizes configured</p>
                )}
              </div>
            </div>
          )}

          {/* Reward Cards */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {[1, 2, 3].map((rank) => {
              const reward = rewards.find((r) => r.rank_position === rank) || {
                rank_position: rank,
                reward_name: '',
                reward_type: 'coffee',
                is_active: true,
                period: selectedPeriod,
              };
              const RankIcon = RANK_ICONS[rank - 1];

              return (
                <div
                  key={rank}
                  className="p-6 bg-[#1A1A1A] rounded-lg border border-[#1A1A1A]"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${RANK_COLORS[rank - 1]} flex items-center justify-center`}>
                      <RankIcon className="w-6 h-6 text-black" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        Rank #{rank} Reward
                      </h3>
                      {rank === 1 && (
                        <p className="text-xs text-amber-400">Required</p>
                      )}
                      {rank > 1 && (
                        <p className="text-xs text-[#808080]">Optional</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Reward Name {rank === 1 && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="text"
                        value={reward.reward_name}
                        onChange={(e) => updateReward(rank, 'reward_name', e.target.value)}
                        className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                        placeholder="Free Coffee"
                        required={rank === 1}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Reward Type</label>
                      <select
                        value={reward.reward_type}
                        onChange={(e) => updateReward(rank, 'reward_type', e.target.value)}
                        className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                      >
                        {REWARD_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Value</label>
                      <input
                        type="text"
                        value={reward.value || ''}
                        onChange={(e) => updateReward(rank, 'value', e.target.value)}
                        className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                        placeholder="e.g., €50 Gift Card"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Description</label>
                      <input
                        type="text"
                        value={reward.reward_description || ''}
                        onChange={(e) => updateReward(rank, 'reward_description', e.target.value)}
                        className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                        placeholder="Optional description"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {message && (
              <div
                className={`p-4 rounded-lg ${
                  message.type === 'success'
                    ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                    : 'bg-[#FF5252]/10 text-[#FF5252] border border-[#FF5252]/30'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-[#808080]">
                Prizes reset every {selectedPeriod === 'weekly' ? 'week (Monday 00:00)' : 'month (1st at 00:00)'}
              </p>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : `Save ${selectedPeriod === 'weekly' ? 'Weekly' : 'Monthly'} Rewards`}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
