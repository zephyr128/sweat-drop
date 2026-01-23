'use client';

import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Activity } from 'lucide-react';
import '@/lib/chart-setup';

export function MachineHeatmapWidget({ machineUsage }: any) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 1. Prevent Hydration Mismatch & Layout Thrashing
  if (!isClient) {
    return <div className="h-[300px] w-full bg-zinc-900/20 animate-pulse rounded-xl" />;
  }

  // 2. Process data - Dinamički obrađujemo bilo koji tip mašine koji stigne
  const typeData = (machineUsage || []).reduce((acc: any, machine: any) => {
    const type = machine.machine_type || 'Unknown';
    acc[type] = (acc[type] || 0) + Number(machine.scan_count || 0);
    return acc;
  }, {});

  const chartData = Object.keys(typeData).map(type => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    scans: typeData[type]
  }));

  const hasData = chartData.length > 0 && chartData.some(d => d.scans > 0);

  // 3. Chart.js data configuration
  const data = {
    labels: chartData.map(item => item.name),
    datasets: [
      {
        label: 'Scans',
        data: chartData.map(item => item.scans),
        backgroundColor: '#00E5FF',
        borderRadius: 4,
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
      <h4 className="text-sm font-semibold text-white mb-4">Machine Usage</h4>
      <div className="w-full h-[300px]">
        {hasData ? (
          <Bar data={data} options={options} />
        ) : (
          <div className="flex items-center justify-center h-full border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-500 text-xs">No machine data yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
