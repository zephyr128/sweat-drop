'use client';

import { Activity, Clock, Zap, Trophy } from 'lucide-react';

interface KPICardsProps {
  kpi: {
    total_sessions: number;
    total_drops: number;
    avg_duration_min: number;
    unique_users: number;
    avg_sessions_per_day: number;
  };
  peakHour: { hour: number; sessions: number } | null;
  busiestMachine: { name: string; type: string; sessions: number } | null;
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

export function KPICards({ kpi, peakHour, busiestMachine }: KPICardsProps) {
  const cards = [
    {
      label: 'Total Sessions',
      value: kpi.total_sessions.toLocaleString(),
      sub: `${kpi.avg_sessions_per_day}/day avg`,
      icon: Activity,
      accent: '#00E5FF',
    },
    {
      label: 'Avg Duration',
      value: `${kpi.avg_duration_min} min`,
      sub: `${kpi.unique_users} unique users`,
      icon: Clock,
      accent: '#FF9100',
    },
    {
      label: 'Peak Hour',
      value: peakHour ? formatHour(peakHour.hour) : '—',
      sub: peakHour ? `${peakHour.sessions} sessions` : 'No data',
      icon: Zap,
      accent: '#FACC15',
    },
    {
      label: 'Top Machine',
      value: busiestMachine?.name || '—',
      sub: busiestMachine ? `${busiestMachine.sessions} sessions` : 'No data',
      icon: Trophy,
      accent: '#A78BFA',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 flex flex-col gap-1"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#808080] uppercase tracking-wider">
              {card.label}
            </span>
            <card.icon className="w-4 h-4" style={{ color: card.accent }} />
          </div>
          <span className="text-2xl font-bold text-white truncate">{card.value}</span>
          <span className="text-xs text-[#808080]">{card.sub}</span>
        </div>
      ))}
    </div>
  );
}
