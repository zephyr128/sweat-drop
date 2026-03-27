'use client';

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import '@/lib/chart-setup';
import {
  getRetentionData,
  type RetentionKPIs,
  type DailyVisitors,
} from '@/lib/actions/retention-actions';
import { StatsCard } from '@/components/StatsCard';
import { AlertTriangle, Activity } from 'lucide-react';

interface RetentionStatsProps {
  gymId: string;
}

export function RetentionStats({ gymId }: RetentionStatsProps) {
  const [kpis, setKpis] = useState<RetentionKPIs | null>(null);
  const [dailyVisitors, setDailyVisitors] = useState<DailyVisitors[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await getRetentionData(gymId);
        if (res.success) {
          setKpis(res.kpis!);
          setDailyVisitors(res.dailyVisitors || []);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [gymId]);

  if (loading) {
    return (
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!kpis) return null;

  const visitTrend = kpis.visitsLastMonth > 0
    ? Math.round(((kpis.visitsThisMonth - kpis.visitsLastMonth) / kpis.visitsLastMonth) * 100)
    : 0;

  const chartData = {
    labels: dailyVisitors.map((d) => {
      const date = new Date(d.date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    }),
    datasets: [{
      label: 'Unique Visitors',
      data: dailyVisitors.map((d) => d.unique_visitors),
      borderColor: '#00E5FF',
      backgroundColor: 'rgba(0, 229, 255, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 1,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#00E5FF',
      borderWidth: 1.5,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0A0A0A',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
        padding: 8,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#808080', font: { size: 10 }, maxRotation: 45, minRotation: 45 },
      },
      y: {
        grid: { color: '#1A1A1A' },
        ticks: { color: '#808080', font: { size: 10 }, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          title="Active (7d)"
          value={`${kpis.activeMembers7d} / ${kpis.totalMembers}`}
          icon="Users"
          accent="cyan"
          priority="primary"
        />
        <StatsCard
          title="Visits This Month"
          value={kpis.visitsThisMonth}
          icon="Dumbbell"
          accent="emerald"
          trend={kpis.visitsLastMonth > 0 ? { value: Math.abs(visitTrend), isPositive: visitTrend >= 0 } : undefined}
        />
        <StatsCard
          title="Avg Sessions / Member"
          value={kpis.avgSessionsPerMember}
          icon="BarChart3"
          accent="blue"
        />
        <StatsCard
          title="Churn Rate"
          value={`${kpis.churnRate}%`}
          icon="Target"
          accent={kpis.churnRate > 10 ? 'rose' : 'emerald'}
        />
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Daily Unique Visitors</h3>
            <p className="text-[10px] text-zinc-500">Last 30 days</p>
          </div>
          {kpis.atRiskCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-3 h-3" />
              {kpis.atRiskCount} at risk
            </span>
          )}
        </div>
        <div className="h-44">
          {isClient ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="h-full bg-zinc-900/20 animate-pulse rounded-xl" />
          )}
        </div>
      </div>
    </div>
  );
}
