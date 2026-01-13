'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface LeaderboardReward {
  id?: string;
  rank_position: number;
  reward_name: string;
  reward_description?: string;
  reward_type: string;
  value?: string;
  is_active: boolean;
}

interface LeaderboardRewardsFormProps {
  gymId: string;
  initialRewards: LeaderboardReward[];
}

export function LeaderboardRewardsForm({ gymId, initialRewards }: LeaderboardRewardsFormProps) {
  const [rewards, setRewards] = useState<LeaderboardReward[]>(
    initialRewards.length > 0
      ? initialRewards
      : [
          { rank_position: 1, reward_name: '', reward_type: 'coffee', is_active: true },
          { rank_position: 2, reward_name: '', reward_type: 'coffee', is_active: true },
          { rank_position: 3, reward_name: '', reward_type: 'coffee', is_active: true },
        ]
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const updateReward = (rank: number, field: keyof LeaderboardReward, value: any) => {
    setRewards((prev) =>
      prev.map((r) => (r.rank_position === rank ? { ...r, [field]: value } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // Delete existing rewards
      await supabase.from('leaderboard_rewards').delete().eq('gym_id', gymId).eq('period', 'monthly');

      // Insert new rewards
      const rewardsToInsert = rewards.map((r) => ({
        gym_id: gymId,
        rank_position: r.rank_position,
        reward_name: r.reward_name,
        reward_description: r.reward_description || null,
        reward_type: r.reward_type,
        value: r.value || null,
        is_active: r.is_active,
        period: 'monthly' as const,
      }));

      const { error } = await supabase.from('leaderboard_rewards').insert(rewardsToInsert);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Leaderboard rewards updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update rewards' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {[1, 2, 3].map((rank) => {
        const reward = rewards.find((r) => r.rank_position === rank) || {
          rank_position: rank,
          reward_name: '',
          reward_type: 'coffee',
          is_active: true,
        };

        return (
          <div
            key={rank}
            className="p-6 bg-[#1A1A1A] rounded-lg border border-[#1A1A1A]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#00B8CC] flex items-center justify-center text-2xl font-bold text-black">
                {rank}
              </div>
              <h3 className="text-xl font-bold text-white">Rank #{rank} Reward</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Reward Name</label>
                <input
                  type="text"
                  value={reward.reward_name}
                  onChange={(e) => updateReward(rank, 'reward_name', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="Free Coffee"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Reward Type</label>
                <select
                  value={reward.reward_type}
                  onChange={(e) => updateReward(rank, 'reward_type', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="coffee">Coffee</option>
                  <option value="protein">Protein</option>
                  <option value="discount">Discount</option>
                  <option value="merch">Merchandise</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Value</label>
                <input
                  type="text"
                  value={reward.value || ''}
                  onChange={(e) => updateReward(rank, 'value', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="e.g., $50 Gift Card"
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

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving...' : 'Save Leaderboard Rewards'}
      </button>
    </form>
  );
}
