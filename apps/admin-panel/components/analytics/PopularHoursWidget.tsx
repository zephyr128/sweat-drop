'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PopularHoursWidgetProps {
  hourlyTraffic: Array<{
    hour: number;
    scan_count: number;
  }>;
}

export function PopularHoursWidget({ hourlyTraffic }: PopularHoursWidgetProps) {
  const chartData = hourlyTraffic.map((item) => ({
    hour: `${String(item.hour).padStart(2, '0')}:00`,
    scans: item.scan_count,
  }));

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Popular Hours (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
          <XAxis 
            dataKey="hour" 
            stroke="#808080"
            tick={{ fill: '#808080', fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
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
          <Line 
            type="monotone" 
            dataKey="scans" 
            stroke="#00E5FF"
            strokeWidth={2}
            dot={{ fill: '#00E5FF', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      {hourlyTraffic.length === 0 && (
        <p className="text-center text-[#808080] mt-4">No hourly traffic data available</p>
      )}
    </div>
  );
}
