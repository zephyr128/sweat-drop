'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MachineHeatmapWidgetProps {
  machineUsage: Array<{
    machine_id: string;
    machine_name: string;
    machine_type: 'treadmill' | 'bike';
    scan_count: number;
  }>;
}

export function MachineHeatmapWidget({ machineUsage }: MachineHeatmapWidgetProps) {
  // Aggregate by machine type
  const typeData = machineUsage.reduce(
    (acc, machine) => {
      const type = machine.machine_type === 'treadmill' ? 'Treadmill' : 'Bike';
      acc[type] = (acc[type] || 0) + machine.scan_count;
      return acc;
    },
    {} as Record<string, number>
  );

  const chartData = [
    {
      type: 'Treadmill',
      scans: typeData['Treadmill'] || 0,
    },
    {
      type: 'Bike',
      scans: typeData['Bike'] || 0,
    },
  ];

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Machine Usage (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
          <XAxis 
            dataKey="type" 
            stroke="#808080"
            tick={{ fill: '#808080' }}
          />
          <YAxis 
            stroke="#808080"
            tick={{ fill: '#808080' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0A0A0A',
              border: '1px solid #1A1A1A',
              borderRadius: '8px',
              color: '#fff',
            }}
            labelStyle={{ color: '#00E5FF' }}
          />
          <Bar 
            dataKey="scans" 
            fill="#00E5FF"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      {machineUsage.length === 0 && (
        <p className="text-center text-[#808080] mt-4">No machine usage data available</p>
      )}
    </div>
  );
}
