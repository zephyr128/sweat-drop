'use client';

import { useEffect } from 'react';
import type { PlatformData, GymBreakdownRow } from './PlatformKPIs';

interface PlatformReportPrintViewProps {
  periodLabel: string;
  data: PlatformData | null;
}

function KPIBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 text-center">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

export function PlatformReportPrintView({ periodLabel, data }: PlatformReportPrintViewProps) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, []);

  const generated = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <>
      <style jsx global>{`
        @page { size: A4; margin: 15mm 12mm; }
        html, body {
          background: white !important;
          color: #111 !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print { .no-print { display: none !important; } }
      `}</style>

      <div className="min-h-screen bg-white text-gray-900 p-8 max-w-[210mm] mx-auto">
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

        <header className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="text-lg font-bold text-gray-900 tracking-tight">SweatDrop</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Platform Report</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900">Network Overview</h1>
            <p className="text-sm text-gray-500 mt-1">Period: {periodLabel}</p>
            <p className="text-xs text-gray-400">Generated: {generated}</p>
          </div>
        </header>

        {!data ? (
          <p className="text-gray-500 text-center py-12">No data available for this period.</p>
        ) : (
          <>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">
              Platform Overview
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <KPIBox label="Active Gyms" value={data.total_gyms} />
              <KPIBox label="Total Users" value={data.total_users} />
              <KPIBox label="MAU" value={data.mau} />
              <KPIBox label="Total Sessions" value={data.total_sessions} />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-8">
              <KPIBox label="Drops Earned" value={data.total_drops_earned} />
              <KPIBox label="Redemptions" value={data.total_redemptions} />
              <KPIBox label="Arenas Created" value={data.total_arenas} />
            </div>

            {data.per_gym && data.per_gym.length > 0 && (
              <>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4 mt-8">
                  Per Gym Breakdown
                </h2>
                <table className="w-full text-sm mb-6">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 text-left text-xs text-gray-500 font-medium">Gym</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Members</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Sessions</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">MAU</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Drops</th>
                      <th className="py-2 text-right text-xs text-gray-500 font-medium">Redemptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_gym.map((g: GymBreakdownRow) => (
                      <tr key={g.gym_id} className="border-b border-gray-100">
                        <td className="py-1.5 font-medium text-gray-900">{g.gym_name}</td>
                        <td className="py-1.5 text-right text-gray-600 tabular-nums">{g.registered_members}</td>
                        <td className="py-1.5 text-right text-gray-600 tabular-nums">{g.sessions_count.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-gray-900 font-medium tabular-nums">{g.active_members}</td>
                        <td className="py-1.5 text-right text-gray-600 tabular-nums">{g.drops_earned.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-gray-600 tabular-nums">{g.redemptions_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        <footer className="mt-12 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-cyan-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">S</span>
            </div>
            <span>Powered by SweatDrop</span>
          </div>
          <span>Platform Report &middot; {periodLabel} &middot; {generated}</span>
        </footer>
      </div>
    </>
  );
}
