'use client';

export interface ArenaReportRow {
  arena_id: string;
  arena_name: string;
  sponsor_name: string | null;
  participants_count: number;
  gym_participants_count: number;
  arena_start: string;
  arena_end: string;
  derived_status: string;
  prizes: Array<{ rank: number; prize: string; value?: string }> | null;
  revenue_share_pct: number;
}

interface ArenaReportTableProps {
  data: ArenaReportRow[];
}

const statusColors: Record<string, string> = {
  live: 'bg-green-500/10 text-green-400 border-green-500/20',
  ended: 'bg-zinc-700/30 text-zinc-500 border-zinc-700/20',
  upcoming: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  inactive: 'bg-zinc-700/30 text-zinc-500 border-zinc-700/20',
};

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ArenaReportTable({ data }: ArenaReportTableProps) {
  if (!data || data.length === 0) {
    return (
      <section>
        <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Sweat Arenas</h3>
        <div className="border-t border-zinc-800 pt-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 text-center text-zinc-500">
            No arena data for this period
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Sweat Arenas</h3>
      <div className="border-t border-zinc-800 pt-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium">Arena</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium">Sponsor</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Your Participants</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Total</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium">Period</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-center">Status</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Rev. Share</th>
                </tr>
              </thead>
              <tbody>
                {data.map((arena) => (
                  <tr key={arena.arena_id} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm text-white font-medium">{arena.arena_name}</div>
                      {arena.prizes && arena.prizes.length > 0 && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          🏆 {arena.prizes[0].prize}{arena.prizes[0].value ? ` (${arena.prizes[0].value})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{arena.sponsor_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{arena.gym_participants_count}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{arena.participants_count}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {formatDate(arena.arena_start)} — {formatDate(arena.arena_end)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[arena.derived_status] || statusColors.inactive}`}>
                        {arena.derived_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right">{arena.revenue_share_pct}%</td>
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
