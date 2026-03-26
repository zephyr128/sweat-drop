'use client';

import Link from 'next/link';
import { AlertTriangle, ShieldAlert, Building2 } from 'lucide-react';

interface SuperGymRiskRow {
  gymId: string;
  gymName: string;
  location: string;
  unresolvedEvents: number;
  criticalEvents: number;
  avgDropsPerSession: number;
  suspended: boolean;
}

interface SuperRiskOverviewProps {
  totalGyms: number;
  gymsAtRisk: number;
  totalUnresolvedEvents: number;
  gyms: SuperGymRiskRow[];
}

export function SuperRiskOverview({
  totalGyms,
  gymsAtRisk,
  totalUnresolvedEvents,
  gyms,
}: SuperRiskOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Total Gyms</p>
          <p className="text-3xl font-bold text-white mt-1">{totalGyms}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Gyms At Risk</p>
          <p className="text-3xl font-bold text-amber-300 mt-1">{gymsAtRisk}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Unresolved Events</p>
          <p className="text-3xl font-bold text-rose-300 mt-1">{totalUnresolvedEvents}</p>
        </div>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1A1A1A] flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h3 className="text-white font-semibold">Network Risk Heatmap</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111]">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Gym</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Critical</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Unresolved</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Avg drops/session</th>
                <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {gyms.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-zinc-500 text-sm" colSpan={6}>
                    No gyms found.
                  </td>
                </tr>
              ) : (
                gyms.map((g) => (
                  <tr key={g.gymId} className="hover:bg-[#111]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-zinc-500" />
                        <span className="text-white text-sm">{g.gymName}</span>
                        {g.suspended ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Suspended
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-sm">{g.location || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${g.criticalEvents > 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-zinc-700/30 text-zinc-300'}`}>
                        {g.criticalEvents}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${g.unresolvedEvents >= 5 ? 'bg-amber-500/15 text-amber-300' : 'bg-zinc-700/30 text-zinc-300'}`}>
                        {g.unresolvedEvents}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-cyan-300 text-sm">{g.avgDropsPerSession}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/gym/${g.gymId}/risk`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Open Risk
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
