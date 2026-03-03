'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Trophy,
  Medal,
  Award,
  Users,
  Calendar,
  Building2,
  MapPin,
  Globe,
  Flame,
  RefreshCw,
  Flag,
  ArrowLeft,
} from 'lucide-react';
import {
  getArenaParticipants,
  finalizeArena,
  type Arena,
} from '@/lib/actions/arena-actions';
import { getCurrentLeaderboard } from '@/lib/actions/leaderboard-actions';

interface ArenaDetailProps {
  arena: Arena;
  isSuperadmin: boolean;
  onBack: () => void;
}

const RANK_ICONS = [Trophy, Medal, Award];
const RANK_COLORS = [
  'from-amber-400 to-yellow-500',
  'from-zinc-300 to-zinc-400',
  'from-amber-600 to-amber-700',
];
const RANK_TEXT_COLORS = ['text-amber-400', 'text-zinc-400', 'text-amber-600'];

const SCORING_LABELS: Record<string, string> = {
  total_drops: 'Total Drops',
  days_visited: 'Days Visited',
  variety_score: 'Machine Variety',
  streak_days: 'Streak Days',
};

const SCORING_UNITS: Record<string, string> = {
  total_drops: '💧',
  days_visited: 'days',
  variety_score: 'machines',
  streak_days: '🔥 days',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Participant {
  user_id: string;
  username: string;
  avatar_url: string | null;
  gym_name: string;
  current_score: number;
  rank: number;
  opted_in_at: string;
}

export function ArenaDetail({ arena, isSuperadmin, onBack }: ArenaDetailProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadParticipants = useCallback(async () => {
    const result = await getArenaParticipants(arena.id);
    if (result.success && result.data) {
      setParticipants(result.data);
    }
  }, [arena.id]);

  useEffect(() => {
    setLoading(true);
    loadParticipants().finally(() => setLoading(false));
  }, [loadParticipants]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadParticipants();
    setRefreshing(false);
    toast.success('Leaderboard refreshed');
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize this arena? This will calculate final rankings and distribute prizes. This cannot be undone.')) return;
    const result = await finalizeArena(arena.id);
    if (result.success) {
      toast.success(`Arena finalized! ${result.winnersCount || 0} prize(s) distributed.`);
    } else {
      toast.error(result.error || 'Failed to finalize');
    }
  };

  const now = new Date();
  const start = new Date(arena.start_date + 'T00:00:00');
  const end = new Date(arena.end_date + 'T23:59:59');
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const progressPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-[#808080] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">{arena.name}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-[#808080]">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {arena.sponsor_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(arena.start_date)} — {formatDate(arena.end_date)}
            </span>
            <span>{SCORING_LABELS[arena.scoring_model] || arena.scoring_model}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-sm text-[#808080] hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isSuperadmin && !arena.is_finalized && (
            <button
              onClick={handleFinalize}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400 hover:bg-amber-500/20 transition-all"
            >
              <Flag className="w-4 h-4" />
              Finalize
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Participants</p>
          <p className="text-2xl font-bold text-white">{participants.length}</p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Gyms</p>
          <p className="text-2xl font-bold text-white">{arena.gym_count || 0}</p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Progress</p>
          <p className="text-2xl font-bold text-[#00E5FF]">{progressPct}%</p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg p-4 text-center">
          <p className="text-xs text-[#808080] uppercase mb-1">Prizes</p>
          <p className="text-2xl font-bold text-amber-400">{arena.prizes?.length || 0}</p>
        </div>
      </div>

      {/* Time Progress Bar */}
      <div className="bg-[#1A1A1A] rounded-lg p-4">
        <div className="flex items-center justify-between text-xs text-[#808080] mb-2">
          <span>{formatDate(arena.start_date)}</span>
          <span>{elapsedDays} / {totalDays} days</span>
          <span>{formatDate(arena.end_date)}</span>
        </div>
        <div className="w-full h-2 bg-[#0A0A0A] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00E5FF] to-[#00B8CC] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Prizes */}
      {arena.prizes && arena.prizes.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Prizes
          </h3>
          <div className="flex flex-wrap gap-3">
            {arena.prizes.map((prize, idx) => {
              const isTop3 = idx < 3;
              const RankIcon = isTop3 ? RANK_ICONS[idx] : Trophy;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#0A0A0A] border border-[#333] rounded-lg px-3 py-2"
                >
                  {isTop3 ? (
                    <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${RANK_COLORS[idx]} flex items-center justify-center`}>
                      <RankIcon className="w-3 h-3 text-black" />
                    </div>
                  ) : (
                    <span className="text-xs text-[#808080] font-mono">#{prize.rank}</span>
                  )}
                  <span className="text-sm text-white">{prize.prize}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Leaderboard */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#333]">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#00E5FF]" />
            Live Leaderboard
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[#808080]">Loading participants...</div>
        ) : participants.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-[#333] mx-auto mb-3" />
            <p className="text-[#808080]">No participants yet</p>
            <p className="text-xs text-[#555] mt-1">Members need to opt-in to appear</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1A1A1A]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase w-12">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Member</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#808080] uppercase">Gym</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[#808080] uppercase">Score</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[#808080] uppercase">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {participants.map((p, idx) => {
                  const isTop3 = idx < 3;
                  const RankIcon = isTop3 ? RANK_ICONS[idx] : null;
                  const unit = SCORING_UNITS[arena.scoring_model] || '';
                  return (
                    <tr key={p.user_id} className={`hover:bg-[#1A1A1A]/50 ${isTop3 ? 'bg-[#0A0A0A]' : ''}`}>
                      <td className="px-4 py-3">
                        {isTop3 && RankIcon ? (
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[idx]} flex items-center justify-center`}>
                            <RankIcon className="w-4 h-4 text-black" />
                          </div>
                        ) : (
                          <span className="text-[#808080] font-mono text-sm">#{p.rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center text-xs text-white">
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt={p.username} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              (p.username || '?')[0].toUpperCase()
                            )}
                          </div>
                          <span className={`text-sm font-medium ${isTop3 ? RANK_TEXT_COLORS[idx] : 'text-white'}`}>
                            {p.username}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-[#808080] flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {p.gym_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold ${isTop3 ? 'text-white' : 'text-[#808080]'}`}>
                          {Number(p.current_score).toLocaleString()} {unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-[#808080]">
                          {new Date(p.opted_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Participating Gyms */}
      {arena.gyms && arena.gyms.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#808080]" />
            Participating Gyms ({arena.gyms.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {arena.gyms.map((gym) => (
              <span
                key={gym.gym_id}
                className="text-xs bg-[#0A0A0A] border border-[#333] text-white px-3 py-1.5 rounded-lg"
              >
                {gym.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
