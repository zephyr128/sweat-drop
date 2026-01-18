'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type TimeFilter = 'today' | '7days' | '30days';

interface PopularHoursWidgetProps {
  hourlyTraffic: Array<{
    hour: number;
    scan_count: number;
  }>;
  timeFilter?: TimeFilter;
  maxValue?: number;
}

export function PopularHoursWidget({ hourlyTraffic, timeFilter: _timeFilter = '30days', maxValue }: PopularHoursWidgetProps) {
  const chartData = hourlyTraffic.map((item) => ({
    hour: `${String(item.hour).padStart(2, '0')}:00`,
    scans: item.scan_count,
  }));

  return (
    <div className="flex flex-col h-full">
      <h4 className="text-sm font-semibold text-white mb-1 flex-shrink-0">Popular Hours</h4>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ left: 5, right: 5, top: 5, bottom: 40 }} syncId="usageCharts">
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
            <XAxis 
              dataKey="hour" 
              stroke="#808080"
              tick={{ fill: '#808080', fontSize: 10 }}
              angle={-45}
              textAnchor="end"
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
            <Line 
              type="monotone" 
              dataKey="scans" 
              stroke="#00E5FF"
              strokeWidth={2}
              dot={{ fill: '#00E5FF', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hourlyTraffic.length === 0 && (
        <p className="text-center text-[#808080] text-xs mt-2 flex-shrink-0">No data available</p>
      )}
    </div>
  );
}
