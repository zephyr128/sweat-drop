'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Line } from 'react-chartjs-2';
import '@/lib/chart-setup';
import {
  getRetentionData,
  RetentionKPIs,
  DailyVisitors,
  AtRiskMember,
} from '@/lib/actions/retention-actions';
import { StatsCard } from '@/components/StatsCard';
import {
  Users,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Activity,
  Droplet,
  Flame,
  Clock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/date';
import { MemberAvatar } from '@/components/MemberAvatar';

interface RetentionDashboardProps {
  gymId: string;
}

export function RetentionDashboard({ gymId }: RetentionDashboardProps) {
  const router = useRouter();
  const [kpis, setKpis] = useState<RetentionKPIs | null>(null);
  const [dailyVisitors, setDailyVisitors] = useState<DailyVisitors[]>([]);
  const [atRiskMembers, setAtRiskMembers] = useState<AtRiskMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await getRetentionData(gymId);
        if (res.success) {
          setKpis(res.kpis!);
          setDailyVisitors(res.dailyVisitors || []);
          setAtRiskMembers(res.atRiskMembers || []);
        } else {
          setError(res.error || 'Failed to load retention data');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (gymId) {
      fetchData();
    }
  }, [gymId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0A0A0A] border border-[#FF5252]/30 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-[#FF5252] mx-auto mb-2" />
        <p className="text-[#FF5252]">{error}</p>
      </div>
    );
  }

  if (!kpis) return null;

  // Visit trend calculation
  const visitTrend = kpis.visitsLastMonth > 0
    ? Math.round(((kpis.visitsThisMonth - kpis.visitsLastMonth) / kpis.visitsLastMonth) * 100)
    : 0;

  // Chart data
  const chartData = {
    labels: dailyVisitors.map((d) => {
      const date = new Date(d.date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    }),
    datasets: [
      {
        label: 'Unique Visitors',
        data: dailyVisitors.map((d) => d.unique_visitors),
        borderColor: '#00E5FF',
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#00E5FF',
        pointHoverBorderColor: '#00E5FF',
        pointHoverBorderWidth: 2,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0A0A0A',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#808080',
          font: { size: 11 },
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        grid: { color: '#1A1A1A' },
        ticks: {
          color: '#808080',
          font: { size: 11 },
          stepSize: 1,
        },
        beginAtZero: true,
      },
    },
  };

  const statusBadge = (status: 'at_risk' | 'churned') => {
    if (status === 'at_risk') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-3 h-3" />
          At Risk
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <TrendingDown className="w-3 h-3" />
        Churned
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Members (7d)"
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
          trend={kpis.visitsLastMonth > 0 ? {
            value: Math.abs(visitTrend),
            isPositive: visitTrend >= 0,
          } : undefined}
        />
        <StatsCard
          title="Avg Sessions / Member"
          value={kpis.avgSessionsPerMember}
          icon="BarChart3"
          accent="blue"
        />
        <StatsCard
          title="At-Risk Members"
          value={kpis.atRiskCount}
          icon="Target"
          accent="rose"
          priority={kpis.atRiskCount > 5 ? 'primary' : 'secondary'}
        />
      </div>

      {/* Churn Rate Banner */}
      <div className="bg-gradient-to-r from-[#0A0A0A] to-[#111] border border-[#1A1A1A] rounded-xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-rose-500/10 flex items-center justify-center">
            <Activity className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <p className="text-xs text-[#808080] uppercase tracking-wider mb-1">Churn Rate</p>
            <p className="text-3xl font-bold text-white">
              {kpis.churnRate}
              <span className="text-lg text-[#808080]">%</span>
            </p>
          </div>
        </div>
        <p className="text-sm text-[#808080] max-w-xs text-right">
          Members with no activity for 30+ days
        </p>
      </div>

      {/* Daily Visitors Chart */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h3 className="text-base font-semibold text-white mb-1">Daily Unique Visitors</h3>
        <p className="text-xs text-[#808080] mb-6">Last 30 days</p>
        <div className="h-72">
          {isClient ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="h-full bg-zinc-900/20 animate-pulse rounded-xl" />
          )}
        </div>
      </div>

      {/* At-Risk Members Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#1A1A1A]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">At-Risk & Churned Members</h3>
              <p className="text-xs text-[#808080] mt-1">
                Members inactive for 7+ days. Reach out to re-engage them.
              </p>
            </div>
            <span className="text-sm font-medium text-[#808080]">
              {atRiskMembers.length} member{atRiskMembers.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {atRiskMembers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-medium">All members are active!</p>
            <p className="text-sm text-[#808080] mt-1">No at-risk members found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1A1A1A]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider">Member</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <Droplet className="w-3 h-3" />
                      Drops
                    </div>
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last Visit
                    </div>
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <Flame className="w-3 h-3" />
                      Streak
                    </div>
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {atRiskMembers.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => router.push(`/dashboard/gym/${gymId}/members/${member.id}`)}
                    className="hover:bg-[#111] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          avatarUrl={member.avatar_url}
                          username={member.username}
                          size="md"
                        />
                        <div>
                          <p className="text-sm font-medium text-white">{member.username}</p>
                          <p className="text-xs text-[#808080]">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-[#00E5FF]">
                        {member.total_drops.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-white">
                          {member.last_visit_date
                            ? formatDate(member.last_visit_date)
                            : 'Never'}
                        </p>
                        <p className="text-xs text-[#808080]">
                          {member.days_inactive < 999
                            ? `${member.days_inactive}d ago`
                            : 'No visits'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Flame className={`w-4 h-4 ${member.streak_days > 0 ? 'text-amber-400' : 'text-[#333]'}`} />
                        <span className="text-sm text-white">{member.streak_days}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {statusBadge(member.status as 'at_risk' | 'churned')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
