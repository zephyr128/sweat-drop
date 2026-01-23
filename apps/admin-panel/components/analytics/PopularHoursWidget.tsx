'use client';

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Clock } from 'lucide-react';
import '@/lib/chart-setup';

export function PopularHoursWidget({ hourlyTraffic }: any) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 1. Prevent Hydration Mismatch & Layout Thrashing
  if (!isClient) {
    return <div className="h-[300px] w-full bg-zinc-900/20 animate-pulse rounded-xl" />;
  }

  // 2. Process data
  const chartData = hourlyTraffic.map((item: any) => ({
    hour: `${String(item.hour).padStart(2, '0')}:00`,
    scans: Number(item.scan_count || 0),
  }));

  const hasData = chartData.some(item => item.scans > 0);

  // 3. Chart.js data configuration
  const data = {
    labels: chartData.map(item => item.hour),
    datasets: [
      {
        label: 'Scans',
        data: chartData.map(item => item.scans),
        borderColor: '#00E5FF',
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#00E5FF',
        pointHoverBorderColor: '#00E5FF',
        pointHoverBorderWidth: 2,
      },
    ],
  };

  // 4. Chart.js options (Dark Mode Cyberpunk)
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false, // KLJUČNO: Ne mora da se pogodi tačka mišem
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        backgroundColor: '#0A0A0A',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
        padding: 10,
        displayColors: false, // Sklanja kockicu boje pored teksta
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          color: '#808080',
          font: {
            size: 11,
            family: 'system-ui, -apple-system, sans-serif',
          },
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        grid: {
          color: '#1A1A1A',
          drawBorder: false,
        },
        ticks: {
          color: '#808080',
          font: {
            size: 11,
            family: 'system-ui, -apple-system, sans-serif',
          },
          stepSize: 1,
        },
        beginAtZero: true,
      },
    },
  };

  // 5. Render chart ONLY when browser has calculated layout
  return (
    <div className="flex flex-col w-full">
      <h4 className="text-sm font-semibold text-white mb-4">Popular Hours</h4>
      <div className="w-full h-[300px]">
        {hasData ? (
          <Line data={data} options={options} />
        ) : (
          <div className="flex items-center justify-center h-full border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-500 text-xs">No data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
