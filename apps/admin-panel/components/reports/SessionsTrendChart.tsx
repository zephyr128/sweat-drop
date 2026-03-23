'use client';

import '@/lib/chart-setup';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';

export interface TrendWeek {
  week_start: string;
  sessions_count: number;
  unique_members: number;
  drops_earned: number;
}

interface SessionsTrendChartProps {
  data: TrendWeek[];
}

export function SessionsTrendChart({ data }: SessionsTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <section>
        <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Sessions Trend</h3>
        <div className="border-t border-zinc-800 pt-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 text-center text-zinc-500">
            No trend data for this period
          </div>
        </div>
      </section>
    );
  }

  const labels = data.map((w) => {
    const d = new Date(w.week_start);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Sessions',
        data: data.map((w) => w.sessions_count),
        borderColor: '#00E5FF',
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
      {
        label: 'Unique Members',
        data: data.map((w) => w.unique_members),
        borderColor: '#808080',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: { color: '#808080', font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: '#1A1A1A',
        borderColor: '#333',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#999',
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(128,128,128,0.1)' },
        ticks: { color: '#808080', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(128,128,128,0.1)' },
        ticks: { color: '#808080', font: { size: 10 } },
        beginAtZero: true,
      },
    },
  };

  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Sessions Trend (12 weeks)</h3>
      <div className="border-t border-zinc-800 pt-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
          <div className="h-64">
            <Line data={chartData} options={options} />
          </div>
        </div>
      </div>
    </section>
  );
}
