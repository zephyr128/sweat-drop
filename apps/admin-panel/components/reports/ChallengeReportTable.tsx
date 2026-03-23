'use client';

export interface ChallengeReportRow {
  challenge_id: string;
  challenge_name: string;
  challenge_type: string;
  total_participants: number;
  completions: number;
  completion_rate: number;
}

interface ChallengeReportTableProps {
  data: ChallengeReportRow[];
}

const typeLabels: Record<string, string> = {
  drops: 'Drops',
  duration: 'Duration',
  streak: 'Streak',
  checkin_count: 'Check-in Count',
  checkin_streak: 'Check-in Streak',
};

const typeColors: Record<string, string> = {
  drops: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  duration: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  streak: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  checkin_count: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  checkin_streak: 'bg-green-500/10 text-green-400 border-green-500/20',
};

export function ChallengeReportTable({ data }: ChallengeReportTableProps) {
  if (!data || data.length === 0) {
    return (
      <section>
        <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Challenges</h3>
        <div className="border-t border-zinc-800 pt-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 text-center text-zinc-500">
            No challenge data for this period
          </div>
        </div>
      </section>
    );
  }

  const totalCompleted = data.reduce((s, c) => s + c.completions, 0);
  const avgRate = data.length > 0
    ? Math.round(data.reduce((s, c) => s + (c.completion_rate || 0), 0) / data.length)
    : 0;
  const mostPopular = data.reduce((best, c) =>
    c.total_participants > (best?.total_participants || 0) ? c : best, data[0]);

  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Challenges</h3>
      <div className="border-t border-zinc-800 pt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase mb-1">Completed</div>
            <div className="text-xl font-bold text-white">{totalCompleted}</div>
          </div>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase mb-1">Avg Completion Rate</div>
            <div className="text-xl font-bold text-white">{avgRate}%</div>
          </div>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase mb-1">Most Popular</div>
            <div className="text-lg font-bold text-white truncate">{mostPopular?.challenge_name || '—'}</div>
            <div className="text-xs text-zinc-400">{mostPopular?.total_participants || 0} participants</div>
          </div>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium">Challenge</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-center">Type</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Participants</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Completions</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.map((ch) => (
                  <tr key={ch.challenge_id} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{ch.challenge_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${typeColors[ch.challenge_type] || 'bg-zinc-700/30 text-zinc-400 border-zinc-700/20'}`}>
                        {typeLabels[ch.challenge_type] || ch.challenge_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{ch.total_participants}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{ch.completions}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#00E5FF] rounded-full transition-all"
                            style={{ width: `${Math.min(ch.completion_rate || 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400 tabular-nums w-10 text-right">{ch.completion_rate ?? 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
