'use client';

import { useEffect } from 'react';
import type { EngagementData, TopMember } from './EngagementKPIs';
import type { StoreReportRow } from './StoreReportTable';
import type { ArenaReportRow } from './ArenaReportTable';
import type { ChallengeReportRow } from './ChallengeReportTable';
import type { TrendWeek } from './SessionsTrendChart';

interface GymReportPrintViewProps {
  gymName: string;
  gymLocation: string;
  periodLabel: string;
  engagement: EngagementData | null;
  store: StoreReportRow[];
  arenas: ArenaReportRow[];
  trend: TrendWeek[];
  challenges: ChallengeReportRow[];
}

function KPIBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 text-center">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4 mt-8">
      {children}
    </h2>
  );
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function GymReportPrintView({
  gymName,
  gymLocation,
  periodLabel,
  engagement,
  store,
  arenas,
  trend,
  challenges,
}: GymReportPrintViewProps) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, []);

  const generated = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const circulationPct = engagement && engagement.total_drops_earned > 0
    ? Math.round((engagement.total_drops_spent / engagement.total_drops_earned) * 100)
    : 0;

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 15mm 12mm;
        }
        html, body {
          background: white !important;
          color: #111 !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      <div className="min-h-screen bg-white text-gray-900 p-8 max-w-[210mm] mx-auto">
        {/* Print button (hidden during print) */}
        <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
          <button
            onClick={() => window.print()}
            className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-lg"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={() => window.close()}
            className="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Header */}
        <header className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="text-lg font-bold text-gray-900 tracking-tight">SweatDrop</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Gym Analytics Report</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900">{gymName}</h1>
            {gymLocation && <p className="text-sm text-gray-500">{gymLocation}</p>}
            <p className="text-sm text-gray-500 mt-1">Period: {periodLabel}</p>
            <p className="text-xs text-gray-400">Generated: {generated}</p>
          </div>
        </header>

        {engagement && (
          <>
            {/* Engagement KPIs */}
            <SectionTitle>Engagement</SectionTitle>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <KPIBox label="Total Sessions" value={engagement.total_sessions} />
              <KPIBox label="Avg Duration" value={`${engagement.avg_session_duration_min} min`} />
              <KPIBox label="Active Members" value={engagement.total_active_members} sub={`trained here`} />
              <KPIBox label="Avg Visits / Member" value={engagement.avg_visits_per_member ?? 0} sub={`${engagement.total_checkins.toLocaleString()} check-ins`} />
            </div>

            {/* Drops Economy */}
            <SectionTitle>Drops Economy</SectionTitle>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <KPIBox label="Drops Earned" value={engagement.total_drops_earned} />
              <KPIBox label="Drops Spent" value={engagement.total_drops_spent} sub="confirmed" />
              <KPIBox label="Circulation" value={`${circulationPct}%`} sub="spent / earned" />
            </div>

            {/* Members */}
            <SectionTitle>Members</SectionTitle>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <KPIBox label="Registered" value={engagement.total_registered_members} />
              <KPIBox label="Active" value={engagement.total_active_members} />
              <KPIBox label="Inactive 14d+" value={engagement.inactive_14d} />
              <KPIBox label="Avg Streak" value={`${engagement.avg_streak_days}d`} />
            </div>

            {/* Top Members */}
            {engagement.top_members && engagement.top_members.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Top Members by Drops</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 text-left text-xs text-gray-500 font-medium">#</th>
                      <th className="py-2 text-left text-xs text-gray-500 font-medium">Member</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Sessions</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Drops</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagement.top_members.map((m: TopMember, i: number) => (
                      <tr key={m.username} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 font-medium text-gray-900">{m.username}</td>
                        <td className="py-1.5 text-right text-gray-600 tabular-nums">{m.sessions_count}</td>
                        <td className="py-1.5 text-right text-gray-900 font-medium tabular-nums">{m.drops_earned.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-gray-600">{m.streak_days > 0 ? `${m.streak_days}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Challenges */}
            <SectionTitle>Challenges</SectionTitle>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <KPIBox label="Completed" value={engagement.challenges_completed} />
              <KPIBox label="Active Challenges" value={engagement.active_challenges_count} />
              <KPIBox label="Avg Streak" value={`${engagement.avg_streak_days}d`} />
            </div>
          </>
        )}

        {challenges.length > 0 && (
          <div className="mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Challenge</th>
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Type</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Participants</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Completions</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {challenges.map((c: ChallengeReportRow) => (
                  <tr key={c.challenge_id} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium text-gray-900">{c.challenge_name}</td>
                    <td className="py-1.5">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                        {c.challenge_type}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{c.total_participants}</td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{c.completions}</td>
                    <td className="py-1.5 text-right text-gray-900 font-medium tabular-nums">{c.completion_rate ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Store */}
        {store.length > 0 && (
          <>
            <SectionTitle>Store Performance</SectionTitle>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Item</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Price</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Redemptions</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Drops Spent</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Pending</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Confirmed</th>
                  <th className="py-2 text-center text-xs text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {store.map((item: StoreReportRow) => (
                  <tr key={item.item_id} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium text-gray-900">{item.item_name}</td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{item.price_drops}</td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{item.redemptions_count}</td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{item.total_drops_spent.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-yellow-600 tabular-nums">{item.pending_count}</td>
                    <td className="py-1.5 text-right text-green-600 tabular-nums">{item.confirmed_count}</td>
                    <td className="py-1.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                        item.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="py-2 text-gray-900">Total</td>
                  <td className="py-2" />
                  <td className="py-2 text-right text-gray-900 tabular-nums">{store.reduce((s, r) => s + r.redemptions_count, 0)}</td>
                  <td className="py-2 text-right text-gray-900 tabular-nums">{store.reduce((s, r) => s + r.total_drops_spent, 0).toLocaleString()}</td>
                  <td className="py-2 text-right text-yellow-600 tabular-nums">{store.reduce((s, r) => s + r.pending_count, 0)}</td>
                  <td className="py-2 text-right text-green-600 tabular-nums">{store.reduce((s, r) => s + r.confirmed_count, 0)}</td>
                  <td className="py-2" />
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {/* Arenas */}
        {arenas.length > 0 && (
          <>
            <div className="page-break" />
            <SectionTitle>Sweat Arenas</SectionTitle>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Arena</th>
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Sponsor</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Your</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Total</th>
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Period</th>
                  <th className="py-2 text-center text-xs text-gray-500 font-medium">Status</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Rev. Share</th>
                </tr>
              </thead>
              <tbody>
                {arenas.map((a: ArenaReportRow) => (
                  <tr key={a.arena_id} className="border-b border-gray-100">
                    <td className="py-1.5">
                      <div className="font-medium text-gray-900">{a.arena_name}</div>
                      {a.prizes && a.prizes.length > 0 && (
                        <div className="text-xs text-gray-500">{a.prizes[0].prize}</div>
                      )}
                    </td>
                    <td className="py-1.5 text-gray-600">{a.sponsor_name || '—'}</td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{a.gym_participants_count}</td>
                    <td className="py-1.5 text-right text-gray-600 tabular-nums">{a.participants_count}</td>
                    <td className="py-1.5 text-xs text-gray-500">
                      {formatDate(a.arena_start)} — {formatDate(a.arena_end)}
                    </td>
                    <td className="py-1.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                        a.derived_status === 'live' ? 'bg-green-50 text-green-700' :
                        a.derived_status === 'upcoming' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {a.derived_status}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-gray-600">{a.revenue_share_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Trend mini-table */}
        {trend.length > 0 && (
          <>
            <SectionTitle>Weekly Sessions Trend</SectionTitle>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs text-gray-500 font-medium">Week</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Sessions</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Unique Members</th>
                  <th className="py-2 text-right text-xs text-gray-500 font-medium">Drops Earned</th>
                  <th className="py-2 text-left text-xs text-gray-500 font-medium" style={{ width: '30%' }}>Activity</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((w: TrendWeek) => {
                  const maxSessions = Math.max(...trend.map(t => t.sessions_count), 1);
                  const barWidth = Math.round((w.sessions_count / maxSessions) * 100);
                  return (
                    <tr key={w.week_start} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-600">{formatDate(w.week_start)}</td>
                      <td className="py-1.5 text-right text-gray-900 font-medium tabular-nums">{w.sessions_count}</td>
                      <td className="py-1.5 text-right text-gray-600 tabular-nums">{w.unique_members}</td>
                      <td className="py-1.5 text-right text-gray-600 tabular-nums">{w.drops_earned.toLocaleString()}</td>
                      <td className="py-1.5">
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-cyan-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">S</span>
            </div>
            <span>Powered by SweatDrop</span>
          </div>
          <span>{gymName} &middot; {periodLabel} &middot; {generated}</span>
        </footer>
      </div>
    </>
  );
}
