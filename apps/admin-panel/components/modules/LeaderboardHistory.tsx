'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trophy,
  Medal,
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Gift,
  Users,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLeaderboardSnapshots,
  getCurrentLeaderboard,
  getLeaderboardRewards,
  updateLeaderboardRewards,
} from '@/lib/actions/leaderboard-actions';
import { MemberAvatar } from '@/components/MemberAvatar';

interface RankingEntry {
  rank: number;
  user_id: string;
  username: string;
  drops: number;
}

interface Snapshot {
  id: string;
  gym_id: string;
  period: 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  rankings: RankingEntry[];
  prizes_distributed: boolean;
  created_at: string;
}

interface CurrentLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  score: number;
  score_label: string;
  is_newcomer: boolean;
  streak_days: number;
}

interface LeaderboardHistoryProps {
  gymId: string;
  gymName: string;
}

type Tab = 'weekly' | 'monthly' | 'all_time' | 'history';

const RANK_ICONS = [Trophy, Medal, Award];
const RANK_COLORS = [
  'from-amber-400 to-yellow-500',
  'from-zinc-300 to-zinc-400',
  'from-amber-600 to-amber-700',
];
const RANK_TEXT_COLORS = ['text-amber-400', 'text-zinc-400', 'text-amber-600'];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPeriodRange(start: string, end: string): string {
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function LeaderboardStandings({
  entries,
  loading,
  gymId,
}: {
  entries: CurrentLeaderboardEntry[];
  loading: boolean;
  gymId: string;
}) {
  const router = useRouter();

  if (loading) {
    return <div className="text-center py-8 text-[#808080]">Loading leaderboard...</div>;
  }
  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="w-12 h-12 text-[#333] mx-auto mb-3" />
        <p className="text-[#808080]">No leaderboard data yet</p>
        <p className="text-xs text-[#555] mt-1">Members need to earn drops to appear</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const isTop3 = index < 3;
        const RankIcon = isTop3 ? RANK_ICONS[index] : null;
        return (
          <div
            key={entry.user_id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/dashboard/gym/${gymId}/members/${entry.user_id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/dashboard/gym/${gymId}/members/${entry.user_id}`);
              }
            }}
            className={`flex items-center gap-4 p-3 rounded-lg transition-colors cursor-pointer hover:bg-[#1A1A1A]/80 ${
              isTop3 ? 'bg-[#0A0A0A] border border-[#333]' : ''
            }`}
          >
            <div className="w-10 flex justify-center">
              {isTop3 && RankIcon ? (
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[index]} flex items-center justify-center`}>
                  <RankIcon className="w-4 h-4 text-black" />
                </div>
              ) : (
                <span className="text-[#808080] font-mono text-sm">#{entry.rank}</span>
              )}
            </div>
            <MemberAvatar
              avatarUrl={entry.avatar_url}
              username={entry.username || 'Member'}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isTop3 ? RANK_TEXT_COLORS[index] : 'text-white'}`}>
                {entry.username || 'Anonymous'}
                {entry.is_newcomer && (
                  <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">NEW</span>
                )}
              </p>
            </div>
            {entry.streak_days > 0 && (
              <div className="flex items-center gap-1 text-xs text-orange-400">
                <Flame className="w-3 h-3" />
                {entry.streak_days}
              </div>
            )}
            <div className="text-right">
              <span className={`text-sm font-bold ${isTop3 ? 'text-white' : 'text-[#808080]'}`}>
                {entry.score_label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrizeConfig({
  gymId,
  period,
}: {
  gymId: string;
  period: 'weekly' | 'monthly';
}) {
  const [rank1, setRank1] = useState('');
  const [rank2, setRank2] = useState('');
  const [rank3, setRank3] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    getLeaderboardRewards(gymId, period).then((res) => {
      if (res.success && res.data) {
        setRank1(res.data.rank1);
        setRank2(res.data.rank2);
        setRank3(res.data.rank3);
      }
      setLoaded(true);
    });
  }, [gymId, period]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateLeaderboardRewards({
        gymId,
        rank1,
        rank2,
        rank3,
        period,
      });
      if (result.success) {
        toast.success(`${period === 'weekly' ? 'Weekly' : 'Monthly'} prizes saved`);
      } else {
        toast.error(result.error || 'Failed to save');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="py-4 text-center text-sm text-[#808080]">Loading prizes...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          🥇 Rank #1 Prize
        </label>
        <input
          value={rank1}
          onChange={(e) => setRank1(e.target.value)}
          className="w-full px-3 py-2.5 bg-[#111] border border-[#333] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
          placeholder="E.g., Free Protein Tub"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          🥈 Rank #2 Prize
        </label>
        <input
          value={rank2}
          onChange={(e) => setRank2(e.target.value)}
          className="w-full px-3 py-2.5 bg-[#111] border border-[#333] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
          placeholder="E.g., 50% off Membership"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          🥉 Rank #3 Prize
        </label>
        <input
          value={rank3}
          onChange={(e) => setRank3(e.target.value)}
          className="w-full px-3 py-2.5 bg-[#111] border border-[#333] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
          placeholder="E.g., Free Gym Bag"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00E5FF] text-black rounded-lg text-sm font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : 'Save Prizes'}
      </button>
    </div>
  );
}

function SnapshotHistory({ gymId }: { gymId: string }) {
  const [selectedPeriod, setSelectedPeriod] = useState<'weekly' | 'monthly' | 'all'>('all');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 10;

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    const result = await getLeaderboardSnapshots(
      gymId,
      selectedPeriod === 'all' ? undefined : selectedPeriod,
      page,
      perPage
    );
    if (result.success && result.data) {
      setSnapshots(result.data);
      setTotal(result.total ?? 0);
    }
    setLoading(false);
  }, [gymId, selectedPeriod, page]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {(['all', 'weekly', 'monthly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => { setSelectedPeriod(p); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedPeriod === p
                ? 'bg-[#00E5FF] text-black'
                : 'bg-[#0A0A0A] text-[#808080] hover:text-white border border-[#333]'
            }`}
          >
            {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-[#808080]">Loading history...</div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-[#333] mx-auto mb-3" />
          <p className="text-[#808080]">No leaderboard snapshots yet</p>
          <p className="text-xs text-[#555] mt-1">Snapshots are created at end of each period</p>
        </div>
      ) : (
        <div className="space-y-4">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="bg-[#0A0A0A] border border-[#333] rounded-lg overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b border-[#222]">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      snapshot.period === 'weekly'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}
                  >
                    {snapshot.period.toUpperCase()}
                  </span>
                  <span className="text-sm text-white font-medium">
                    {formatPeriodRange(snapshot.period_start, snapshot.period_end)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {snapshot.prizes_distributed ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                      <Gift className="w-3 h-3" />
                      Prizes Distributed
                    </span>
                  ) : (
                    <span className="text-xs text-[#808080] bg-[#1A1A1A] px-2 py-1 rounded">No Prizes</span>
                  )}
                </div>
              </div>
              <div className="p-4">
                {(snapshot.rankings || []).length === 0 ? (
                  <p className="text-xs text-[#555] text-center py-2">No rankings recorded</p>
                ) : (
                  <div className="space-y-2">
                    {snapshot.rankings.slice(0, 5).map((entry, idx) => {
                      const isTop3 = idx < 3;
                      const RankIcon = isTop3 ? RANK_ICONS[idx] : null;
                      return (
                        <div key={entry.user_id} className="flex items-center gap-3">
                          <div className="w-8 flex justify-center">
                            {isTop3 && RankIcon ? (
                              <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${RANK_COLORS[idx]} flex items-center justify-center`}>
                                <RankIcon className="w-3 h-3 text-black" />
                              </div>
                            ) : (
                              <span className="text-xs text-[#808080] font-mono">#{entry.rank}</span>
                            )}
                          </div>
                          <span className={`text-sm flex-1 ${isTop3 ? RANK_TEXT_COLORS[idx] : 'text-white'}`}>
                            {entry.username || 'Unknown'}
                          </span>
                          <span className="text-xs text-[#808080] font-mono">
                            {entry.drops.toLocaleString()} drops
                          </span>
                        </div>
                      );
                    })}
                    {snapshot.rankings.length > 5 && (
                      <p className="text-xs text-[#555] text-center">
                        +{snapshot.rankings.length - 5} more participants
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-[#333]">
              <p className="text-xs text-[#808080]">
                {total} snapshot{total !== 1 ? 's' : ''} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded bg-[#0A0A0A] border border-[#333] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#555] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-[#808080] px-2">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded bg-[#0A0A0A] border border-[#333] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#555] transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LeaderboardHistory({ gymId, gymName }: LeaderboardHistoryProps) {
  const [activeTab, setActiveTab] = useState<Tab>('weekly');
  const [weeklyBoard, setWeeklyBoard] = useState<CurrentLeaderboardEntry[]>([]);
  const [monthlyBoard, setMonthlyBoard] = useState<CurrentLeaderboardEntry[]>([]);
  const [allTimeBoard, setAllTimeBoard] = useState<CurrentLeaderboardEntry[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [allTimeLoading, setAllTimeLoading] = useState(true);

  useEffect(() => {
    setWeeklyLoading(true);
    getCurrentLeaderboard(gymId, 'weekly', 10).then((res) => {
      if (res.success && res.data) setWeeklyBoard(res.data);
      setWeeklyLoading(false);
    });
  }, [gymId]);

  useEffect(() => {
    setMonthlyLoading(true);
    getCurrentLeaderboard(gymId, 'monthly', 10).then((res) => {
      if (res.success && res.data) setMonthlyBoard(res.data);
      setMonthlyLoading(false);
    });
  }, [gymId]);

  useEffect(() => {
    setAllTimeLoading(true);
    getCurrentLeaderboard(gymId, 'all_time', 10).then((res) => {
      if (res.success && res.data) setAllTimeBoard(res.data);
      setAllTimeLoading(false);
    });
  }, [gymId]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'all_time', label: 'All Time' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-[#00E5FF] text-black'
                : 'text-[#808080] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Weekly tab */}
      {activeTab === 'weekly' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
            <div className="p-6 border-b border-[#333]">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#00E5FF]" />
                Weekly Standings
              </h2>
              <p className="text-sm text-[#808080] mt-1">{gymName} — current week</p>
            </div>
            <div className="p-6">
              <LeaderboardStandings entries={weeklyBoard} loading={weeklyLoading} gymId={gymId} />
            </div>
          </div>
          <div className="bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
            <div className="p-6 border-b border-[#333]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-amber-400" />
                Weekly Prizes
              </h2>
              <p className="text-sm text-[#808080] mt-1">Rewards for top performers this week</p>
            </div>
            <div className="p-6">
              <PrizeConfig gymId={gymId} period="weekly" />
            </div>
          </div>
        </div>
      )}

      {/* Monthly tab */}
      {activeTab === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
            <div className="p-6 border-b border-[#333]">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#00E5FF]" />
                Monthly Standings
              </h2>
              <p className="text-sm text-[#808080] mt-1">{gymName} — current month</p>
            </div>
            <div className="p-6">
              <LeaderboardStandings entries={monthlyBoard} loading={monthlyLoading} gymId={gymId} />
            </div>
          </div>
          <div className="bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
            <div className="p-6 border-b border-[#333]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-purple-400" />
                Monthly Prizes
              </h2>
              <p className="text-sm text-[#808080] mt-1">Rewards for top performers this month</p>
            </div>
            <div className="p-6">
              <PrizeConfig gymId={gymId} period="monthly" />
            </div>
          </div>
        </div>
      )}

      {/* All Time tab */}
      {activeTab === 'all_time' && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
          <div className="p-6 border-b border-[#333]">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#00E5FF]" />
              All Time Standings
            </h2>
            <p className="text-sm text-[#808080] mt-1">{gymName} — all time top members</p>
          </div>
          <div className="p-6">
            <LeaderboardStandings entries={allTimeBoard} loading={allTimeLoading} gymId={gymId} />
          </div>
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
          <div className="p-6 border-b border-[#333]">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#00E5FF]" />
              Leaderboard History
            </h2>
            <p className="text-sm text-[#808080] mt-1">Past period snapshots & prize distributions</p>
          </div>
          <div className="p-6">
            <SnapshotHistory gymId={gymId} />
          </div>
        </div>
      )}
    </div>
  );
}
