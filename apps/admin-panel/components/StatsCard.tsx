'use client';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  gradient?: 'cyan' | 'orange';
}

export function StatsCard({ title, value, icon, trend, gradient = 'cyan' }: StatsCardProps) {
  const gradientClass =
    gradient === 'cyan'
      ? 'from-[#00E5FF]/20 to-[#00B8CC]/10'
      : 'from-[#FF9100]/20 to-[#CC7400]/10';

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 backdrop-blur-sm bg-opacity-50">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg bg-gradient-to-br ${gradientClass}`}>
          <span className="text-2xl">{icon}</span>
        </div>
        {trend && (
          <div
            className={`text-sm font-medium ${
              trend.isPositive ? 'text-[#00E5FF]' : 'text-[#FF5252]'
            }`}
          >
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <h3 className="text-sm text-[#808080] mb-1 uppercase tracking-wide">{title}</h3>
      <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
