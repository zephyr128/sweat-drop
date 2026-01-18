'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type TimeFilter = 'today' | '7days' | '30days';

interface MachineHeatmapWidgetProps {
  machineUsage: Array<{
    machine_id: string;
    machine_name: string;
    machine_type: 'treadmill' | 'bike';
    scan_count: number;
  }>;
  timeFilter?: TimeFilter;
  maxValue?: number;
}

export function MachineHeatmapWidget({ machineUsage, timeFilter: _timeFilter = '30days', maxValue }: MachineHeatmapWidgetProps) {
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
    <div className="flex flex-col h-full">
      <h4 className="text-sm font-semibold text-white mb-1 flex-shrink-0">Machine Usage</h4>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ left: 5, right: 5, top: 5, bottom: 40 }} syncId="usageCharts">
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
            <XAxis 
              dataKey="type" 
              stroke="#808080"
              tick={{ fill: '#808080', fontSize: 12 }}
              height={40}
              padding={{ left: 0, right: 0 }}
            />
            <YAxis 
              stroke="#808080"
              tick={{ fill: '#808080', fontSize: 12 }}
              width={45}
              domain={maxValue ? [0, Math.ceil(maxValue * 1.1)] : [0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0A0A0A',
                border: '1px solid #333',
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
      </div>
      {machineUsage.length === 0 && (
        <p className="text-center text-[#808080] text-xs mt-2 flex-shrink-0">No data available</p>
      )}
    </div>
  );
}
