'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trophy, Medal, Award, Calendar, ChevronLeft, ChevronRight, Clock, Flame, Gift, Users } from 'lucide-react';
import { getLeaderboardSnapshots, getCurrentLeaderboard } from '@/lib/actions/leaderboard-actions';

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

export function LeaderboardHistory({ gymId, gymName }: LeaderboardHistoryProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'weekly' | 'monthly' | 'all'>('all');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentBoard, setCurrentBoard] = useState<CurrentLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBoardLoading, setCurrentBoardLoading] = useState(true);
  const [currentBoardPeriod, setCurrentBoardPeriod] = useState<'weekly' | 'monthly'>('weekly');
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

  const loadCurrentBoard = useCallback(async () => {
    setCurrentBoardLoading(true);
    const result = await getCurrentLeaderboard(gymId, currentBoardPeriod, 10);
    if (result.success && result.data) {
      setCurrentBoard(result.data);
    }
    setCurrentBoardLoading(false);
  }, [gymId, currentBoardPeriod]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    loadCurrentBoard();
  }, [loadCurrentBoard]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-8">
      {/* Current Leaderboard */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
        <div className="p-6 border-b border-[#333]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#00E5FF]" />
                Live Leaderboard
              </h2>
              <p className="text-sm text-[#808080] mt-1">{gymName} — current standings</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentBoardPeriod('weekly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentBoardPeriod === 'weekly'
                    ? 'bg-[#00E5FF] text-black'
                    : 'bg-[#0A0A0A] text-[#808080] hover:text-white border border-[#333]'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setCurrentBoardPeriod('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentBoardPeriod === 'monthly'
                    ? 'bg-[#00E5FF] text-black'
                    : 'bg-[#0A0A0A] text-[#808080] hover:text-white border border-[#333]'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {currentBoardLoading ? (
            <div className="text-center py-8 text-[#808080]">Loading leaderboard...</div>
          ) : currentBoard.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-[#333] mx-auto mb-3" />
              <p className="text-[#808080]">No leaderboard data yet</p>
              <p className="text-xs text-[#555] mt-1">Members need to earn drops to appear</p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentBoard.map((entry, index) => {
                const isTop3 = index < 3;
                const RankIcon = isTop3 ? RANK_ICONS[index] : null;
                return (
                  <div
                    key={entry.user_id}
                    className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                      isTop3 ? 'bg-[#0A0A0A] border border-[#333]' : ''
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-10 flex justify-center">
                      {isTop3 && RankIcon ? (
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[index]} flex items-center justify-center`}>
                          <RankIcon className="w-4 h-4 text-black" />
                        </div>
                      ) : (
                        <span className="text-[#808080] font-mono text-sm">#{entry.rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center text-xs text-white">
                      {entry.avatar_url ? (
                        <img
                          src={entry.avatar_url}
                          alt={entry.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        (entry.username || '?')[0].toUpperCase()
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isTop3 ? RANK_TEXT_COLORS[index] : 'text-white'}`}>
                        {entry.username || 'Anonymous'}
                        {entry.is_newcomer && (
                          <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">NEW</span>
                        )}
                      </p>
                    </div>

                    {/* Streak */}
                    {entry.streak_days > 0 && (
                      <div className="flex items-center gap-1 text-xs text-orange-400">
                        <Flame className="w-3 h-3" />
                        {entry.streak_days}
                      </div>
                    )}

                    {/* Score */}
                    <div className="text-right">
                      <span className={`text-sm font-bold ${isTop3 ? 'text-white' : 'text-[#808080]'}`}>
                        {entry.score_label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Snapshot History */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#1A1A1A] overflow-hidden">
        <div className="p-6 border-b border-[#333]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#00E5FF]" />
                Leaderboard History
              </h2>
              <p className="text-sm text-[#808080] mt-1">Past period snapshots & prize distributions</p>
            </div>
            <div className="flex gap-2">
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
          </div>
        </div>

        <div className="p-6">
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
                <div
                  key={snapshot.id}
                  className="bg-[#0A0A0A] border border-[#333] rounded-lg overflow-hidden"
                >
                  {/* Snapshot Header */}
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
                        <span className="text-xs text-[#808080] bg-[#1A1A1A] px-2 py-1 rounded">
                          No Prizes
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rankings */}
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
                                {entry.drops.toLocaleString()} 💧
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

              {/* Pagination */}
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
                    <span className="text-sm text-[#808080] px-2">
                      {page} / {totalPages}
                    </span>
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
      </div>
    </div>
  );
}
